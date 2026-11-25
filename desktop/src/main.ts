import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import itemIconCache from "./item-icon-cache.json";
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
  equipment?: Array<{
    slot?: string;
    name?: string;
    item_level?: number;
    item_id?: number;
    quality?: number;
    icon?: string;
    icon_file_id?: number;
    desc?: string;
    transmog?: {
      name?: string;
      is_transmogrified?: boolean;
      is_hidden?: boolean;
      illusion_name?: string;
      illusion_id?: number;
      appearance_id?: number;
      source_id?: number;
    };
  }>;
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

const root = document.getElementById("app")!;

function $(id: string) {
  return document.getElementById(id)!;
}

function text(v: unknown, fallback = "-") {
  if (v == null || v === "") return fallback;
  return String(v);
}

function renderShell() {
  const loggedIn = !!(cfgCache?.has_token && cfgCache.username);
  root.innerHTML = `
    <header class="topbar">
      <div class="brand" id="btnHome" title="回到主页">
        <strong>WGA Sync</strong>
        <span class="muted">公会同步</span>
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
      <div class="row"><input id="guildName" type="text" placeholder="新公会名称" /><button type="button" id="btnCreateGuild">创建</button></div>
      <div class="row"><input id="inviteCode" type="text" placeholder="邀请码" /><button type="button" id="btnJoinGuild">加入</button></div>
      <div id="guildList"></div>
    </section>
    <section class="card">
      <div class="row between">
        <h2>本地快照</h2>
        <div class="row">
          <button type="button" id="btnRefreshSnap" class="secondary">刷新</button>
          <button type="button" id="btnUpload">上传</button>
        </div>
      </div>
      <p class="hint">读取插件 SavedVariables（游戏内快照后需 /reload 或小退才会落盘）。</p>
      <div id="snapEmpty" class="muted">暂无数据</div>
      <div id="snapView" class="hidden">
        <div id="snapHero" class="snap-hero"></div>
        <div class="snap-grid">
          <div>
            <h3>角色装备</h3>
            <div id="snapEquip" class="paperdoll"></div>
          </div>
          <div class="snap-side">
            <h3>专业</h3>
            <ul id="snapProf" class="plain-list"></ul>
            <h3>副本 CD</h3>
            <ul id="snapLock" class="plain-list"></ul>
          </div>
        </div>
        <h3>当前任务 <span id="snapQuestCount" class="muted"></span></h3>
        <ul id="snapQuests" class="plain-list quest-list"></ul>
      </div>
    </section>
    <section class="card">
      <h2>日志</h2>
      <ul id="logList"></ul>
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
      <label>邀请码（选填）<input id="inviteCodeReg" type="text" placeholder="有公会邀请码可填写" /></label>
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
        inviteCode: ($("inviteCodeReg") as HTMLInputElement).value.trim(),
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

function bindHomeActions() {
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
  const ul = document.getElementById("logList");
  if (!ul) return;
  ul.innerHTML = "";
  for (const row of logs.slice(0, 50)) {
    const li = document.createElement("li");
    li.className = row.level || "";
    li.textContent = `[${row.level}] ${row.message}`;
    ul.appendChild(li);
  }
}

const SLOT_LABEL: Record<string, string> = {
  HEAD: "头部",
  NECK: "颈部",
  SHOULDER: "肩部",
  BACK: "背部",
  CHEST: "胸部",
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
};
const ARMORY_LEFT = ["HEAD", "NECK", "SHOULDER", "BACK", "CHEST", "WRIST"];
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
const ARMORY_WEAPONS = ["MAINHAND", "OFFHAND"];
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
const ICON_CDNS = [
  "https://render.worldofwarcraft.com/us/icons/56/",
  "https://wow.zamimg.com/images/wow/icons/large/",
];
let iconLookupInflight = 0;
const ICON_LOOKUP_MAX = 3;

function isIconName(icon?: string | null): icon is string {
  return (
    !!icon && !/^\d+$/.test(icon) && !/^invtype_/i.test(icon)
  );
}

function cachedIconName(itemId?: number | null): string | null {
  if (!itemId) return null;
  const hit = (itemIconCache as Record<string, string>)[String(itemId)];
  return hit || null;
}

function iconUrl(icon?: string | null) {
  if (!isIconName(icon)) return null;
  return `${ICON_CDNS[0]}${icon.toLowerCase()}.jpg`;
}

function iconUrlCandidates(icon?: string | null): string[] {
  if (!isIconName(icon)) return [];
  const name = icon.toLowerCase();
  return ICON_CDNS.map((base) => `${base}${name}.jpg`);
}

type IconSrc = { src: string; source: string };
const equipIconSrcCache = new Map<string, string | null>();

function equipIconKey(
  itemId?: number | null,
  icon?: string | null,
  fileId?: number | null
) {
  return `${itemId ?? ""}|${icon ?? ""}|${fileId ?? ""}`;
}

async function resolveEquipIconSrc(e?: {
  item_id?: number;
  icon?: string;
  icon_file_id?: number;
}): Promise<string | null> {
  if (!e) return null;
  const key = equipIconKey(e.item_id, e.icon, e.icon_file_id);
  if (equipIconSrcCache.has(key)) return equipIconSrcCache.get(key)!;

  // 快路径：已有合法文件名 / 本地物品对照表 → CDN
  if (isIconName(e.icon)) {
    const src = iconUrl(e.icon);
    equipIconSrcCache.set(key, src);
    return src;
  }
  const localName = cachedIconName(e.item_id);
  if (localName) {
    const src = iconUrl(localName);
    equipIconSrcCache.set(key, src);
    return src;
  }

  if (iconLookupInflight >= ICON_LOOKUP_MAX) {
    await new Promise((r) => setTimeout(r, 50));
  }
  iconLookupInflight += 1;
  try {
    const hit = await invoke<IconSrc | null>("resolve_equip_icon", {
      icon: e.icon ?? null,
      icon_file_id: e.icon_file_id ?? null,
      item_id: e.item_id ?? null,
    });
    const src = hit?.src || null;
    equipIconSrcCache.set(key, src);
    return src;
  } catch {
    equipIconSrcCache.set(key, null);
    return null;
  } finally {
    iconLookupInflight -= 1;
  }
}

function wireIconImg(img: HTMLImageElement, src: string, iconName?: string | null) {
  const fallbacks = iconName ? iconUrlCandidates(iconName).filter((u) => u !== src) : [];
  let i = 0;
  img.src = src;
  img.onerror = () => {
    if (i < fallbacks.length) {
      img.src = fallbacks[i++];
      return;
    }
    img.style.display = "none";
  };
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

function renderArmory(
  box: HTMLElement,
  equip: NonNullable<SnapshotPayload["equipment"]>,
  character: SnapshotPayload["character"]
) {
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
        <img alt="" loading="lazy" style="display:none" />
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
    if (img && (e?.item_id || e?.icon || e?.icon_file_id)) {
      resolveEquipIconSrc(e).then((src) => {
        if (!src || !img.isConnected) return;
        if (ph) ph.style.display = "none";
        img.style.display = "block";
        wireIconImg(img, src, isIconName(e?.icon) ? e!.icon : cachedIconName(e?.item_id));
      });
    }
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
      <div class="paperdoll-silhouette" aria-hidden="true"></div>
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

function renderSnapshot(payload: SnapshotPayload) {
  const empty = $("snapEmpty");
  const view = $("snapView");
  empty.classList.add("hidden");
  view.classList.remove("hidden");

  $("snapHero").innerHTML = `
    <div class="muted small">
      采集 ${text(payload.captured_at)}
      ${payload.addon_version ? ` · 插件 ${payload.addon_version}` : ""}
    </div>
  `;

  const equipBox = $("snapEquip");
  equipBox.className = "paperdoll";
  renderArmory(equipBox, payload.equipment || [], payload.character);

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
  const data = await invoke<{
    path: string;
    hash: string;
    payload: SnapshotPayload;
  }>("get_local_snapshot");
  const payload = data.payload || {};
  renderSnapshot(payload);
  const ver = payload.addon_version || "?";
  const n = (payload.equipment || []).filter((e) => e.item_id || e.name).length;
  pushLog(
    "info",
    `快照 ${payload.captured_at || "?"} · 插件 ${ver} · 装备 ${n} · ${data.path}`
  );
}

async function refreshConfig() {
  cfgCache = await invoke<PublicConfig>("get_config");
}

async function refreshGuilds() {
  const box = document.getElementById("guildList");
  if (!box) return;
  box.innerHTML = "";
  try {
    const me = await invoke<{
      guilds: Array<{
        id: string;
        name: string;
        role: string;
        invite_code: string;
      }>;
    }>("me");
    const cfg = cfgCache || (await invoke<PublicConfig>("get_config"));
    for (const g of me.guilds || []) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = `${g.name} · ${g.role} · 邀请码 ${g.invite_code}`;
      if (g.id === cfg.guild_id) btn.classList.add("active");
      btn.onclick = async () => {
        await invoke("select_guild", { id: g.id, name: g.name });
        cfgCache = await invoke<PublicConfig>("get_config");
        applyHomeConfig(cfgCache);
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
