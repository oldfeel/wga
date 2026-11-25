DROP INDEX IF EXISTS idx_claim_app_status;
DROP INDEX IF EXISTS uq_claim_app_pending;
DROP TABLE IF EXISTS guild_claim_applications;

DROP INDEX IF EXISTS idx_join_app_guild_status;
DROP INDEX IF EXISTS uq_join_app_pending;
DROP TABLE IF EXISTS guild_join_applications;

DROP INDEX IF EXISTS uq_guilds_server_name;

ALTER TABLE guilds
    DROP COLUMN IF EXISTS verified_by,
    DROP COLUMN IF EXISTS verified_at,
    DROP COLUMN IF EXISTS verification_status,
    DROP COLUMN IF EXISTS server_id;

DROP TABLE IF EXISTS servers;

ALTER TABLE users DROP COLUMN IF EXISTS is_admin;

DROP TYPE IF EXISTS application_status;
DROP TYPE IF EXISTS verification_status;
