-- SSOT-2D.1 slice 3: source_observation + audit_event. Completes the
-- ProtectionLifecycleRepositories port set (settingCases, governedData,
-- sourceObservations, audit). entity_current_observation (ADR §4.4) is not
-- included — it needs an authority-ordering design decision first.

CREATE TABLE IF NOT EXISTS source_observation (
  id              TEXT PRIMARY KEY,
  domain          TEXT NOT NULL,
  source_system   TEXT NOT NULL,
  external_id     TEXT,
  captured_at     TEXT NOT NULL,
  captured_by     TEXT NOT NULL,
  artifact_ref    TEXT NOT NULL,
  checksum_algo   TEXT,
  checksum_value  TEXT,
  status          TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_source_observation_domain
  ON source_observation(domain);

CREATE TABLE IF NOT EXISTS audit_event (
  id         TEXT PRIMARY KEY,
  at         TEXT NOT NULL,
  actor      TEXT NOT NULL,
  action     TEXT NOT NULL,
  scope      TEXT,
  target_id  TEXT,
  summary    TEXT NOT NULL,
  detail     TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_event_scope ON audit_event(scope);
