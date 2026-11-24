import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./styles.css";

type PublicConfig = {
  api_base_url: string;
  wow_root: string;
  auto_upload: boolean;
  username: string;
  guild_id: string;
  guild_name: string;
  has_token: boolean;
};

type LogRow = { level: string; message: string; at?: string };

const logs: LogRow[] = [];

function el(html: string) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

const root = document.getElementById("app")!;
root.appendChild(
  el(`
  <header>
    <h1>WGA Sync</h1>
    <p class="disclaimer">监听本地快照并上传到自建 API</p>
  </header>
  <section class="card">
    <h2>连接</h2>
    <label>API 地址<input id="apiBaseUrl" type="text" /></label>
    <label>无限服目录<div class="row"><input id="wowRoot" type="text" readonly /><button type="button" id="btnPickWow">浏览</button></div></label>
    <label class="check"><input id="autoUpload" type="checkbox" /> 自动上传</label>
    <button type="button" id="btnSaveSettings">保存设置</button>
  </section>
  <section class="card">
    <h2>账号</h2>
    <div id="loggedOut">
      <label>用户名<input id="username" type="text" /></label>
      <label>密码<input id="password" type="password" /></label>
      <div class="row">
        <button type="button" id="btnLogin">登录</button>
        <button type="button" id="btnRegister" class="secondary">注册</button>
      </div>
    </div>
    <div id="loggedIn" class="hidden">
      <p>当前用户：<strong id="currentUser"></strong></p>
      <button type="button" id="btnLogout" class="secondary">退出登录</button>
    </div>
  </section>
  <section class="card">
    <h2>公会</h2>
    <p>当前：<strong id="currentGuild">未选择</strong></p>
    <div class="row"><input id="guildName" type="text" placeholder="新公会名称" /><button type="button" id="btnCreateGuild">创建</button></div>
    <div class="row"><input id="inviteCode" type="text" placeholder="邀请码" /><button type="button" id="btnJoinGuild">加入</button></div>
    <div id="guildList"></div>
  </section>
  <section class="card">
    <h2>同步</h2>
    <button type="button" id="btnUpload">立即上传最新快照</button>
    <p class="hint">游戏内 <code>/wga snapshot</code>，再 <code>/reload</code> 或小退。</p>
  </section>
  <section class="card">
    <h2>日志</h2>
    <ul id="logList"></ul>
  </section>
`)
);

const $ = (id: string) => document.getElementById(id)!;

function renderLogs() {
  const ul = $("logList");
  ul.innerHTML = "";
  for (const row of logs.slice(0, 50)) {
    const li = document.createElement("li");
    li.className = row.level || "";
    li.textContent = `[${row.level}] ${row.message}`;
    ul.appendChild(li);
  }
}

function applyConfig(c: PublicConfig) {
  ($("apiBaseUrl") as HTMLInputElement).value = c.api_base_url;
  ($("wowRoot") as HTMLInputElement).value = c.wow_root;
  ($("autoUpload") as HTMLInputElement).checked = c.auto_upload;
  if (c.has_token) {
    $("loggedOut").classList.add("hidden");
    $("loggedIn").classList.remove("hidden");
    $("currentUser").textContent = c.username;
  } else {
    $("loggedIn").classList.add("hidden");
    $("loggedOut").classList.remove("hidden");
  }
  $("currentGuild").textContent = c.guild_name
    ? `${c.guild_name}`
    : c.guild_id || "未选择";
}

async function refreshConfig() {
  const c = await invoke<PublicConfig>("get_config");
  applyConfig(c);
}

async function refreshGuilds() {
  const box = $("guildList");
  box.innerHTML = "";
  try {
    const me = await invoke<{ guilds: Array<{ id: string; name: string; role: string; invite_code: string }> }>("me");
    const cfg = await invoke<PublicConfig>("get_config");
    for (const g of me.guilds || []) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `${g.name} · ${g.role} · 邀请码 ${g.invite_code}`;
      if (g.id === cfg.guild_id) btn.classList.add("active");
      btn.onclick = async () => {
        await invoke("select_guild", { id: g.id, name: g.name });
        await refreshConfig();
        await refreshGuilds();
      };
      box.appendChild(btn);
    }
  } catch {
    /* not logged in */
  }
}

function pushLog(level: string, message: string) {
  logs.unshift({ level, message, at: new Date().toISOString() });
  renderLogs();
}

async function boot() {
  await refreshConfig();
  await refreshGuilds();

  await listen<{ level: string; message: string }>("wga-log", (e) => {
    pushLog(e.payload.level, e.payload.message);
  });

  await listen<{ path: string }>("wga-sv-changed", async (e) => {
    pushLog("info", `检测到变更: ${e.payload.path}`);
    try {
      await invoke("upload_path", { path: e.payload.path });
    } catch (err) {
      pushLog("error", String(err));
    }
  });

  $("btnSaveSettings").onclick = async () => {
    await invoke("save_settings", {
      apiBaseUrl: ($("apiBaseUrl") as HTMLInputElement).value.trim(),
      autoUpload: ($("autoUpload") as HTMLInputElement).checked,
      wowRoot: null,
    });
    await refreshConfig();
  };

  $("btnPickWow").onclick = async () => {
    await invoke("pick_wow_root");
    await refreshConfig();
  };

  $("btnLogin").onclick = async () => {
    try {
      await invoke("login", {
        username: ($("username") as HTMLInputElement).value.trim(),
        password: ($("password") as HTMLInputElement).value,
      });
      await refreshConfig();
      await refreshGuilds();
    } catch (e) {
      alert("登录失败: " + e);
    }
  };

  $("btnRegister").onclick = async () => {
    try {
      const u = ($("username") as HTMLInputElement).value.trim();
      await invoke("register", {
        username: u,
        password: ($("password") as HTMLInputElement).value,
        displayName: u,
      });
      await refreshConfig();
      await refreshGuilds();
    } catch (e) {
      alert("注册失败: " + e);
    }
  };

  $("btnLogout").onclick = async () => {
    await invoke("logout");
    await refreshConfig();
    $("guildList").innerHTML = "";
  };

  $("btnCreateGuild").onclick = async () => {
    try {
      await invoke("create_guild", {
        name: ($("guildName") as HTMLInputElement).value.trim(),
      });
      await refreshConfig();
      await refreshGuilds();
    } catch (e) {
      alert("创建失败: " + e);
    }
  };

  $("btnJoinGuild").onclick = async () => {
    try {
      await invoke("join_guild", {
        inviteCode: ($("inviteCode") as HTMLInputElement).value.trim(),
      });
      await refreshConfig();
      await refreshGuilds();
    } catch (e) {
      alert("加入失败: " + e);
    }
  };

  $("btnUpload").onclick = async () => {
    try {
      await invoke("upload_now");
    } catch (e) {
      pushLog("error", String(e));
    }
  };
}

boot();
