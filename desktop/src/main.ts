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

type SnapGuild = {
  name?: string;
  rank?: string;
  rank_index?: number;
  is_leader?: boolean;
  flavor?: string;
  region_key?: string;
  realm_name?: string;
};

type SnapEquipItem = {
  slot?: string;
  name?: string;
  item_level?: number;
  item_id?: number;
  quality?: number;
  icon?: string;
  icon_file_id?: number;
  desc?: string;
  tooltip_lines?: Array<{
    left?: string;
    right?: string;
    color?: { r?: number; g?: number; b?: number };
  }>;
  transmog?: {
    name?: string;
    is_transmogrified?: boolean;
    is_hidden?: boolean;
    illusion_name?: string;
    illusion_id?: number;
    appearance_id?: number;
    source_id?: number;
  };
};

type SnapEquipSet = {
  id?: number;
  name?: string;
  icon_file_id?: number;
  is_equipped?: boolean;
  items?: SnapEquipItem[];
};

type SnapTalentTipLine = {
  left?: string;
  right?: string;
  color?: { r?: number; g?: number; b?: number };
};

type SnapTalentNode = {
  node_id?: number;
  tree_id?: number;
  group_id?: number;
  pos_x?: number;
  pos_y?: number;
  rank?: number;
  max_rank?: number;
  name?: string;
  spell_id?: number;
  icon_file_id?: number;
  tooltip_lines?: SnapTalentTipLine[];
  description?: string;
};

type SnapTalentTab = {
  group_id?: number;
  name?: string;
  icon_file_id?: number;
  order_index?: number;
  points_spent?: number;
  nodes?: SnapTalentNode[];
};

type SnapTalentGroup = {
  index?: number;
  name?: string;
  active?: boolean;
  config_name?: string;
  tree_id?: number;
  trees?: Array<{ tree_id?: number; points_spent?: number }>;
  tabs?: SnapTalentTab[];
  nodes?: SnapTalentNode[];
};

type SnapshotPayload = {
  captured_at?: string;
  addon_version?: string;
  character?: {
    name?: string;
    realm?: string;
    race?: string;
    class?: string;
    spec?: string;
    level?: number;
    item_level?: number;
  };
  guild?: SnapGuild | null;
  equipment?: SnapEquipItem[];
  equipment_sets?: SnapEquipSet[];
  talents?: {
    loadout_string?: string;
    spec_id?: number;
    groups?: SnapTalentGroup[];
  };
  lockouts?: Array<{
    instance_name?: string;
    difficulty?: string;
    bosses_killed?: number;
    bosses_total?: number;
    reset_at?: string;
  }>;
  professions?: Array<{
    name?: string;
    skill_current?: number;
    skill_max?: number;
  }>;
  quests?: Array<{
    quest_id?: number;
    title?: string;
    level?: number;
    is_complete?: boolean;
    objectives?: Array<{ text?: string; finished?: boolean }>;
  }>;
};

const logs: LogRow[] = [];
let cfgCache: PublicConfig | null = null;
let page: "home" | "settings" | "login" | "register" = "home";
let listenersReady = false;
let captchaId = "";
let lastSnap: SnapshotPayload | null = null;
let snapTabKey = "";
let lastLookup: {
  status: string;
  id?: string;
  name?: string;
  verification_status?: string;
  is_member?: boolean;
  is_owner?: boolean;
  role?: string;
  flavor?: string;
  region_key?: string;
  realm_name?: string;
  guild_name?: string;
} | null = null;

const root = document.getElementById("app")!;

function $(id: string) {
  return document.getElementById(id)!;
}

function text(v: unknown, fallback = "-") {
  if (v == null || v === "") return fallback;
  return String(v);
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 解析魔兽 UI 转义：|cAARRGGBB…|r、|T…|t、|H…|h…|h、|n */
function wowTextToHtml(input: string): string {
  if (!input) return "";
  const s = String(input);
  let i = 0;
  let out = "";
  while (i < s.length) {
    if (s[i] === "|" && s[i + 1] === "|") {
      out += "|";
      i += 2;
      continue;
    }
    if (s.startsWith("|c", i) && /^[0-9a-fA-F]{8}/.test(s.slice(i + 2, i + 10))) {
      const hex = s.slice(i + 2, i + 10);
      i += 10;
      const end = s.indexOf("|r", i);
      const contentEnd = end === -1 ? s.length : end;
      const inner = wowTextToHtml(s.slice(i, contentEnd));
      const r = parseInt(hex.slice(2, 4), 16);
      const g = parseInt(hex.slice(4, 6), 16);
      const b = parseInt(hex.slice(6, 8), 16);
      out += `<span style="color:rgb(${r},${g},${b})">${inner}</span>`;
      i = end === -1 ? s.length : end + 2;
      continue;
    }
    if (s.startsWith("|r", i)) {
      i += 2;
      continue;
    }
    if (s.startsWith("|T", i)) {
      const t = s.indexOf("|t", i);
      i = t === -1 ? s.length : t + 2;
      continue;
    }
    if (s.startsWith("|H", i)) {
      const h1 = s.indexOf("|h", i);
      if (h1 === -1) {
        i += 2;
        continue;
      }
      const h2 = s.indexOf("|h", h1 + 2);
      if (h2 === -1) {
        i = h1 + 2;
        continue;
      }
      out += wowTextToHtml(s.slice(h1 + 2, h2));
      i = h2 + 2;
      continue;
    }
    if (s.startsWith("|n", i)) {
      out += "<br/>";
      i += 2;
      continue;
    }
    const next = s.indexOf("|", i);
    const chunk = next === -1 ? s.slice(i) : s.slice(i, next);
    out += escapeHtml(chunk);
    i = next === -1 ? s.length : next;
  }
  return out;
}

function renderShell() {
  const loggedIn = !!(cfgCache?.has_token && cfgCache.username);
  root.innerHTML = `
    <header class="topbar">
      <div class="brand" id="btnHome" title="回到主页">
        <img class="brand-logo" src="/wga-logo.png" alt="" width="28" height="28" />
        <div class="brand-text">
          <strong>WGA Sync</strong>
          <span class="muted">公会同步</span>
        </div>
      </div>
      <div class="top-user" id="topUser">
        <button type="button" id="btnGoSettings" class="secondary compact">设置</button>
        ${
          loggedIn
            ? `<span class="user-name">${text(cfgCache?.username)}</span>
               <button type="button" id="btnLogout" class="secondary compact">退出</button>`
            : `<button type="button" id="btnGoLogin" class="secondary compact">登录</button>
               <button type="button" id="btnGoRegister" class="compact">注册</button>`
        }
      </div>
    </header>
    <main id="page"></main>
  `;

  $("btnHome").onclick = () => showPage("home");
  $("btnGoSettings").onclick = () => showPage("settings");
  if (loggedIn) {
    $("btnLogout").onclick = async () => {
      await invoke("logout");
      await refreshConfig();
      showPage("home");
    };
  } else {
    $("btnGoLogin").onclick = () => showPage("login");
    $("btnGoRegister").onclick = () => showPage("register");
  }
}

function renderSettingsPage() {
  $("page").innerHTML = `
    <section class="card">
      <div class="row between">
        <h2>连接</h2>
        <button type="button" id="btnBackHome" class="linkish">返回</button>
      </div>
      <p class="hint">配置 API 与无限服目录，供快照同步使用。</p>
      <label>API 地址<input id="apiBaseUrl" type="text" /></label>
      <label>无限服目录<div class="row"><input id="wowRoot" type="text" readonly /><button type="button" id="btnPickWow">浏览</button></div></label>
      <label class="check"><input id="autoUpload" type="checkbox" /> 自动上传</label>
      <button type="button" id="btnSaveSettings">保存设置</button>
      <p id="settingsMsg" class="hint hidden"></p>
    </section>
  `;

  if (cfgCache) applySettingsConfig(cfgCache);
  $("btnBackHome").onclick = () => showPage("home");
  $("btnSaveSettings").onclick = async () => {
    await invoke("save_settings", {
      apiBaseUrl: ($("apiBaseUrl") as HTMLInputElement).value.trim(),
      autoUpload: ($("autoUpload") as HTMLInputElement).checked,
      wowRoot: null,
    });
    await refreshConfig();
    const msg = $("settingsMsg");
    msg.textContent = "已保存";
    msg.classList.remove("hidden");
  };
  $("btnPickWow").onclick = async () => {
    await invoke("pick_wow_root");
    await refreshConfig();
    if (cfgCache) applySettingsConfig(cfgCache);
  };
}

function renderHomePage() {
  $("page").innerHTML = `
    <p class="disclaimer">监听本地快照并上传到自建 API</p>
    <section class="card">
      <h2>公会</h2>
      <p>当前：<strong id="currentGuild">未选择</strong></p>
      <div id="guildList"></div>
      <div id="snapGuildInfo" class="hint" style="margin-top:10px">从本地快照读取游戏公会…</div>
      <div class="row" style="margin-top:8px">
        <button type="button" id="btnLookupGuild" class="secondary">按快照查询</button>
        <button type="button" id="btnCreateGuild" class="hidden">创建公会</button>
        <button type="button" id="btnApplyJoin" class="hidden">申请加入</button>
        <button type="button" id="btnApplyClaim" class="hidden">申请认领</button>
      </div>
      <p id="guildActionMsg" class="hint"></p>
      <div id="joinAppsBox" class="hidden" style="margin-top:12px">
        <h3>入会申请</h3>
        <div id="joinAppsList"></div>
      </div>
      <div id="adminBox" class="hidden" style="margin-top:12px">
        <h3>平台管理</h3>
        <div id="adminPendingGuilds"></div>
        <div id="adminPendingClaims" style="margin-top:8px"></div>
      </div>
    </section>
    <section class="card">
      <div class="row between">
        <h2>本地快照</h2>
        <div class="row">
          <button type="button" id="btnRefreshSnap" class="secondary">刷新</button>
          <button type="button" id="btnUpload">上传</button>
        </div>
      </div>
      <p class="hint">读取插件 SavedVariables。插件无法直接写任意文件；手动 /wga 默认会自动 Reload 落盘（可用 /wga flush off 关闭）。</p>
      <div id="snapEmpty" class="muted">暂无数据</div>
      <div id="snapView" class="hidden">
        <div id="snapHero" class="snap-hero"></div>
        <div id="snapTabs" class="snap-tabs" role="tablist"></div>
        <div class="snap-main">
          <h3 id="snapMainTitle">角色装备</h3>
          <div id="snapEquip" class="paperdoll"></div>
          <div id="snapTalents" class="snap-talents hidden"></div>
        </div>
        <div class="snap-meta">
          <div class="snap-meta-left">
            <h3>专业</h3>
            <ul id="snapProf" class="plain-list"></ul>
            <h3>副本 CD</h3>
            <ul id="snapLock" class="plain-list"></ul>
          </div>
          <div class="snap-meta-right">
            <h3>当前任务 <span id="snapQuestCount" class="muted"></span></h3>
            <ul id="snapQuests" class="plain-list quest-list"></ul>
          </div>
        </div>
      </div>
    </section>
  `;

  if (cfgCache) applyHomeConfig(cfgCache);
  bindHomeActions();
  renderLogs();
  refreshGuilds().catch(() => {});
  refreshSnapshot().catch((e) => showSnapEmpty(String(e)));
}

function applySettingsConfig(c: PublicConfig) {
  const api = document.getElementById("apiBaseUrl") as HTMLInputElement | null;
  if (!api) return;
  api.value = c.api_base_url;
  ($("wowRoot") as HTMLInputElement).value = c.wow_root;
  ($("autoUpload") as HTMLInputElement).checked = c.auto_upload;
}

function renderLoginPage() {
  $("page").innerHTML = `
    <section class="card login-card">
      <h2>登录</h2>
      <p class="hint">使用自建 API 账号</p>
      <label>用户名<input id="username" type="text" autocomplete="username" /></label>
      <label>密码<input id="password" type="password" autocomplete="current-password" /></label>
      <p id="loginError" class="error hidden"></p>
      <div class="row">
        <button type="button" id="btnLogin">登录</button>
        <button type="button" id="btnBackHome" class="linkish">返回</button>
      </div>
      <p class="hint auth-switch">没有账号？<a href="#" id="linkRegister">去注册</a></p>
    </section>
  `;

  $("btnBackHome").onclick = () => showPage("home");
  $("linkRegister").onclick = (e) => {
    e.preventDefault();
    showPage("register");
  };

  $("btnLogin").onclick = async () => {
    const err = $("loginError");
    err.classList.add("hidden");
    try {
      await invoke("login", {
        username: ($("username") as HTMLInputElement).value.trim(),
        password: ($("password") as HTMLInputElement).value,
      });
      await refreshConfig();
      showPage("home");
    } catch (e) {
      err.textContent = "登录失败: " + e;
      err.classList.remove("hidden");
    }
  };

  ($("username") as HTMLInputElement).focus();
}

async function loadCaptcha() {
  const img = document.getElementById("captchaImage") as HTMLImageElement | null;
  if (!img) return;
  try {
    const data = await invoke<{ captcha_id: string; image: string }>(
      "get_captcha"
    );
    captchaId = data.captcha_id;
    img.src = data.image;
    img.alt = "验证码";
  } catch (e) {
    captchaId = "";
    img.removeAttribute("src");
    img.alt = "获取失败，点击刷新";
  }
}

function renderRegisterPage() {
  $("page").innerHTML = `
    <section class="card login-card">
      <h2>注册</h2>
      <p class="hint">创建账号后可同步快照到自建 API</p>
      <label>用户名<input id="username" type="text" autocomplete="username" /></label>
      <label>密码<input id="password" type="password" autocomplete="new-password" /></label>
      <label>验证码
        <div class="row captcha-row">
          <img id="captchaImage" class="captcha-img" width="140" height="48" alt="验证码" title="点击刷新" />
          <button type="button" id="btnRefreshCaptcha" class="secondary compact" title="刷新验证码">刷新</button>
        </div>
        <input id="captchaCode" type="text" placeholder="输入图中字符" autocomplete="off" />
      </label>
      <p id="regError" class="error hidden"></p>
      <div class="row">
        <button type="button" id="btnRegister">注册</button>
        <button type="button" id="btnBackHome" class="linkish">返回</button>
      </div>
      <p class="hint auth-switch">已有账号？<a href="#" id="linkLogin">去登录</a></p>
    </section>
  `;

  $("btnBackHome").onclick = () => showPage("home");
  $("linkLogin").onclick = (e) => {
    e.preventDefault();
    showPage("login");
  };
  $("btnRefreshCaptcha").onclick = () => {
    loadCaptcha();
  };
  $("captchaImage").onclick = () => {
    loadCaptcha();
  };

  $("btnRegister").onclick = async () => {
    const err = $("regError");
    err.classList.add("hidden");
    const u = ($("username") as HTMLInputElement).value.trim();
    try {
      await invoke("register", {
        username: u,
        password: ($("password") as HTMLInputElement).value,
        displayName: u,
        captchaId,
        captchaCode: ($("captchaCode") as HTMLInputElement).value.trim(),
      });
      await refreshConfig();
      showPage("home");
    } catch (e) {
      err.textContent = "注册失败: " + e;
      err.classList.remove("hidden");
      await loadCaptcha();
    }
  };

  loadCaptcha();
  ($("username") as HTMLInputElement).focus();
}

function showPage(next: "home" | "settings" | "login" | "register") {
  page = next;
  renderShell();
  if (next === "login") renderLoginPage();
  else if (next === "register") renderRegisterPage();
  else if (next === "settings") renderSettingsPage();
  else renderHomePage();
}

function applyHomeConfig(c: PublicConfig) {
  const guild = document.getElementById("currentGuild");
  if (!guild) return;
  guild.textContent = c.guild_name
    ? `${c.guild_name}`
    : c.guild_id || "未选择";
}

function snapGuildKey() {
  const g = lastSnap?.guild;
  if (!g?.name) return null;
  return {
    flavor: g.flavor || "forever",
    region_key: g.region_key || "UNKNOWN",
    realm_name: g.realm_name || lastSnap?.character?.realm || "",
    guild_name: g.name,
    is_leader: !!g.is_leader,
    character_name: lastSnap?.character?.name || "",
  };
}

function updateSnapGuildInfo() {
  const el = document.getElementById("snapGuildInfo");
  if (!el) return;
  const ver = lastSnap?.addon_version || "";
  const g = lastSnap?.guild;
  if (!g?.name) {
    const stale =
      ver &&
      (() => {
        const m = /^(\d+)\.(\d+)\.(\d+)/.exec(ver);
        if (!m) return true;
        const n =
          Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
        return n < 120; // < 0.1.20
      })();
    el.textContent = stale
      ? `快照插件版本 ${ver || "未知"} 过旧（无公会字段）。请确认游戏加载 WGA 0.1.20+ → /reload → /wga → 再 /reload。`
      : `快照中无公会（插件 ${ver || "?"}）。请确认角色已加入游戏公会后重新 /wga，再 /reload。`;
    return;
  }
  const leader = g.is_leader ? " · 游戏会长" : "";
  el.textContent = `${g.flavor || "forever"} / ${g.region_key || "UNKNOWN"} / ${
    g.realm_name || lastSnap?.character?.realm || "?"
  } · ${g.name}${leader}（插件 ${ver || "?"}）`;
}

function setGuildActionButtons(mode: "none" | "create" | "join" | "claim" | "member") {
  const create = document.getElementById("btnCreateGuild");
  const join = document.getElementById("btnApplyJoin");
  const claim = document.getElementById("btnApplyClaim");
  if (!create || !join || !claim) return;
  create.classList.toggle("hidden", mode !== "create");
  join.classList.toggle("hidden", mode !== "join");
  claim.classList.toggle("hidden", mode !== "claim");
}

function bindHomeActions() {
  $("btnLookupGuild").onclick = async () => {
    const msg = $("guildActionMsg");
    const key = snapGuildKey();
    if (!key?.guild_name || !key.realm_name) {
      msg.textContent = "需要带公会字段的本地快照（升级插件 0.1.19+ 后重新快照）";
      setGuildActionButtons("none");
      return;
    }
    try {
      const r = await invoke<{
        status: string;
        id?: string;
        name?: string;
        verification_status?: string;
        is_member?: boolean;
        is_owner?: boolean;
        role?: string;
      }>("lookup_guild", {
        flavor: key.flavor,
        regionKey: key.region_key,
        realmName: key.realm_name,
        guildName: key.guild_name,
      });
      lastLookup = { ...r, ...key };
      if (r.status === "not_found") {
        msg.textContent = `未找到「${key.guild_name}」，可创建（创建后待管理员认证）`;
        setGuildActionButtons("create");
      } else if (r.is_member) {
        msg.textContent = `已在公会「${r.name}」· ${r.role} · ${
          r.verification_status === "verified" ? "已认证" : "待认证"
        }`;
        setGuildActionButtons("member");
        if (r.id && r.name) {
          await invoke("select_guild", { id: r.id, name: r.name });
          await refreshConfig();
          applyHomeConfig(cfgCache!);
          await refreshGuilds();
        }
      } else if (key.is_leader && !r.is_owner) {
        msg.textContent = `公会「${r.name}」已被创建。你是游戏会长，可申请认领（需管理员审核）`;
        setGuildActionButtons("claim");
      } else {
        msg.textContent = `公会「${r.name}」已存在，可申请加入（需会长审核）`;
        setGuildActionButtons("join");
      }
    } catch (e) {
      msg.textContent = "查询失败: " + e;
      setGuildActionButtons("none");
    }
  };

  $("btnCreateGuild").onclick = async () => {
    const key = snapGuildKey();
    if (!key) return;
    try {
      await invoke("create_guild", {
        name: key.guild_name,
        flavor: key.flavor,
        regionKey: key.region_key,
        realmName: key.realm_name,
      });
      await refreshConfig();
      await refreshGuilds();
      $("guildActionMsg").textContent = "已创建，状态：待认证";
      setGuildActionButtons("member");
    } catch (e) {
      alert("创建失败: " + e);
    }
  };

  $("btnApplyJoin").onclick = async () => {
    if (!lastLookup?.id) return;
    try {
      await invoke("apply_join_guild", {
        guildId: lastLookup.id,
        message: "",
      });
      $("guildActionMsg").textContent = "已提交入会申请";
      setGuildActionButtons("none");
    } catch (e) {
      alert("申请失败: " + e);
    }
  };

  $("btnApplyClaim").onclick = async () => {
    const key = snapGuildKey();
    if (!lastLookup?.id || !key) return;
    try {
      await invoke("apply_claim_guild", {
        guildId: lastLookup.id,
        characterName: key.character_name,
        realmName: key.realm_name,
        isLeader: true,
        message: "",
      });
      $("guildActionMsg").textContent = "已提交认领申请";
      setGuildActionButtons("none");
    } catch (e) {
      alert("认领失败: " + e);
    }
  };

  $("btnRefreshSnap").onclick = async () => {
    const btn = $("btnRefreshSnap") as HTMLButtonElement;
    if (btn.disabled) return;
    btn.disabled = true;
    const prev = btn.textContent;
    btn.textContent = "刷新中…";
    try {
      await refreshSnapshot();
    } catch (e) {
      showSnapEmpty(String(e));
      pushLog("error", "刷新失败: " + e);
    } finally {
      btn.disabled = false;
      btn.textContent = prev || "刷新";
    }
  };

  $("btnUpload").onclick = async () => {
    try {
      await invoke("upload_now");
      await refreshSnapshot();
    } catch (e) {
      pushLog("error", String(e));
    }
  };
}

function renderLogs() {
  /* 桌面端不再展示日志面板 */
}

const SLOT_LABEL: Record<string, string> = {
  HEAD: "头部",
  NECK: "颈部",
  SHOULDER: "肩部",
  BACK: "背部",
  CHEST: "胸部",
  SHIRT: "衬衣",
  TABARD: "战袍",
  WRIST: "手腕",
  HANDS: "手",
  WAIST: "腰部",
  LEGS: "腿部",
  FEET: "脚",
  FINGER1: "手指",
  FINGER2: "手指",
  TRINKET1: "饰品",
  TRINKET2: "饰品",
  MAINHAND: "主手",
  OFFHAND: "副手",
  RELIC: "圣物",
};
const ARMORY_LEFT = [
  "HEAD",
  "NECK",
  "SHOULDER",
  "BACK",
  "CHEST",
  "SHIRT",
  "TABARD",
  "WRIST",
];
const ARMORY_RIGHT = [
  "HANDS",
  "WAIST",
  "LEGS",
  "FEET",
  "FINGER1",
  "FINGER2",
  "TRINKET1",
  "TRINKET2",
];
const ARMORY_WEAPONS = ["MAINHAND", "OFFHAND", "RELIC"];
const QUALITY_COLORS = [
  "#9d9d9d",
  "#ffffff",
  "#1eff00",
  "#0070dd",
  "#a335ee",
  "#ff8000",
  "#e6cc80",
  "#00ccff",
];
type IconSrc = { b64?: string; src?: string; source: string; ms?: number };
const equipIconSrcCache = new Map<string, string>();
let iconQueue: Promise<void> = Promise.resolve();
let iconStats = { ok: 0, fail: 0, skip: 0 };

function equipIconKey(fileId?: number | null) {
  return String(fileId ?? "");
}

function b64ToImgSrc(b64: string): string {
  // data URL 在 WebView2 里比 blob: 更稳
  return `data:image/png;base64,${b64}`;
}

/** 串行解析；队列错误不中断后续 */
function enqueueIconResolve(
  fileId: number,
  apply: (url: string) => void
): void {
  iconQueue = iconQueue
    .catch(() => {})
    .then(async () => {
      const key = equipIconKey(fileId);
      const cached = equipIconSrcCache.get(key);
      if (cached) {
        iconStats.ok += 1;
        apply(cached);
        return;
      }
      const t0 = performance.now();
      pushLog("info", `图标请求 #${fileId}…`);
      const hit = await invoke<IconSrc | null>("resolve_equip_icon", {
        icon: null,
        iconFileId: fileId,
        itemId: null,
      });
      const b64 = hit?.b64;
      if (!b64) {
        iconStats.fail += 1;
        pushLog(
          "warn",
          `图标 #${fileId} 空结果 (${Math.round(performance.now() - t0)}ms)`
        );
        return;
      }
      const url = b64ToImgSrc(b64);
      equipIconSrcCache.set(key, url);
      iconStats.ok += 1;
      pushLog(
        "info",
        `图标 #${fileId} ← ${hit?.source || "?"} rust=${hit?.ms ?? "?"}ms ui=${Math.round(performance.now() - t0)}ms`
      );
      apply(url);
    })
    .catch((err) => {
      iconStats.fail += 1;
      pushLog("warn", `图标 #${fileId} 异常: ${String(err)}`);
    });
}

function wireIconImg(img: HTMLImageElement, ph: HTMLElement | null, src: string) {
  // 先显示再赋 src：display:none + lazy 会导致永远不加载
  if (ph) ph.style.display = "none";
  img.style.display = "block";
  img.loading = "eager";
  img.onerror = () => {
    pushLog("warn", `图标 img.onerror`);
    img.style.display = "none";
    if (ph) ph.style.display = "block";
  };
  img.src = src;
}

function qualityColor(q?: number | null) {
  if (q == null || q < 0) return "#2c3644";
  return QUALITY_COLORS[q] || "#2c3644";
}

function transmogText(
  tm?: SnapshotPayload["equipment"] extends (infer E)[] | undefined
    ? E extends { transmog?: infer T }
      ? T
      : never
    : never
) {
  if (!tm) return "";
  let s = "";
  if (tm.is_hidden) s = "隐藏外观";
  else if (tm.is_transmogrified || tm.name) {
    s = tm.name || `外观 #${tm.appearance_id ?? tm.source_id ?? "?"}`;
  }
  if (tm.illusion_name || tm.illusion_id) {
    s += (s ? " · " : "") + (tm.illusion_name || `幻效 #${tm.illusion_id}`);
  }
  return s;
}

const QUALITY_LABEL = [
  "粗糙",
  "普通",
  "优秀",
  "精良",
  "史诗",
  "传说",
  "神器",
  "传家宝",
];

function ensureItemTip(): HTMLElement {
  let tip = document.getElementById("itemTip");
  if (!tip) {
    tip = document.createElement("div");
    tip.id = "itemTip";
    tip.className = "item-tip hidden";
    document.body.appendChild(tip);
  }
  return tip;
}

function hideItemTip() {
  ensureItemTip().classList.add("hidden");
}

function placeItemTip(clientX: number, clientY: number) {
  const tip = ensureItemTip();
  tip.classList.remove("hidden");
  const pad = 14;
  const tw = tip.offsetWidth || 240;
  const th = tip.offsetHeight || 120;
  let left = clientX + pad;
  let top = clientY + pad;
  if (left + tw > window.innerWidth - 8) left = clientX - tw - pad;
  if (top + th > window.innerHeight - 8) top = clientY - th - pad;
  tip.style.left = `${Math.max(8, left)}px`;
  tip.style.top = `${Math.max(8, top)}px`;
}

function showEquipTip(
  e: NonNullable<SnapshotPayload["equipment"]>[number],
  slot: string,
  clientX: number,
  clientY: number
) {
  if (!e?.name && !e?.item_id) {
    hideItemTip();
    return;
  }
  const tip = ensureItemTip();
  const q = e.quality ?? 1;
  const color = qualityColor(q);
  const tm = transmogText(e.transmog);
  const lines = e.tooltip_lines || [];
  let body = "";
  if (lines.length) {
    body = lines
      .map((ln) => {
        const c = ln.color;
        const style =
          c && c.r != null
            ? `style="color:rgb(${c.r},${c.g ?? 0},${c.b ?? 0})"`
            : "";
        const leftRaw = ln.left || "";
        const rightRaw = ln.right || "";
        if (!leftRaw && !rightRaw) {
          return `<div class="item-tip-blank"></div>`;
        }
        const left = wowTextToHtml(leftRaw);
        const right = wowTextToHtml(rightRaw);
        if (rightRaw) {
          return `<div class="item-tip-row" ${style}><span>${left}</span><span>${right}</span></div>`;
        }
        return `<div class="item-tip-line" ${style}>${left}</div>`;
      })
      .join("");
  } else {
    // 无 tip 行：磁盘快照可能还没 flush，或 tip 采集失败
    const hasField = Array.isArray(e.tooltip_lines);
    body = `
      <div class="item-tip-line">${SLOT_LABEL[slot] || slot}${
        e.item_level != null ? ` · 物品等级 ${e.item_level}` : ""
      }</div>
      ${
        e.quality != null
          ? `<div class="item-tip-line" style="color:${color}">${
              QUALITY_LABEL[e.quality] || `品质 ${e.quality}`
            }</div>`
          : ""
      }
      ${e.desc ? `<div class="item-tip-line">${wowTextToHtml(e.desc)}</div>` : ""}
      <div class="item-tip-line muted">${
        hasField
          ? "（属性行为空：请确认装备后重新快照）"
          : "（磁盘仍是旧快照：游戏聊天快照后需再 /reload 一次，桌面端才能读到）"
      }</div>
    `;
  }
  const nameHeader = lines.length
    ? ""
    : `<div class="item-tip-name" style="color:${color}">${wowTextToHtml(
        e.name || "未知物品"
      )}</div>`;
  tip.innerHTML = `
    ${nameHeader}
    ${body}
    ${
      e.item_id != null
        ? `<div class="item-tip-id muted">物品ID ${e.item_id}</div>`
        : ""
    }
    ${tm ? `<div class="item-tip-tm">外观：${wowTextToHtml(tm)}</div>` : ""}
  `;
  placeItemTip(clientX, clientY);
}

function bindEquipTip(
  row: HTMLElement,
  e: NonNullable<SnapshotPayload["equipment"]>[number] | undefined,
  slot: string
) {
  if (!e?.name && !e?.item_id) return;
  row.classList.add("has-tip");
  row.addEventListener("mouseenter", (ev) =>
    showEquipTip(e, slot, ev.clientX, ev.clientY)
  );
  row.addEventListener("mousemove", (ev) => placeItemTip(ev.clientX, ev.clientY));
  row.addEventListener("mouseleave", hideItemTip);
}

function renderArmory(
  box: HTMLElement,
  equip: NonNullable<SnapshotPayload["equipment"]>,
  character: SnapshotPayload["character"]
) {
  hideItemTip();
  box.innerHTML = "";
  const bySlot = new Map(equip.map((e) => [e.slot || "", e]));
  const slotRow = (slot: string, side: "left" | "right" | "weapon") => {
    const e = bySlot.get(slot);
    const border = qualityColor(e?.quality);
    const tm = transmogText(e?.transmog);
    const empty = !e?.name && !e?.item_id;
    const meta = `
      <div class="armory-meta">
        <div class="armory-slot">${SLOT_LABEL[slot] || slot}</div>
        <div class="armory-name" style="color:${empty ? "var(--muted)" : border}">
          ${empty ? "空" : text(e?.name)}
          ${e?.item_level != null ? `<span class="muted"> ${e.item_level}</span>` : ""}
        </div>
        ${e?.desc ? `<div class="armory-desc muted">${text(e.desc)}</div>` : ""}
        ${tm ? `<div class="armory-tm muted">→ ${tm}</div>` : ""}
      </div>`;
    const icon = `
      <div class="armory-icon">
        <img alt="" decoding="async" style="display:none" />
        <span class="armory-icon-ph"></span>
      </div>`;
    const row = document.createElement("div");
    row.className =
      "armory-item" +
      (empty ? " empty" : "") +
      (side === "left" ? " side-left" : "") +
      (side === "weapon" ? " side-weapon" : "");
    row.style.setProperty("--q", border);
    row.innerHTML =
      side === "left" ? meta + icon : icon + meta;

    const img = row.querySelector(".armory-icon img") as HTMLImageElement | null;
    const ph = row.querySelector(".armory-icon-ph") as HTMLElement | null;
    // 兼容 snake / 可能的驼峰
    const rawFid = (e as { icon_file_id?: number; iconFileId?: number } | undefined)
      ?.icon_file_id
      ?? (e as { iconFileId?: number } | undefined)?.iconFileId;
    const fileId = Number(rawFid);
    if (img && Number.isFinite(fileId) && fileId > 0) {
      enqueueIconResolve(fileId, (src) => {
        if (!img.isConnected) {
          pushLog("warn", `图标 #${fileId} DOM 已卸载，跳过`);
          return;
        }
        wireIconImg(img, ph, src);
      });
    } else if (e && (e.item_id || e.name)) {
      iconStats.skip += 1;
      pushLog(
        "warn",
        `装备 ${e.slot || "?"} 无 icon_file_id (item=${e.item_id ?? "?"}) keys=${e ? Object.keys(e).join(",") : ""}`
      );
    }
    bindEquipTip(row, e, slot);
    return row;
  };
  const col = (slots: string[], side: "left" | "right") => {
    const c = document.createElement("div");
    c.className = "armory-col";
    for (const slot of slots) c.appendChild(slotRow(slot, side));
    return c;
  };
  const center = document.createElement("div");
  center.className = "paperdoll-center";
  const ch = character || {};
  center.innerHTML = `
    <div class="paperdoll-figure">
      <div class="paperdoll-silhouette" aria-hidden="true">
        <img class="paperdoll-art" src="/paperdoll-figure.jpg" alt="" />
      </div>
      <div class="paperdoll-info">
        <div class="paperdoll-name">${text(ch.name, "角色")}${
          ch.realm ? ` <span class="muted">- ${text(ch.realm)}</span>` : ""
        }</div>
        <div class="muted">${
          [ch.race, ch.class, ch.spec].filter(Boolean).join(" · ") || "—"
        }</div>
        <div class="paperdoll-stats">
          ${ch.level != null ? `<span>Lv${ch.level}</span>` : ""}
          ${ch.item_level != null ? `<span>ilvl ${ch.item_level}</span>` : ""}
        </div>
      </div>
    </div>
    <div class="paperdoll-weapons"></div>
  `;
  const weapons = center.querySelector(".paperdoll-weapons")!;
  for (const slot of ARMORY_WEAPONS) {
    weapons.appendChild(slotRow(slot, "weapon"));
  }
  box.appendChild(col(ARMORY_LEFT, "left"));
  box.appendChild(center);
  box.appendChild(col(ARMORY_RIGHT, "right"));
}

type SnapTab =
  | { key: string; kind: "equip"; label: string; items: SnapEquipItem[] }
  | { key: string; kind: "talent"; label: string; group: SnapTalentGroup };

function buildSnapTabs(payload: SnapshotPayload): SnapTab[] {
  const tabs: SnapTab[] = [];
  const sets = payload.equipment_sets || [];
  if (sets.length) {
    for (const s of sets) {
      const items =
        s.items && s.items.length
          ? s.items
          : s.is_equipped
            ? payload.equipment || []
            : s.items || [];
      tabs.push({
        key: `equip:${s.id ?? s.name}`,
        kind: "equip",
        label: s.name || "装备方案",
        items,
      });
    }
  } else {
    tabs.push({
      key: "equip:current",
      kind: "equip",
      label: "当前装备",
      items: payload.equipment || [],
    });
  }
  const groups = payload.talents?.groups || [];
  if (groups.length) {
    for (const g of groups) {
      tabs.push({
        key: `talent:${g.index ?? g.name}`,
        kind: "talent",
        label: g.name || `天赋${g.index ?? ""}`,
        group: g,
      });
    }
  } else {
    tabs.push({
      key: "talent:1",
      kind: "talent",
      label: "天赋",
      group: {
        name: "天赋",
        active: true,
        nodes: [],
        trees: [],
      },
    });
  }
  return tabs;
}

const talentTipByNodeId = new Map<number, SnapTalentNode>();

function wireTalentNodeIcons(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>("[data-talent-icon]").forEach((el) => {
    const fid = Number(el.dataset.talentIcon || 0);
    if (!fid) return;
    enqueueIconResolve(fid, (url) => {
      el.style.backgroundImage = `url("${url}")`;
      el.classList.add("has-icon");
    });
  });
}

function renderTalentTipLines(lines: SnapTalentTipLine[] | undefined): string {
  if (!lines?.length) return "";
  return lines
    .map((ln) => {
      const c = ln.color;
      const style =
        c && c.r != null
          ? `style="color:rgb(${c.r},${c.g ?? 0},${c.b ?? 0})"`
          : "";
      const leftRaw = ln.left || "";
      const rightRaw = ln.right || "";
      if (!leftRaw && !rightRaw) {
        return `<div class="item-tip-blank"></div>`;
      }
      const left = wowTextToHtml(leftRaw);
      const right = wowTextToHtml(rightRaw);
      if (rightRaw) {
        return `<div class="item-tip-row" ${style}><span>${left}</span><span>${right}</span></div>`;
      }
      return `<div class="item-tip-line" ${style}>${left}</div>`;
    })
    .join("");
}

function showTalentTip(btn: HTMLElement, clientX: number, clientY: number) {
  const nodeId = Number(btn.dataset.talentNode || 0);
  const node = nodeId ? talentTipByNodeId.get(nodeId) : undefined;
  const name = node?.name || btn.dataset.talentName || "天赋";
  const rank = node?.rank ?? Number(btn.dataset.talentRank || 0);
  const max = node?.max_rank ?? Number(btn.dataset.talentMax || rank);
  const spell = node?.spell_id ?? (btn.dataset.talentSpell ? Number(btn.dataset.talentSpell) : undefined);
  const tipBody = renderTalentTipLines(node?.tooltip_lines);
  const tip = ensureItemTip();
  const descOnly =
    node?.description &&
    !tipBody.includes(escapeHtml(node.description).slice(0, 12))
      ? `<div class="item-tip-line">${wowTextToHtml(node.description)}</div>`
      : "";
  if (tipBody) {
    tip.innerHTML = `${tipBody}${
      descOnly && tipLooksSparse(node?.tooltip_lines) ? descOnly : ""
    }<div class="item-tip-line muted">等级 ${rank}/${max}</div>`;
  } else {
    tip.innerHTML = `
    <div class="item-tip-name" style="color:#ffe9a8">${escapeHtml(text(name))}</div>
    <div class="item-tip-line">等级 ${rank}/${max}</div>
    ${
      node?.description
        ? `<div class="item-tip-line">${wowTextToHtml(node.description)}</div>`
        : `<div class="item-tip-line muted">暂无详情（需插件 0.1.26+ 后 /wga）</div>`
    }
    ${spell ? `<div class="item-tip-id muted">法术 #${spell}</div>` : ""}
  `;
  }
  placeItemTip(clientX, clientY);
}

function tipLooksSparse(lines: SnapTalentTipLine[] | undefined) {
  if (!lines?.length) return true;
  const meaningful = lines.filter((ln) => {
    const t = (ln.left || "").replace(/\s+/g, "");
    return t && t !== "被动" && t !== "Passive";
  });
  return meaningful.length <= 1;
}

function rememberTalentTips(nodes: SnapTalentNode[]) {
  for (const n of nodes) {
    if (n.node_id != null) talentTipByNodeId.set(n.node_id, n);
  }
}

function wireTalentNodeTips(root: HTMLElement) {
  root.querySelectorAll<HTMLElement>(".talent-node").forEach((btn) => {
    btn.onmouseenter = (ev) => showTalentTip(btn, ev.clientX, ev.clientY);
    btn.onmousemove = (ev) => placeItemTip(ev.clientX, ev.clientY);
    btn.onmouseleave = () => hideItemTip();
  });
  root.querySelectorAll<HTMLElement>(".talent-list-row").forEach((row) => {
    row.onmouseenter = (ev) => showTalentTip(row, ev.clientX, ev.clientY);
    row.onmousemove = (ev) => placeItemTip(ev.clientX, ev.clientY);
    row.onmouseleave = () => hideItemTip();
  });
}

function talentNodesHaveLayout(nodes: SnapTalentNode[]) {
  const withPos = nodes.filter(
    (n) => (n.pos_x ?? 0) !== 0 || (n.pos_y ?? 0) !== 0
  );
  if (withPos.length < 2) return false;
  const xs = new Set(withPos.map((n) => n.pos_x ?? 0));
  const ys = new Set(withPos.map((n) => n.pos_y ?? 0));
  return xs.size > 1 || ys.size > 1;
}

function renderTalentNodeList(nodes: SnapTalentNode[]) {
  rememberTalentTips(nodes);
  const rows = nodes
    .slice()
    .sort(
      (a, b) =>
        (b.rank ?? 0) - (a.rank ?? 0) || (a.node_id ?? 0) - (b.node_id ?? 0)
    )
    .map((n) => {
      const rank = n.rank ?? 0;
      const max = n.max_rank ?? rank;
      const on = rank > 0;
      const fid = n.icon_file_id ?? 0;
      const name = text(n.name, `节点 ${n.node_id}`);
      return `<li class="talent-list-row ${on ? "learned" : "empty"}"
        data-talent-name="${escapeHtml(name)}"
        data-talent-rank="${rank}" data-talent-max="${max}"
        data-talent-node="${n.node_id ?? ""}"
        data-talent-spell="${n.spell_id ?? ""}">
        <span class="talent-list-icon" data-talent-icon="${fid}"></span>
        <span class="talent-list-name">${escapeHtml(name)}</span>
        <span class="talent-list-rank">${rank}/${max}</span>
      </li>`;
    })
    .join("");
  return `<ul class="talent-node-list">${rows}</ul>`;
}

/** 把连续坐标归并成稀疏网格索引（相近值并成同一格） */
function buildTalentAxis(values: number[], mergeRatio = 0.35): number[] {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  if (sorted.length <= 1) return sorted;
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
  const med = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)] || 1;
  const thresh = Math.max(1, med * mergeRatio);
  const axis: number[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - axis[axis.length - 1] > thresh) axis.push(sorted[i]);
  }
  return axis;
}

function nearestAxisIndex(axis: number[], v: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < axis.length; i++) {
    const d = Math.abs(axis[i] - v);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** 单系天赋树画布：离散网格 + 固定图标间距 */
function renderTalentTreeCanvas(
  nodes: SnapTalentNode[],
  opts?: { colWidth?: number; maxHeight?: number }
) {
  const drawable = nodes.filter(
    (n) => (n.max_rank ?? 0) > 0 || (n.rank ?? 0) > 0
  );
  if (!drawable.length) {
    return `<p class="muted talent-col-empty">此系无节点</p>`;
  }
  if (!talentNodesHaveLayout(drawable)) {
    return renderTalentNodeList(drawable);
  }

  rememberTalentTips(drawable);
  const xs = drawable.map((n) => n.pos_x ?? 0);
  const ys = drawable.map((n) => n.pos_y ?? 0);
  const axisX = buildTalentAxis(xs);
  const axisY = buildTalentAxis(ys);

  const nodeSize = 40;
  const gap = 14; // 图标边缘之间的空隙
  const cell = nodeSize + gap;
  const pad = 16;

  const cols = Math.max(axisX.length, 1);
  const rows = Math.max(axisY.length, 1);
  const w = pad * 2 + cols * cell - gap;
  const h = pad * 2 + rows * cell - gap;

  const cells = drawable
    .map((n) => {
      const cx = nearestAxisIndex(axisX, n.pos_x ?? 0);
      const cy = nearestAxisIndex(axisY, n.pos_y ?? 0);
      const left = pad + cx * cell;
      const top = pad + cy * cell;
      const rank = n.rank ?? 0;
      const max = n.max_rank ?? Math.max(rank, 1);
      const on = rank > 0;
      const maxed = on && rank >= max;
      const fid = n.icon_file_id ?? 0;
      const rankLabel = max <= 1 ? String(rank) : `${rank}/${max}`;
      const name = text(n.name, `节点 ${n.node_id}`);
      return `<button type="button" class="talent-node ${
        on ? (maxed ? "maxed" : "learned") : "empty"
      }" style="left:${left}px;top:${top}px;width:${nodeSize}px;height:${nodeSize}px"
        data-talent-name="${escapeHtml(name)}"
        data-talent-rank="${rank}"
        data-talent-max="${max}"
        data-talent-spell="${n.spell_id ?? ""}"
        data-talent-node="${n.node_id ?? ""}">
        <span class="talent-node-icon" data-talent-icon="${fid}"></span>
        ${
          on
            ? `<span class="talent-node-rank${maxed ? " maxed" : ""}">${rankLabel}</span>`
            : ""
        }
      </button>`;
    })
    .join("");
  void opts;
  return `<div class="talent-canvas-wrap"><div class="talent-canvas" style="width:${w}px;height:${h}px">${cells}</div></div>`;
}

function renderTalentColumn(tab: SnapTalentTab, index: number) {
  const spent = tab.points_spent ?? 0;
  const iconFid = tab.icon_file_id ?? 0;
  return `<div class="talent-col" data-col="${index}">
    <div class="talent-col-head">
      <span class="talent-col-icon" data-talent-icon="${iconFid}"></span>
      <span class="talent-col-title">${text(tab.name, `系${index + 1}`)}</span>
      <span class="talent-col-points">${spent}</span>
    </div>
    <div class="talent-col-body">
      ${renderTalentTreeCanvas(tab.nodes || [], { colWidth: 250, maxHeight: 560 })}
    </div>
  </div>`;
}

function renderTalentPanel(box: HTMLElement, group: SnapTalentGroup) {
  talentTipByNodeId.clear();
  const tabs = group.tabs || [];
  const flatNodes = group.nodes || [];
  if (!group.active && !tabs.length && !flatNodes.length) {
    box.innerHTML = `
      <div class="talent-head">
        <strong>${text(group.name, "天赋")}</strong>
      </div>
      <p class="muted">副天赋详情需切换到该天赋后重新快照（插件 0.1.24+）</p>`;
    return;
  }

  const totalSpent =
    tabs.reduce((s, t) => s + (t.points_spent ?? 0), 0) ||
    flatNodes.reduce((s, n) => s + (n.rank ?? 0), 0);

  if (!tabs.length && flatNodes.length) {
    box.innerHTML = `
      <div class="talent-head">
        <strong>${text(group.name, "天赋")}</strong>
        ${group.active ? `<span class="tab-badge">激活</span>` : ""}
        ${group.config_name ? `<span class="muted">${text(group.config_name)}</span>` : ""}
        <span class="talent-unused muted">已投入 ${totalSpent}</span>
      </div>
      <p class="muted small">当前快照无三系分页（需插件 0.1.24+ 后 /wga）</p>
      ${renderTalentTreeCanvas(flatNodes, { colWidth: 720, maxHeight: 560 })}`;
    wireTalentNodeIcons(box);
    wireTalentNodeTips(box);
    return;
  }

  if (!tabs.length) {
    box.innerHTML = `
      <div class="talent-head">
        <strong>${text(group.name, "天赋")}</strong>
        ${group.active ? `<span class="tab-badge">激活</span>` : ""}
      </div>
      <p class="muted">未采集到天赋树（请升级插件 0.1.24+ 后 /wga）</p>`;
    return;
  }

  // 经典布局：三系并排
  box.innerHTML = `
    <div class="talent-head">
      <strong>${text(group.name, "天赋")}</strong>
      ${group.active ? `<span class="tab-badge">激活</span>` : ""}
      ${group.config_name ? `<span class="muted">${text(group.config_name)}</span>` : ""}
      <span class="talent-unused">已投入 ${totalSpent}</span>
    </div>
    <div class="talent-trees">${tabs.map((t, i) => renderTalentColumn(t, i)).join("")}</div>
  `;
  wireTalentNodeIcons(box);
  wireTalentNodeTips(box);
}

function applySnapTab(payload: SnapshotPayload, tab: SnapTab) {
  const equipBox = $("snapEquip");
  const talentBox = $("snapTalents");
  const title = document.getElementById("snapMainTitle");
  snapTabKey = tab.key;
  if (tab.kind === "equip") {
    if (title) title.textContent = `装备 · ${tab.label}`;
    equipBox.classList.remove("hidden");
    talentBox.classList.add("hidden");
    equipBox.className = "paperdoll";
    renderArmory(equipBox, tab.items || [], payload.character);
  } else {
    if (title) title.textContent = `天赋 · ${tab.label}`;
    equipBox.classList.add("hidden");
    talentBox.classList.remove("hidden");
    renderTalentPanel(talentBox, tab.group);
  }
}

function renderSnapTabs(payload: SnapshotPayload) {
  const bar = document.getElementById("snapTabs");
  if (!bar) return;
  const tabs = buildSnapTabs(payload);
  if (!tabs.find((t) => t.key === snapTabKey)) {
    const equipped = tabs.find(
      (t) =>
        t.kind === "equip" &&
        (payload.equipment_sets || []).some(
          (s) =>
            s.is_equipped &&
            t.key === `equip:${s.id ?? s.name}`
        )
    );
    const activeTalent = tabs.find(
      (t) => t.kind === "talent" && t.group.active
    );
    snapTabKey = equipped?.key || tabs[0]?.key || "";
    // prefer first equip tab by default
    if (!equipped && tabs[0]) snapTabKey = tabs[0].key;
    void activeTalent;
  }
  bar.innerHTML = "";
  const equipTabs = tabs.filter((t) => t.kind === "equip");
  const talentTabs = tabs.filter((t) => t.kind === "talent");

  const makeGroup = (kind: "equip" | "talent", label: string, list: SnapTab[]) => {
    if (!list.length) return;
    const group = document.createElement("div");
    group.className = `snap-tab-group ${kind}`;
    const title = document.createElement("span");
    title.className = "snap-tab-group-label";
    title.textContent = label;
    const row = document.createElement("div");
    row.className = "snap-tab-group-row";
    for (const tab of list) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className =
        "snap-tab" +
        (tab.key === snapTabKey ? " active" : "") +
        (tab.kind === "talent" ? " talent" : " equip");
      btn.setAttribute("role", "tab");
      btn.textContent = tab.label;
      if (tab.kind === "talent" && tab.group.active) {
        btn.textContent += " ·当前";
      }
      if (
        tab.kind === "equip" &&
        (payload.equipment_sets || []).some(
          (s) => s.is_equipped && tab.key === `equip:${s.id ?? s.name}`
        )
      ) {
        btn.textContent += " ·穿着";
      }
      btn.onclick = () => {
        snapTabKey = tab.key;
        renderSnapTabs(payload);
        applySnapTab(payload, tab);
      };
      row.appendChild(btn);
    }
    group.appendChild(title);
    group.appendChild(row);
    bar.appendChild(group);
  };

  makeGroup("equip", "装备", equipTabs);
  if (equipTabs.length && talentTabs.length) {
    const sep = document.createElement("div");
    sep.className = "snap-tabs-sep";
    sep.setAttribute("aria-hidden", "true");
    bar.appendChild(sep);
  }
  makeGroup("talent", "天赋", talentTabs);

  const cur = tabs.find((t) => t.key === snapTabKey) || tabs[0];
  if (cur) applySnapTab(payload, cur);
}

function renderSnapshot(payload: SnapshotPayload) {
  lastSnap = payload;
  updateSnapGuildInfo();
  const empty = $("snapEmpty");
  const view = $("snapView");
  empty.classList.add("hidden");
  view.classList.remove("hidden");

  $("snapHero").innerHTML = `
    <div class="muted small">
      采集 ${text(payload.captured_at)}
      ${payload.addon_version ? ` · 插件 ${payload.addon_version}` : ""}
      ${
        (payload.equipment_sets || []).length
          ? ` · 装备方案 ${(payload.equipment_sets || []).length}`
          : ""
      }
      ${
        (payload.talents?.groups || []).length
          ? ` · 天赋组 ${(payload.talents?.groups || []).length}`
          : ""
      }
    </div>
  `;

  renderSnapTabs(payload);

  const profUl = $("snapProf");
  profUl.innerHTML = "";
  const profs = payload.professions || [];
  if (!profs.length) {
    profUl.innerHTML = `<li class="muted">无</li>`;
  } else {
    for (const p of profs) {
      const li = document.createElement("li");
      li.textContent = `${text(p.name)} ${p.skill_current ?? "?"}/${p.skill_max ?? "?"}`;
      profUl.appendChild(li);
    }
  }

  const lockUl = $("snapLock");
  lockUl.innerHTML = "";
  const locks = payload.lockouts || [];
  if (!locks.length) {
    lockUl.innerHTML = `<li class="muted">无</li>`;
  } else {
    for (const l of locks) {
      const li = document.createElement("li");
      li.innerHTML = `<strong>${text(l.instance_name)}</strong>
        <div class="muted">${text(l.difficulty)} · ${l.bosses_killed ?? 0}/${l.bosses_total ?? 0}</div>`;
      lockUl.appendChild(li);
    }
  }

  const quests = payload.quests || [];
  $("snapQuestCount").textContent = quests.length ? `(${quests.length})` : "";
  const qUl = $("snapQuests");
  qUl.innerHTML = "";
  if (!quests.length) {
    qUl.innerHTML = `<li class="muted">无任务（需插件 0.1.1+）</li>`;
  } else {
    for (const q of quests) {
      const li = document.createElement("li");
      const objs = (q.objectives || [])
        .map(
          (o) =>
            `<div class="muted">${o.finished ? "✓" : "·"} ${text(o.text)}</div>`
        )
        .join("");
      li.innerHTML = `<strong>${text(q.title)}${q.is_complete ? " · 已完成" : ""}</strong>
        <div class="muted">${q.level != null ? `Lv${q.level}` : ""}${q.quest_id != null ? ` · #${q.quest_id}` : ""}</div>
        ${objs}`;
      qUl.appendChild(li);
    }
  }
}

function showSnapEmpty(msg: string) {
  const view = document.getElementById("snapView");
  const empty = document.getElementById("snapEmpty");
  if (!view || !empty) return;
  view.classList.add("hidden");
  empty.classList.remove("hidden");
  empty.textContent = msg;
}

async function refreshSnapshot() {
  if (page !== "home") {
    throw new Error("请先回到主页再刷新");
  }
  const t0 = performance.now();
  pushLog("info", "刷新开始…");
  iconStats = { ok: 0, fail: 0, skip: 0 };
  iconQueue = Promise.resolve();
  const data = await invoke<{
    path: string;
    hash: string;
    payload: SnapshotPayload;
  }>("get_local_snapshot");
  const payload = data.payload || {};
  const equip = payload.equipment || [];
  const withFid = equip.filter((e) => Number(e.icon_file_id) > 0).length;
  pushLog(
    "info",
    `快照已读 ${Math.round(performance.now() - t0)}ms · 装备 ${equip.length} · 有fileId ${withFid} · 插件 ${payload.addon_version || "?"}`
  );
  const sample = equip[0];
  pushLog(
    "info",
    `首件字段: ${sample ? Object.keys(sample).join(",") : "(无)"} fileId=${sample?.icon_file_id ?? "?"}`
  );
  try {
    renderSnapshot(payload);
    pushLog("info", `纸娃娃已渲染 · 图标队列已挂起`);
  } catch (err) {
    pushLog("error", `渲染失败: ${String(err)}`);
    throw err;
  }
  // 不阻塞刷新按钮；后台汇总
  iconQueue
    .catch(() => {})
    .then(() => {
      pushLog(
        "info",
        `图标完成 ok=${iconStats.ok} fail=${iconStats.fail} skip=${iconStats.skip} · 总耗时 ${Math.round(performance.now() - t0)}ms`
      );
    });
}

async function refreshConfig() {
  cfgCache = await invoke<PublicConfig>("get_config");
}

function verificationLabel(status?: string) {
  if (status === "verified") return "已认证";
  if (status === "rejected") return "已拒绝";
  return "待认证";
}

async function refreshJoinApps(guildId: string, role: string) {
  const box = document.getElementById("joinAppsBox");
  const list = document.getElementById("joinAppsList");
  if (!box || !list) return;
  if (role !== "owner" && role !== "officer") {
    box.classList.add("hidden");
    return;
  }
  try {
    const data = await invoke<{
      applications: Array<{
        id: string;
        username: string;
        display_name?: string;
        message?: string;
        created_at: string;
      }>;
    }>("list_join_applications", { guildId });
    const apps = data.applications || [];
    box.classList.toggle("hidden", apps.length === 0);
    list.innerHTML = "";
    for (const a of apps) {
      const row = document.createElement("div");
      row.className = "row";
      row.style.marginBottom = "6px";
      row.innerHTML = `<span style="flex:1">${a.display_name || a.username}${
        a.message ? " · " + a.message : ""
      }</span>`;
      const ok = document.createElement("button");
      ok.type = "button";
      ok.textContent = "通过";
      ok.onclick = async () => {
        await invoke("decide_join_application", {
          guildId,
          appId: a.id,
          decision: "approve",
        });
        await refreshJoinApps(guildId, role);
      };
      const no = document.createElement("button");
      no.type = "button";
      no.className = "secondary";
      no.textContent = "拒绝";
      no.onclick = async () => {
        await invoke("decide_join_application", {
          guildId,
          appId: a.id,
          decision: "reject",
        });
        await refreshJoinApps(guildId, role);
      };
      row.appendChild(ok);
      row.appendChild(no);
      list.appendChild(row);
    }
  } catch {
    box.classList.add("hidden");
  }
}

async function refreshAdminPanel(isAdmin: boolean) {
  const box = document.getElementById("adminBox");
  const guildsEl = document.getElementById("adminPendingGuilds");
  const claimsEl = document.getElementById("adminPendingClaims");
  if (!box || !guildsEl || !claimsEl) return;
  if (!isAdmin) {
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  try {
    const gdata = await invoke<{
      guilds: Array<{
        id: string;
        name: string;
        flavor: string;
        region_key: string;
        realm_name: string;
        created_by?: string;
      }>;
    }>("admin_list_guilds");
    guildsEl.innerHTML = "<strong>待认证公会</strong>";
    for (const g of gdata.guilds || []) {
      const row = document.createElement("div");
      row.className = "row";
      row.style.marginTop = "6px";
      row.innerHTML = `<span style="flex:1">${g.flavor}/${g.region_key}/${g.realm_name} · ${g.name}${
        g.created_by ? " · @" + g.created_by : ""
      }</span>`;
      const ok = document.createElement("button");
      ok.type = "button";
      ok.textContent = "认证";
      ok.onclick = async () => {
        await invoke("admin_verify_guild", {
          guildId: g.id,
          decision: "verify",
          regionKey: "",
        });
        await refreshAdminPanel(true);
      };
      const no = document.createElement("button");
      no.type = "button";
      no.className = "secondary";
      no.textContent = "拒绝";
      no.onclick = async () => {
        await invoke("admin_verify_guild", {
          guildId: g.id,
          decision: "reject",
          regionKey: "",
        });
        await refreshAdminPanel(true);
      };
      row.appendChild(ok);
      row.appendChild(no);
      guildsEl.appendChild(row);
    }
    if (!(gdata.guilds || []).length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "无待认证公会";
      guildsEl.appendChild(p);
    }

    const cdata = await invoke<{
      applications: Array<{
        id: string;
        guild_name: string;
        username: string;
        character_name?: string;
        realm_name?: string;
      }>;
    }>("admin_list_claims");
    claimsEl.innerHTML = "<strong>待审认领</strong>";
    for (const a of cdata.applications || []) {
      const row = document.createElement("div");
      row.className = "row";
      row.style.marginTop = "6px";
      row.innerHTML = `<span style="flex:1">${a.guild_name} · @${a.username}${
        a.character_name ? " · " + a.character_name : ""
      }</span>`;
      const ok = document.createElement("button");
      ok.type = "button";
      ok.textContent = "通过";
      ok.onclick = async () => {
        await invoke("admin_decide_claim", { appId: a.id, decision: "approve" });
        await refreshAdminPanel(true);
      };
      const no = document.createElement("button");
      no.type = "button";
      no.className = "secondary";
      no.textContent = "拒绝";
      no.onclick = async () => {
        await invoke("admin_decide_claim", { appId: a.id, decision: "reject" });
        await refreshAdminPanel(true);
      };
      row.appendChild(ok);
      row.appendChild(no);
      claimsEl.appendChild(row);
    }
    if (!(cdata.applications || []).length) {
      const p = document.createElement("p");
      p.className = "muted";
      p.textContent = "无待审认领";
      claimsEl.appendChild(p);
    }
  } catch {
    box.classList.add("hidden");
  }
}

async function refreshGuilds() {
  const box = document.getElementById("guildList");
  if (!box) return;
  box.innerHTML = "";
  try {
    const me = await invoke<{
      user?: { is_admin?: boolean };
      guilds: Array<{
        id: string;
        name: string;
        role: string;
        verification_status?: string;
        flavor?: string;
        region_key?: string;
        realm_name?: string;
      }>;
    }>("me");
    const cfg = cfgCache || (await invoke<PublicConfig>("get_config"));
    let currentRole = "";
    for (const g of me.guilds || []) {
      const btn = document.createElement("button");
      btn.type = "button";
      const badge = verificationLabel(g.verification_status);
      btn.textContent = `${g.name} · ${g.role} · ${badge}`;
      if (g.id === cfg.guild_id) {
        btn.classList.add("active");
        currentRole = g.role;
      }
      btn.onclick = async () => {
        await invoke("select_guild", { id: g.id, name: g.name });
        cfgCache = await invoke<PublicConfig>("get_config");
        applyHomeConfig(cfgCache);
        await refreshGuilds();
      };
      box.appendChild(btn);
    }
    if (cfg.guild_id && currentRole) {
      await refreshJoinApps(cfg.guild_id, currentRole);
    } else {
      document.getElementById("joinAppsBox")?.classList.add("hidden");
    }
    await refreshAdminPanel(!!me.user?.is_admin);
  } catch {
    /* not logged in */
  }
}

function pushLog(level: string, message: string) {
  logs.unshift({ level, message, at: new Date().toISOString() });
  renderLogs();
}

async function boot() {
  cfgCache = await invoke<PublicConfig>("get_config");
  showPage("home");

  if (!listenersReady) {
    listenersReady = true;
    await listen<{ level: string; message: string }>("wga-log", (e) => {
      pushLog(e.payload.level, e.payload.message);
    });
    await listen<{ path: string }>("wga-sv-changed", async (e) => {
      pushLog("info", `检测到变更: ${e.payload.path}`);
      await refreshSnapshot();
      try {
        await invoke("upload_path", { path: e.payload.path });
      } catch (err) {
        pushLog("error", String(err));
      }
    });
  }
}

boot();
