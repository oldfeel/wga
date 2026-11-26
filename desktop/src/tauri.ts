import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen as tauriListen } from "@tauri-apps/api/event";
import type {
  CaptchaPayload,
  IconSrc,
  JoinApp,
  LocalSnapshot,
  MePayload,
  PendingClaim,
  PendingGuild,
  PublicConfig,
  GuildLookup,
} from "./types";

function ensureInvoke() {
  if (typeof tauriInvoke !== "function") {
    throw new Error(
      "Tauri API 不可用（invoke 未注入）。请用 tauri:dev / 安装包打开，不要只用浏览器打开 localhost:1420。"
    );
  }
  return tauriInvoke;
}

export function invoke<T>(cmd: string, args?: Record<string, unknown>) {
  return ensureInvoke()<T>(cmd, args);
}

export function listen<T>(
  event: string,
  handler: (payload: T) => void | Promise<void>
) {
  if (typeof tauriListen !== "function") {
    return Promise.resolve(() => {});
  }
  return tauriListen<T>(event, (e) => {
    void handler(e.payload);
  });
}

export const api = {
  getConfig: () => invoke<PublicConfig>("get_config"),
  saveSettings: (apiBaseUrl: string, autoUpload: boolean) =>
    invoke<PublicConfig>("save_settings", {
      apiBaseUrl,
      autoUpload,
      wowRoot: null,
    }),
  pickWowRoot: () => invoke<unknown>("pick_wow_root"),
  login: (username: string, password: string) =>
    invoke<unknown>("login", { username, password }),
  logout: () => invoke<unknown>("logout"),
  getCaptcha: () => invoke<CaptchaPayload>("get_captcha"),
  register: (body: {
    username: string;
    password: string;
    displayName: string;
    captchaId: string;
    captchaCode: string;
  }) => invoke<unknown>("register", body),
  me: () => invoke<MePayload>("me"),
  lookupGuild: (body: {
    flavor: string;
    regionKey: string;
    realmName: string;
    guildName: string;
  }) => invoke<GuildLookup>("lookup_guild", body),
  selectGuild: (id: string, name: string) =>
    invoke<unknown>("select_guild", { id, name }),
  createGuild: (body: {
    name: string;
    flavor: string;
    regionKey: string;
    realmName: string;
  }) => invoke<unknown>("create_guild", body),
  applyJoinGuild: (guildId: string, message: string) =>
    invoke<unknown>("apply_join_guild", { guildId, message }),
  applyClaimGuild: (body: {
    guildId: string;
    characterName: string;
    realmName: string;
    isLeader: boolean;
    message: string;
  }) => invoke<unknown>("apply_claim_guild", body),
  listJoinApplications: (guildId: string) =>
    invoke<{ applications: JoinApp[] }>("list_join_applications", { guildId }),
  decideJoinApplication: (guildId: string, appId: string, decision: string) =>
    invoke<unknown>("decide_join_application", { guildId, appId, decision }),
  adminListGuilds: () => invoke<{ guilds: PendingGuild[] }>("admin_list_guilds"),
  adminVerifyGuild: (guildId: string, decision: string, regionKey: string) =>
    invoke<unknown>("admin_verify_guild", { guildId, decision, regionKey }),
  adminListClaims: () =>
    invoke<{ applications: PendingClaim[] }>("admin_list_claims"),
  adminDecideClaim: (appId: string, decision: string) =>
    invoke<unknown>("admin_decide_claim", { appId, decision }),
  getLocalSnapshot: () => invoke<LocalSnapshot>("get_local_snapshot"),
  uploadNow: () => invoke<unknown>("upload_now"),
  uploadPath: (path: string) => invoke<unknown>("upload_path", { path }),
  resolveEquipIcon: (iconFileId: number) =>
    invoke<IconSrc | null>("resolve_equip_icon", {
      icon: null,
      iconFileId,
      itemId: null,
    }),
};
