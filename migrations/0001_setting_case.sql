-- SSOT-2D.1 slice 1: setting_case + case_stage_event only.
-- Scope matches docs/adr/0001-ssot-2d0-persistence-and-authority-design.md
-- §4.2. governed_revision / data_change_proposal / data_activation_event /
-- source_observation / audit_event follow in a later slice once this
-- repository's contract-test parity is proven.

CREATE TABLE IF NOT EXISTS setting_case (
  id                      TEXT PRIMARY KEY,
  case_type               TEXT NOT NULL,
  title                   TEXT NOT NULL,
  description             TEXT,
  primary_reason          TEXT NOT NULL,
  change_items_json       TEXT NOT NULL,
  urgency                 TEXT NOT NULL,
  flow_profile_json       TEXT NOT NULL,
  planned_effective_date  TEXT,
  owning_unit             TEXT NOT NULL,
  remote_unit             TEXT,
  protected_scope_json    TEXT NOT NULL,
  baseline_json           TEXT,
  proposed_data_revisions_json TEXT NOT NULL,
  impact_assessments_json TEXT NOT NULL,
  study_bindings_json     TEXT NOT NULL,
  study_package_bindings_json TEXT NOT NULL,
  links_json              TEXT NOT NULL,
  stage                   TEXT NOT NULL,
  created_at              TEXT NOT NULL,
  updated_at              TEXT NOT NULL,
  created_by              TEXT NOT NULL,
  row_version              INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS case_stage_event (
  id       TEXT PRIMARY KEY,
  case_id  TEXT NOT NULL REFERENCES setting_case(id),
  stage    TEXT NOT NULL,
  at       TEXT NOT NULL,
  actor    TEXT NOT NULL,
  note     TEXT
);

CREATE INDEX IF NOT EXISTS idx_case_stage_event_case_id ON case_stage_event(case_id);
