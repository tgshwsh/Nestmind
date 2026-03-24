-- ============================================================
-- 1. day_notes  (note cards that sync across devices)
-- ============================================================
CREATE TABLE IF NOT EXISTS day_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id   UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  note_date   DATE NOT NULL,
  content     TEXT NOT NULL DEFAULT '',
  tags        TEXT[] NOT NULL DEFAULT '{}',
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS day_notes_family_date_idx
  ON day_notes(family_id, note_date);

-- ============================================================
-- 2. milestones  – add description column if missing
-- ============================================================
ALTER TABLE milestones ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';

-- ============================================================
-- 3. milestone_records  (one row per record entry per day)
-- ============================================================
CREATE TABLE IF NOT EXISTS milestone_records (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id    UUID NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  milestone_id UUID REFERENCES milestones(id) ON DELETE SET NULL,
  record_date  DATE NOT NULL,
  content      TEXT NOT NULL DEFAULT '',
  created_by   UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mrecords_family_date
  ON milestone_records(family_id, record_date);
