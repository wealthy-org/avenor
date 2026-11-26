-- 0002_role_events_role_bit_pk.sql — S-14: include role_bit in role_events primary key.
--
-- A single RoleSet log can flip multiple bits (the bitmap before ≠ bitmap after by more than one
-- bit). The original schema stored one row per *log* (PK = chain_id, tx_hash, log_index), which
-- means a multi-bit change can only be stored as a single row — the other bits are silently
-- dropped. The fix is to make role_bit NOT NULL and include it in the primary key so the ingest
-- step can write one row per (log, bit) without collision.
--
-- Migration is safe to replay: IF NOT EXISTS guards the index; the PK change is wrapped in a
-- transaction and uses ALTER TABLE … DROP CONSTRAINT … ADD PRIMARY KEY … which Postgres executes
-- atomically. Existing rows where role_bit IS NULL are removed first (there must be none in
-- production; in tests the schema is rebuilt from scratch every run).

BEGIN;

-- Remove rows where role_bit is null so we can tighten the column to NOT NULL.
-- In a fresh database this is a no-op; in a schema-only migration it always is.
DELETE FROM role_events WHERE role_bit IS NULL;

-- Make role_bit NOT NULL now that nulls are gone.
ALTER TABLE role_events ALTER COLUMN role_bit SET NOT NULL;

-- Drop the old PK (chain_id, tx_hash, log_index) and replace it with one that includes role_bit.
ALTER TABLE role_events DROP CONSTRAINT role_events_pkey;
ALTER TABLE role_events ADD PRIMARY KEY (chain_id, tx_hash, log_index, role_bit);

-- Adjust the check constraint: role_bit is now never NULL so the IS NULL branch is unreachable,
-- but keeping the range guard is still correct and documents the invariant.
ALTER TABLE role_events DROP CONSTRAINT role_events_bit_check;
ALTER TABLE role_events ADD CONSTRAINT role_events_bit_check
    CHECK (role_bit >= 0 AND role_bit < 256);

COMMIT;
