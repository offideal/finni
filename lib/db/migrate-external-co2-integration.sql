-- External CO₂ integration: registry, emission factor lineage, product snapshot fields.
-- Run manually against existing DBs before relying on new columns (or use drizzle push in dev).

CREATE TABLE IF NOT EXISTS external_co2_sources (
  id text PRIMARY KEY,
  key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  description text
);

ALTER TABLE emission_factors ADD COLUMN IF NOT EXISTS external_source_key text;
ALTER TABLE emission_factors ADD COLUMN IF NOT EXISTS external_record_id text;
ALTER TABLE emission_factors ADD COLUMN IF NOT EXISTS last_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS emission_factors_external_lineage_idx
  ON emission_factors (tenant_id, external_source_key, external_record_id);

ALTER TABLE products ADD COLUMN IF NOT EXISTS emission_external_source_key text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS emission_external_record_id text;
