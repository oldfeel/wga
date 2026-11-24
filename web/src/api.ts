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
    request<{ token: string; user: { id: string; username: string } }>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ username, password }) }
    ),
  register: (username: string, password: string, display_name?: string) =>
    request<{ token: string; user: { id: string; username: string } }>(
      "/auth/register",
      {
        method: "POST",
        body: JSON.stringify({ username, password, display_name }),
      }
    ),
  me: (token: string) =>
    request<{
      user: { id: string; username: string };
      guilds: Array<{
        id: string;
        name: string;
        role: string;
        invite_code: string;
      }>;
    }>("/auth/me", { token }),
  createGuild: (token: string, name: string) =>
    request<{ id: string; name: string; invite_code: string }>("/guilds", {
      method: "POST",
      token,
      body: JSON.stringify({ name }),
    }),
  joinGuild: (token: string, invite_code: string) =>
    request<{ id: string; name: string }>("/guilds/join", {
      method: "POST",
      token,
      body: JSON.stringify({ invite_code }),
    }),
  rotateInvite: (token: string, guildId: string) =>
    request<{ id: string; invite_code: string }>(
      `/guilds/${guildId}/invite/rotate`,
      { method: "POST", token, body: "{}" }
    ),
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
  characterSnapshots: (token: string, guildId: string, charId: string) =>
    request<{
      snapshots: Array<{
        id: string;
        captured_at: string;
        addon_version?: string;
        schema_version?: number;
      }>;
    }>(`/guilds/${guildId}/characters/${charId}/snapshots`, { token }),
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
};
