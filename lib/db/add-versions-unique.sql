-- Optional: enforce one row per (project_id, version_number). Run if upgrading an existing DB.
CREATE UNIQUE INDEX IF NOT EXISTS versions_project_version_uq ON versions (project_id, version_number);
