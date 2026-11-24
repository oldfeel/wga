-- WGA MVP schema
-- PostgreSQL 16+；面向单公会～少量公会自托管

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE guild_role AS ENUM ('owner', 'officer', 'member');
CREATE TYPE activity_status AS ENUM ('draft', 'open', 'locked', 'done', 'cancelled');
CREATE TYPE signup_status AS ENUM ('signed', 'backup', 'declined', 'checked_in');

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    display_name    TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE guilds (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    invite_code     TEXT NOT NULL UNIQUE,
    created_by      UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE guild_members (
    guild_id        UUID NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role            guild_role NOT NULL DEFAULT 'member',
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (guild_id, user_id)
);

CREATE INDEX idx_guild_members_user ON guild_members (user_id);

-- 角色档案（公会内逻辑唯一：realm + name）
CREATE TABLE characters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id        UUID NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
    owner_user_id   UUID REFERENCES users (id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    realm           TEXT NOT NULL,
    race            TEXT,
    class           TEXT,
    spec            TEXT,
    level           INT,
    item_level      NUMERIC(6, 1),
    availability_note TEXT,
    last_snapshot_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (guild_id, realm, name)
);

CREATE INDEX idx_characters_guild ON characters (guild_id);
CREATE INDEX idx_characters_class_spec ON characters (guild_id, class, spec);

-- 整包快照用 JSONB，避免过早拆表；筛选依赖生成列 / 表达式索引可二期加
CREATE TABLE snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    character_id    UUID NOT NULL REFERENCES characters (id) ON DELETE CASCADE,
    guild_id        UUID NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
    uploaded_by     UUID REFERENCES users (id) ON DELETE SET NULL,
    schema_version  INT NOT NULL DEFAULT 1,
    addon_version   TEXT,
    captured_at     TIMESTAMPTZ NOT NULL,
    payload         JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_snapshots_character_time ON snapshots (character_id, captured_at DESC);
CREATE INDEX idx_snapshots_guild_time ON snapshots (guild_id, captured_at DESC);
CREATE INDEX idx_snapshots_payload_gin ON snapshots USING GIN (payload jsonb_path_ops);

CREATE TABLE activities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id        UUID NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ,
    status          activity_status NOT NULL DEFAULT 'open',
    created_by      UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activities_guild_starts ON activities (guild_id, starts_at DESC);

CREATE TABLE activity_signups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id     UUID NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    character_id    UUID REFERENCES characters (id) ON DELETE SET NULL,
    status          signup_status NOT NULL DEFAULT 'signed',
    note            TEXT,
    signed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    checked_in_at   TIMESTAMPTZ,
    UNIQUE (activity_id, user_id)
);

CREATE INDEX idx_activity_signups_activity ON activity_signups (activity_id);

-- 排表：活动下的坑位 / 分组
CREATE TABLE activity_rosters (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    activity_id     UUID NOT NULL REFERENCES activities (id) ON DELETE CASCADE,
    character_id    UUID REFERENCES characters (id) ON DELETE SET NULL,
    user_id         UUID REFERENCES users (id) ON DELETE SET NULL,
    group_name      TEXT,
    slot_role       TEXT,
    sort_order      INT NOT NULL DEFAULT 0,
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_activity_rosters_activity ON activity_rosters (activity_id, sort_order);

-- 公告：MVP 可选用；表先建好
CREATE TABLE announcements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id        UUID NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    body            TEXT NOT NULL,
    created_by      UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_announcements_guild ON announcements (guild_id, created_at DESC);
