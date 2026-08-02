// SSOT-2D.1 slice 3: proves D1SourceObservationRepository and
// D1AuditRepository honor their port contracts — append, read-by-id,
// listByIds order/filter, scope-filtered list, and detached reads.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SourceObservation } from "../src/domain/ssot-governance";
import type { RepositoryAuditEvent } from "../src/repositories/protection-lifecycle-repository";
import { applyMigration, openLocalDatabase, BetterSqlite3Driver } from "../src/repositories/d1/better-sqlite3-driver";
import { D1SourceObservationRepository } from "../src/repositories/d1/d1-source-observation-repository";
import { D1AuditRepository } from "../src/repositories/d1/d1-audit-repository";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(currentDir, "..", "migrations");
const migrationFiles = [
  "0001_setting_case.sql",
  "0002_governed_revision.sql",
  "0003_source_observation_audit.sql",
];

const db = openLocalDatabase(":memory:");
for (const file of migrationFiles) {
  applyMigration(db, fs.readFileSync(path.join(migrationsDir, file), "utf-8"));
}
const driver = new BetterSqlite3Driver(db);

// --- SourceObservationRepository ---
const sourceObservations = new D1SourceObservationRepository(driver);

const observationWithChecksum: SourceObservation = {
  id: "obs_readback_1",
  domain: "actual_setting",
  sourceSystem: "MiCOM S1 Agile",
  capturedAt: "2026-08-03T00:00:00.000Z",
  capturedBy: "Field Engineer",
  artifactRef: "r2://evidence/obs_readback_1.rio",
  checksum: { algorithm: "sha256", value: "abc123" },
  status: "accepted_evidence",
};
const observationWithoutChecksum: SourceObservation = {
  id: "obs_pdf_1",
  domain: "issued_setting",
  sourceSystem: "TAP PDF",
  capturedAt: "2026-08-02T00:00:00.000Z",
  capturedBy: "Data Steward",
  artifactRef: "r2://evidence/obs_pdf_1.pdf",
  status: "candidate",
};

const savedWithChecksum = await sourceObservations.append(observationWithChecksum);
assert.deepEqual(savedWithChecksum, observationWithChecksum);
const savedWithoutChecksum = await sourceObservations.append(observationWithoutChecksum);
assert.deepEqual(savedWithoutChecksum, observationWithoutChecksum);

// detached read: mutating the returned record must not affect stored state
(savedWithChecksum as { status: string }).status = "rejected";
assert.equal((await sourceObservations.getById("obs_readback_1"))?.status, "accepted_evidence");

assert.equal((await sourceObservations.getById("obs_missing"))?.id, undefined);

// listByIds preserves caller order and drops unknown ids
const listed = await sourceObservations.listByIds(["obs_pdf_1", "obs_missing", "obs_readback_1"]);
assert.deepEqual(
  listed.map((o) => o.id),
  ["obs_pdf_1", "obs_readback_1"]
);
assert.deepEqual(await sourceObservations.listByIds([]), []);

// --- AuditRepository ---
const audit = new D1AuditRepository(driver);

const eventA: RepositoryAuditEvent = {
  id: "audit_1",
  at: "2026-08-03T00:00:00.000Z",
  actor: "Engineer",
  action: "case.created",
  scope: "case_angke_ancol_1",
  summary: "Setting Case dibuat",
};
const eventB: RepositoryAuditEvent = {
  id: "audit_2",
  at: "2026-08-03T01:00:00.000Z",
  actor: "Engineer",
  action: "case.stage_advanced",
  scope: "case_angke_ancol_1",
  targetId: "case_angke_ancol_1",
  summary: "Case maju ke scoping",
  detail: "draft -> scoping",
};
const eventC: RepositoryAuditEvent = {
  id: "audit_3",
  at: "2026-08-03T02:00:00.000Z",
  actor: "Engineer",
  action: "case.created",
  scope: "case_other_line_1",
  summary: "Setting Case lain dibuat",
};

const savedEventA = await audit.append(eventA);
assert.deepEqual(savedEventA, eventA);
await audit.append(eventB);
await audit.append(eventC);

// detached read on append's own return value
(savedEventA as { summary: string }).summary = "mutated";
const allEvents = await audit.list();
assert.equal(allEvents.find((e) => e.id === "audit_1")?.summary, "Setting Case dibuat");
assert.equal(allEvents.length, 3);

const scopedEvents = await audit.list("case_angke_ancol_1");
assert.deepEqual(
  scopedEvents.map((e) => e.id),
  ["audit_1", "audit_2"]
);
assert.equal(scopedEvents[1].detail, "draft -> scoping");

db.close();

console.log(
  "D1 source observation + audit repository regression passed: append/read, listByIds order and unknown-id filtering, scope-filtered audit list, and detached reads."
);
