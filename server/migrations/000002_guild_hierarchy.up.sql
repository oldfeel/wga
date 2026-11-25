-- Guild hierarchy, verification, join/claim applications, platform admin

CREATE TYPE verification_status AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE application_status AS ENUM ('pending', 'approved', 'rejected');

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS servers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    flavor          TEXT NOT NULL,
    region_key      TEXT NOT NULL,
    realm_name      TEXT NOT NULL,
    display_label   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_servers_identity UNIQUE (flavor, region_key, realm_name)
);

ALTER TABLE guilds
    ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES servers (id),
    ADD COLUMN IF NOT EXISTS verification_status verification_status NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES users (id) ON DELETE SET NULL;

-- Backfill legacy guilds onto a synthetic server
INSERT INTO servers (flavor, region_key, realm_name, display_label)
VALUES ('forever', 'UNKNOWN', 'legacy', 'Legacy (pre-hierarchy)')
ON CONFLICT (flavor, region_key, realm_name) DO NOTHING;

UPDATE guilds g
SET server_id = s.id
FROM servers s
WHERE g.server_id IS NULL
  AND s.flavor = 'forever'
  AND s.region_key = 'UNKNOWN'
  AND s.realm_name = 'legacy';

-- Deduplicate names under the same server before unique index
UPDATE guilds SET name = name || ' (' || substr(id::text, 1, 8) || ')'
WHERE id IN (
    SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                   PARTITION BY server_id, lower(btrim(name))
                   ORDER BY created_at
               ) AS rn
        FROM guilds
        WHERE server_id IS NOT NULL
    ) t
    WHERE rn > 1
);

ALTER TABLE guilds ALTER COLUMN server_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_guilds_server_name
    ON guilds (server_id, lower(btrim(name)));

CREATE TABLE IF NOT EXISTS guild_join_applications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id        UUID NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status          application_status NOT NULL DEFAULT 'pending',
    message         TEXT,
    reviewed_by     UUID REFERENCES users (id) ON DELETE SET NULL,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_join_app_pending
    ON guild_join_applications (guild_id, user_id)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_join_app_guild_status
    ON guild_join_applications (guild_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS guild_claim_applications (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id        UUID NOT NULL REFERENCES guilds (id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    status          application_status NOT NULL DEFAULT 'pending',
    character_name  TEXT,
    realm_name      TEXT,
    is_leader       BOOLEAN NOT NULL DEFAULT true,
    message         TEXT,
    reviewed_by     UUID REFERENCES users (id) ON DELETE SET NULL,
    reviewed_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_claim_app_pending
    ON guild_claim_applications (guild_id, user_id)
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_claim_app_status
    ON guild_claim_applications (status, created_at DESC);
