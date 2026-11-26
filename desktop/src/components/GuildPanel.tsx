import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import {
  FOREVER_RULESETS,
  coerceForeverRegionKey,
  foreverRulesetLabel,
} from "@wga/ui";
import { useConfig } from "../config";
import { pushLog } from "../log";
import { guildInfoText, snapGuildKey } from "../snapshot";
import { api } from "../tauri";
import type {
  GuildLookup,
  JoinApp,
  MyGuild,
  PendingClaim,
  PendingGuild,
  SnapshotPayload,
} from "../types";

type GuildMode = "none" | "create" | "join" | "claim" | "member";

function verificationLabel(status?: string) {
  if (status === "verified") return "已认证";
  if (status === "rejected") return "已拒绝";
  return "待认证";
}

export default function GuildPanel({ snap }: { snap: SnapshotPayload | null }) {
  const { config, refresh } = useConfig();
  const [guilds, setGuilds] = useState<MyGuild[]>([]);
  const [apps, setApps] = useState<JoinApp[]>([]);
  const [appsGuildId, setAppsGuildId] = useState("");
  const [adminGuilds, setAdminGuilds] = useState<PendingGuild[] | null>(null);
  const [adminClaims, setAdminClaims] = useState<PendingClaim[]>([]);
  const [msg, setMsg] = useState("");
  const [mode, setMode] = useState<GuildMode>("none");
  const [lookup, setLookup] = useState<GuildLookup | null>(null);
  const snapKey = useMemo(() => snapGuildKey(snap), [snap]);
  const snapRegion = snapKey?.region_key || "UNKNOWN";
  const [regionKey, setRegionKey] = useState(snapRegion);

  useEffect(() => {
    setRegionKey(coerceForeverRegionKey(snapRegion));
  }, [snapRegion]);

  const reload = useCallback(async () => {
    try {
      const me = await api.me();
      const cfg = await refresh();
      const list = me.guilds || [];
      setGuilds(list);
      const current = list.find((g) => g.id === cfg?.guild_id);
      if (
        cfg?.guild_id &&
        current &&
        (current.role === "owner" || current.role === "officer")
      ) {
        try {
          const data = await api.listJoinApplications(cfg.guild_id);
          setApps(data.applications || []);
          setAppsGuildId(cfg.guild_id);
        } catch {
          setApps([]);
          setAppsGuildId("");
        }
      } else {
        setApps([]);
        setAppsGuildId("");
      }
      if (me.user?.is_admin) {
        try {
          const gdata = await api.adminListGuilds();
          const cdata = await api.adminListClaims();
          setAdminGuilds(gdata.guilds || []);
          setAdminClaims(cdata.applications || []);
        } catch {
          setAdminGuilds(null);
          setAdminClaims([]);
        }
      } else {
        setAdminGuilds(null);
        setAdminClaims([]);
      }
    } catch {
      setGuilds([]);
      setApps([]);
      setAppsGuildId("");
      setAdminGuilds(null);
      setAdminClaims([]);
    }
  }, [refresh]);

  useEffect(() => {
    void reload();
  }, [reload, config?.has_token, config?.username]);

  async function onLookup() {
    const key = snapGuildKey(snap);
    if (!key?.guild_name || !key.realm_name) {
      setMsg("需要带公会字段的本地快照（升级插件 0.1.19+ 后重新快照）");
      setMode("none");
      return;
    }
    const region =
      key.flavor === "forever"
        ? coerceForeverRegionKey(regionKey)
        : regionKey.trim() || key.region_key;
    if (key.flavor === "forever" && region === "UNKNOWN") {
      setMsg("请先选择无限服规则集（普通 / PvP / 角色扮演…），再查询");
      setMode("none");
      return;
    }
    try {
      const r = await api.lookupGuild({
        flavor: key.flavor,
        regionKey: region,
        realmName: key.realm_name,
        guildName: key.guild_name,
      });
      const merged: GuildLookup = { ...key, region_key: region, ...r };
      setLookup(merged);
      if (r.status === "not_found") {
        setMsg(`未找到「${key.guild_name}」，可创建（创建后待管理员认证）`);
        setMode("create");
      } else if (r.is_member) {
        setMsg(
          `已在公会「${r.name}」· ${r.role} · ${
            r.verification_status === "verified" ? "已认证" : "待认证"
          }`
        );
        setMode("member");
        if (r.id && r.name) {
          await api.selectGuild(r.id, r.name);
          await reload();
        }
      } else if (key.is_leader && !r.is_owner) {
        setMsg(`公会「${r.name}」已被创建。你是游戏会长，可申请认领（需管理员审核）`);
        setMode("claim");
      } else {
        setMsg(`公会「${r.name}」已存在，可申请加入（需会长审核）`);
        setMode("join");
      }
    } catch (e) {
      setMsg("查询失败: " + String(e));
      setMode("none");
    }
  }

  async function onCreate() {
    const key = snapGuildKey(snap);
    if (!key) return;
    const region =
      key.flavor === "forever"
        ? coerceForeverRegionKey(regionKey)
        : regionKey.trim() || key.region_key;
    if (key.flavor === "forever" && region === "UNKNOWN") {
      setMsg("创建前请选择规则集");
      return;
    }
    try {
      await api.createGuild({
        name: key.guild_name,
        flavor: key.flavor,
        regionKey: region,
        realmName: key.realm_name,
      });
      await reload();
      setMsg("已创建，状态：待认证");
      setMode("member");
    } catch (e) {
      window.alert("创建失败: " + e);
    }
  }

  async function onJoin() {
    if (!lookup?.id) return;
    try {
      await api.applyJoinGuild(lookup.id, "");
      setMsg("已提交入会申请");
      setMode("none");
    } catch (e) {
      window.alert("申请失败: " + e);
    }
  }

  async function onClaim() {
    const key = snapGuildKey(snap);
    if (!lookup?.id || !key) return;
    try {
      await api.applyClaimGuild({
        guildId: lookup.id,
        characterName: key.character_name,
        realmName: key.realm_name,
        isLeader: true,
        message: "",
      });
      setMsg("已提交认领申请");
      setMode("none");
    } catch (e) {
      window.alert("认领失败: " + e);
    }
  }

  async function onSelect(g: MyGuild) {
    try {
      await api.selectGuild(g.id, g.name);
      await reload();
    } catch (e) {
      pushLog("error", String(e));
    }
  }

  async function decideJoin(appId: string, decision: "approve" | "reject") {
    if (!appsGuildId) return;
    await api.decideJoinApplication(appsGuildId, appId, decision);
    await reload();
  }

  async function verifyGuild(guildId: string, decision: "verify" | "reject") {
    await api.adminVerifyGuild(guildId, decision, "");
    await reload();
  }

  async function decideClaim(appId: string, decision: "approve" | "reject") {
    await api.adminDecideClaim(appId, decision);
    await reload();
  }

  const currentLabel = config?.guild_name
    ? config.guild_name
    : config?.guild_id || "未选择";

  return (
    <section className="card">
      <h2>公会</h2>
      <p>
        当前：<strong>{currentLabel}</strong>
      </p>
      <div id="guildList">
        {guilds.map((g) => (
          <button
            key={g.id}
            type="button"
            className={g.id === config?.guild_id ? "active" : undefined}
            onClick={() => void onSelect(g)}
          >
            {g.name} · {g.role} · {verificationLabel(g.verification_status)}
          </button>
        ))}
      </div>
      <div className="hint" style={{ marginTop: 10 }}>
        {guildInfoText(snap)}
      </div>
      <FormControl size="small" sx={{ mt: 1.25, minWidth: 220 }}>
        <InputLabel id="forever-ruleset-label">无限服规则集</InputLabel>
        <Select
          labelId="forever-ruleset-label"
          label="无限服规则集"
          value={coerceForeverRegionKey(regionKey)}
          onChange={(e) => setRegionKey(String(e.target.value))}
        >
          {FOREVER_RULESETS.map((r) => (
            <MenuItem key={r.value} value={r.value}>
              {r.label}
              {r.value !== "UNKNOWN" ? ` (${r.value})` : ""}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <p className="hint" style={{ marginTop: 6 }}>
        插件常读不出规则集（显示「{foreverRulesetLabel(snapRegion)}」）。查询/创建公会以这里选择为准，须与游戏内一致。
      </p>
      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap" }}>
        <Button variant="outlined" onClick={() => void onLookup()}>
          按快照查询
        </Button>
        {mode === "create" ? (
          <Button variant="contained" onClick={() => void onCreate()}>
            创建公会
          </Button>
        ) : null}
        {mode === "join" ? (
          <Button variant="contained" onClick={() => void onJoin()}>
            申请加入
          </Button>
        ) : null}
        {mode === "claim" ? (
          <Button variant="contained" onClick={() => void onClaim()}>
            申请认领
          </Button>
        ) : null}
      </Stack>
      {msg ? <p className="hint">{msg}</p> : <p className="hint" />}
      {apps.length ? (
        <div style={{ marginTop: 12 }}>
          <h3>入会申请</h3>
          {apps.map((a) => (
            <Stack
              key={a.id}
              direction="row"
              spacing={1}
              sx={{ mb: 0.75, alignItems: "center" }}
            >
              <span style={{ flex: 1 }}>
                {a.display_name || a.username}
                {a.message ? " · " + a.message : ""}
              </span>
              <Button size="small" onClick={() => void decideJoin(a.id, "approve")}>
                通过
              </Button>
              <Button
                size="small"
                variant="outlined"
                onClick={() => void decideJoin(a.id, "reject")}
              >
                拒绝
              </Button>
            </Stack>
          ))}
        </div>
      ) : null}
      {adminGuilds ? (
        <div style={{ marginTop: 12 }}>
          <h3>平台管理</h3>
          <div>
            <strong>待认证公会</strong>
            {adminGuilds.map((g) => (
              <Stack
                key={g.id}
                direction="row"
                spacing={1}
                sx={{ mt: 0.75, alignItems: "center" }}
              >
                <span style={{ flex: 1 }}>
                  {g.flavor}/
                  {g.flavor === "forever"
                    ? foreverRulesetLabel(g.region_key)
                    : g.region_key}
                  /{g.realm_name} · {g.name}
                  {g.created_by ? " · @" + g.created_by : ""}
                </span>
                <Button size="small" onClick={() => void verifyGuild(g.id, "verify")}>
                  认证
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => void verifyGuild(g.id, "reject")}
                >
                  拒绝
                </Button>
              </Stack>
            ))}
            {adminGuilds.length === 0 ? <p className="muted">无待认证公会</p> : null}
          </div>
          <div style={{ marginTop: 8 }}>
            <strong>待审认领</strong>
            {adminClaims.map((a) => (
              <Stack
                key={a.id}
                direction="row"
                spacing={1}
                sx={{ mt: 0.75, alignItems: "center" }}
              >
                <span style={{ flex: 1 }}>
                  {a.guild_name} · @{a.username}
                  {a.character_name ? " · " + a.character_name : ""}
                </span>
                <Button size="small" onClick={() => void decideClaim(a.id, "approve")}>
                  通过
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => void decideClaim(a.id, "reject")}
                >
                  拒绝
                </Button>
              </Stack>
            ))}
            {adminClaims.length === 0 ? <p className="muted">无待审认领</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
