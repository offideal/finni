-- Run once against existing databases after pulling schema with archived_at on projects.
-- Or use: pnpm --filter @workspace/db push
ALTER TABLE projects ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
