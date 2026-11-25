const API = import.meta.env.VITE_API_BASE || "/api/v1";

export type ApiError = { error?: { code?: string; message?: string } };

async function request<T>(
  path: string,
  opts: RequestInit & { token?: string } = {}
): Promise<T> {
  const headers = new Headers(opts.headers);
  headers.set("Content-Type", "application/json");
  if (opts.token) headers.set("Authorization", `Bearer ${opts.token}`);
  const res = await fetch(`${API}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data as ApiError)?.error?.message || res.statusText || "request failed";
    throw new Error(msg);
  }
  return data as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{
      token: string;
      user: { id: string; username: string; is_admin?: boolean };
    }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),
  captcha: () =>
    request<{ captcha_id: string; image: string }>("/auth/captcha"),
  register: (
    username: string,
    password: string,
    display_name?: string,
    captcha_id?: string,
    captcha_code?: string
  ) =>
    request<{
      token: string;
      user: { id: string; username: string; is_admin?: boolean };
    }>("/auth/register", {
      method: "POST",
      body: JSON.stringify({
        username,
        password,
        display_name,
        captcha_id,
        captcha_code,
      }),
    }),
  me: (token: string) =>
    request<{
      user: { id: string; username: string; is_admin?: boolean };
      guilds: Array<{
        id: string;
        name: string;
        role: string;
        verification_status?: string;
        flavor?: string;
        region_key?: string;
        realm_name?: string;
      }>;
    }>("/auth/me", { token }),
  lookupGuild: (
    token: string,
    q: {
      flavor: string;
      region_key: string;
      realm_name: string;
      guild_name: string;
    }
  ) => {
    const qs = new URLSearchParams(q).toString();
    return request<{
      status: "found" | "not_found";
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
    }>(`/guilds/lookup?${qs}`, { token });
  },
  createGuild: (
    token: string,
    body: {
      name: string;
      flavor: string;
      region_key: string;
      realm_name: string;
    }
  ) =>
    request<{
      id: string;
      name: string;
      verification_status: string;
    }>("/guilds", {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  applyJoin: (token: string, guildId: string, message?: string) =>
    request<{ id: string; status: string }>(
      `/guilds/${guildId}/join-applications`,
      {
        method: "POST",
        token,
        body: JSON.stringify({ message: message || "" }),
      }
    ),
  listJoinApplications: (token: string, guildId: string) =>
    request<{
      applications: Array<{
        id: string;
        user_id: string;
        username: string;
        display_name?: string;
        message?: string;
        status: string;
        created_at: string;
      }>;
    }>(`/guilds/${guildId}/join-applications?status=pending`, { token }),
  decideJoinApplication: (
    token: string,
    guildId: string,
    appId: string,
    decision: "approve" | "reject"
  ) =>
    request<{ ok: boolean }>(
      `/guilds/${guildId}/join-applications/${appId}/decide`,
      {
        method: "POST",
        token,
        body: JSON.stringify({ decision }),
      }
    ),
  applyClaim: (
    token: string,
    guildId: string,
    body: {
      is_leader: boolean;
      character_name?: string;
      realm_name?: string;
      message?: string;
    }
  ) =>
    request<{ id: string; status: string }>(
      `/guilds/${guildId}/claim-applications`,
      {
        method: "POST",
        token,
        body: JSON.stringify(body),
      }
    ),
  adminListGuilds: (token: string) =>
    request<{
      guilds: Array<{
        id: string;
        name: string;
        verification_status: string;
        flavor: string;
        region_key: string;
        realm_name: string;
        created_by?: string;
        created_at: string;
      }>;
    }>("/admin/guilds?status=pending", { token }),
  adminVerifyGuild: (
    token: string,
    guildId: string,
    decision: "verify" | "reject",
    region_key?: string
  ) =>
    request<{ ok: boolean }>(`/admin/guilds/${guildId}/verify`, {
      method: "POST",
      token,
      body: JSON.stringify({ decision, region_key }),
    }),
  adminListClaims: (token: string) =>
    request<{
      applications: Array<{
        id: string;
        guild_id: string;
        guild_name: string;
        username: string;
        character_name?: string;
        realm_name?: string;
        created_at: string;
      }>;
    }>("/admin/claim-applications?status=pending", { token }),
  adminDecideClaim: (
    token: string,
    appId: string,
    decision: "approve" | "reject"
  ) =>
    request<{ ok: boolean }>(`/admin/claim-applications/${appId}/decide`, {
      method: "POST",
      token,
      body: JSON.stringify({ decision }),
    }),
  members: (token: string, guildId: string) =>
    request<{
      members: Array<{
        id: string;
        username: string;
        display_name?: string;
        role: string;
        joined_at: string;
      }>;
    }>(`/guilds/${guildId}/members`, { token }),
  patchMember: (
    token: string,
    guildId: string,
    userId: string,
    role: string
  ) =>
    request<{ ok: boolean }>(`/guilds/${guildId}/members/${userId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify({ role }),
    }),
  patchCharacter: (
    token: string,
    guildId: string,
    charId: string,
    body: { availability_note: string }
  ) =>
    request<{ ok: boolean }>(`/guilds/${guildId}/characters/${charId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),
  patchActivity: (
    token: string,
    activityId: string,
    body: { status?: string; title?: string }
  ) =>
    request<{ ok: boolean }>(`/activities/${activityId}`, {
      method: "PATCH",
      token,
      body: JSON.stringify(body),
    }),
  characters: (token: string, guildId: string, q?: Record<string, string>) => {
    const qs = q ? "?" + new URLSearchParams(q).toString() : "";
    return request<{
      characters: Array<{
        id: string;
        name: string;
        realm: string;
        class?: string;
        spec?: string;
        level?: number;
        item_level?: number;
        last_snapshot_at?: string;
      }>;
    }>(`/guilds/${guildId}/characters${qs}`, { token });
  },
  character: (token: string, guildId: string, charId: string) =>
    request<{
      id: string;
      name: string;
      realm: string;
      race?: string;
      class?: string;
      spec?: string;
      level?: number;
      item_level?: number;
      availability_note?: string;
      last_snapshot_at?: string;
      latest_snapshot?: {
        id: string;
        captured_at: string;
        addon_version?: string;
        payload: unknown;
      };
    }>(`/guilds/${guildId}/characters/${charId}`, { token }),
  activities: (token: string, guildId: string) =>
    request<{
      activities: Array<{
        id: string;
        title: string;
        starts_at: string;
        status: string;
      }>;
    }>(`/guilds/${guildId}/activities`, { token }),
  createActivity: (
    token: string,
    guildId: string,
    body: { title: string; starts_at: string; description?: string }
  ) =>
    request<{ id: string }>(`/guilds/${guildId}/activities`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
  getActivity: (token: string, id: string) =>
    request<{
      id: string;
      title: string;
      starts_at: string;
      status: string;
      signups: unknown[];
      roster: unknown[];
    }>(`/activities/${id}`, { token }),
  signup: (
    token: string,
    activityId: string,
    body?: { character_id?: string; status?: string; note?: string }
  ) =>
    request<{ id: string }>(`/activities/${activityId}/signups`, {
      method: "POST",
      token,
      body: JSON.stringify({ status: "signed", ...body }),
    }),
  checkIn: (token: string, activityId: string) =>
    request<{ ok: boolean }>(`/activities/${activityId}/check-in`, {
      method: "POST",
      token,
      body: JSON.stringify({}),
    }),
  putRoster: (
    token: string,
    activityId: string,
    roster: Array<{
      character_id?: string | null;
      user_id?: string | null;
      group_name?: string;
      slot_role?: string;
      sort_order?: number;
      note?: string;
    }>
  ) =>
    request<{ ok: boolean }>(`/activities/${activityId}/roster`, {
      method: "PUT",
      token,
      body: JSON.stringify({ roster }),
    }),
  announcements: (token: string, guildId: string) =>
    request<{
      announcements: Array<{
        id: string;
        title: string;
        body: string;
        author?: string;
        created_at: string;
      }>;
    }>(`/guilds/${guildId}/announcements`, { token }),
  createAnnouncement: (
    token: string,
    guildId: string,
    body: { title: string; body: string }
  ) =>
    request<{ id: string }>(`/guilds/${guildId}/announcements`, {
      method: "POST",
      token,
      body: JSON.stringify(body),
    }),
};
