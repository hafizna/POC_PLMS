-- SSOT-2D.1 slice 2: governed_revision + data_change_proposal +
-- data_activation_event. Matches docs/adr/0001-ssot-2d0-persistence-and-
-- authority-design.md §4.2. source_observation / audit_event /
-- entity_current_observation (§4.4 of the ADR) remain a later slice.

CREATE TABLE IF NOT EXISTS canonical_entity (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  external_ref TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS governed_revision (
  id                        TEXT PRIMARY KEY,
  entity_id                 TEXT NOT NULL,
  entity_kind                TEXT NOT NULL,
  revision_number             INTEGER NOT NULL,
  predecessor_revision_id     TEXT REFERENCES governed_revision(id),
  case_id                     TEXT NOT NULL,
  state                       TEXT NOT NULL,
  payload_type                TEXT NOT NULL,
  payload_json                TEXT NOT NULL,
  source_evidence_ids         TEXT NOT NULL,
  created_at                  TEXT NOT NULL,
  created_by                  TEXT NOT NULL,
  approved_at                 TEXT,
  approved_by                 TEXT,
  valid_from                  TEXT,
  valid_to                    TEXT,
  fingerprint                 TEXT NOT NULL,
  UNIQUE(entity_id, revision_number)
);

CREATE INDEX IF NOT EXISTS idx_governed_revision_entity
  ON governed_revision(entity_id, state);

CREATE TABLE IF NOT EXISTS data_change_proposal (
  id                     TEXT PRIMARY KEY,
  case_id                 TEXT NOT NULL,
  target_entity_id         TEXT NOT NULL,
  target_entity_kind        TEXT NOT NULL,
  baseline_revision_id      TEXT NOT NULL REFERENCES governed_revision(id),
  proposed_revision_id      TEXT NOT NULL REFERENCES governed_revision(id),
  reason                    TEXT NOT NULL,
  field_changes_json        TEXT NOT NULL,
  source_evidence_ids       TEXT NOT NULL,
  activation_policy         TEXT NOT NULL,
  planned_effective_at      TEXT,
  status                    TEXT NOT NULL,
  validation_json           TEXT NOT NULL,
  created_at                TEXT NOT NULL,
  created_by                TEXT NOT NULL,
  submitted_at               TEXT,
  approved_at                TEXT,
  approved_by                TEXT,
  activated_at                TEXT,
  fingerprint                 TEXT NOT NULL,
  row_version                  INTEGER NOT NULL DEFAULT 1,
  CHECK (approved_by IS NULL OR approved_by != created_by)
);

CREATE TABLE IF NOT EXISTS data_activation_event (
  id                       TEXT PRIMARY KEY,
  proposal_id               TEXT NOT NULL REFERENCES data_change_proposal(id),
  case_id                    TEXT NOT NULL,
  entity_id                  TEXT NOT NULL,
  entity_kind                 TEXT NOT NULL,
  activated_revision_id       TEXT NOT NULL REFERENCES governed_revision(id),
  superseded_revision_id      TEXT REFERENCES governed_revision(id),
  trigger                     TEXT NOT NULL,
  activated_at                TEXT NOT NULL,
  activated_by                TEXT NOT NULL,
  evidence_ids                 TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_data_activation_event_proposal
  ON data_activation_event(proposal_id);
