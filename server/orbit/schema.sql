-- Orbit layer (docs/backend/ORBIT.md). Elements are facts; positions are derived, never stored.
-- A satellite in several groups (starlink and active) is one orbit_object row with two orbit_membership rows.
CREATE TABLE IF NOT EXISTS orbit_object (
  norad INTEGER PRIMARY KEY, name TEXT NOT NULL, intl_designator TEXT);
CREATE TABLE IF NOT EXISTS orbit_group (
  id TEXT PRIMARY KEY, label TEXT NOT NULL, kind TEXT NOT NULL, default_on INTEGER NOT NULL, credit TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS orbit_membership (
  norad INTEGER NOT NULL REFERENCES orbit_object(norad), group_id TEXT NOT NULL REFERENCES orbit_group(id),
  PRIMARY KEY (norad, group_id));
CREATE TABLE IF NOT EXISTS orbit_elements (
  norad INTEGER PRIMARY KEY REFERENCES orbit_object(norad), epoch TEXT NOT NULL, line1 TEXT NOT NULL, line2 TEXT NOT NULL,
  source TEXT NOT NULL, quality TEXT NOT NULL, fetched_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS orbit_membership_by_group ON orbit_membership (group_id);
