-- One-time migration: building rows move from project_id to version_id (one snapshot per version).
-- Run manually if upgrading an existing database before drizzle push.

ALTER TABLE buildings ADD COLUMN IF NOT EXISTS version_id text;

UPDATE buildings b
SET version_id = (
  SELECT v.id
  FROM versions v
  WHERE v.project_id = b.project_id
  ORDER BY v.version_number ASC
  LIMIT 1
)
WHERE b.version_id IS NULL AND b.project_id IS NOT NULL;

ALTER TABLE buildings DROP COLUMN IF EXISTS project_id;

CREATE UNIQUE INDEX IF NOT EXISTS buildings_version_id_unique ON buildings (version_id);
CREATE INDEX IF NOT EXISTS buildings_version_id_idx ON buildings (version_id);

ALTER TABLE buildings ALTER COLUMN version_id SET NOT NULL;
