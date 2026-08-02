// SSOT-2D.1 slice 2: proves D1GovernedDataRepository persists exactly what
// activateApprovedProposal() (ssot-governance.ts) already validated, using
// the same reconductoring scenario test-ssot-governance.ts exercises
// directly against the domain function. This is a persistence-parity test,
// not a re-test of the business rule — the rule is already locked by
// test:ssot-governance.
import assert from "node:assert/strict";
import {
  createDataChangeProposal,
  createGovernedRevision,
  submitDataChangeProposal,
  approveDataChangeProposal,
  type LineTechnicalRevisionPayload,
} from "../src/domain/ssot-governance";
import { RepositoryConflictError } from "../src/repositories/protection-lifecycle-repository";
import { applyMigration, openLocalDatabase, BetterSqlite3Driver } from "../src/repositories/d1/better-sqlite3-driver";
import { D1GovernedDataRepository } from "../src/repositories/d1/d1-governed-data-repository";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(currentDir, "..", "migrations");
const migrationFiles = ["0001_setting_case.sql", "0002_governed_revision.sql"];

const db = openLocalDatabase(":memory:");
for (const file of migrationFiles) {
  applyMigration(db, fs.readFileSync(path.join(migrationsDir, file), "utf-8"));
}
const driver = new BetterSqlite3Driver(db);
const repo = new D1GovernedDataRepository(driver);

const t0 = "2026-01-01T00:00:00.000Z";
const t1 = "2026-08-01T00:00:00.000Z";
const t2 = "2026-09-01T00:00:00.000Z";

const lineEntity = { kind: "line_technical" as const, id: "line_angke_ancol_1" };
const lineBaselinePayload: LineTechnicalRevisionPayload = {
  type: "line_technical",
  lineRelationId: "line_angke_ancol_1",
  conductorDesignation: "ACSR Zebra",
  currentRatingA: 1200,
  physicalLengthKm: 8.2,
  r1Ohm: 0.21,
  x1Ohm: 0.82,
  r0Ohm: 0.63,
  x0Ohm: 2.46,
};
const lineBaselineDraft = createGovernedRevision({
  id: "line_tech_rev_1",
  entity: lineEntity,
  revisionNumber: 1,
  caseId: "migration_seed",
  payload: lineBaselinePayload,
  sourceEvidenceIds: ["evidence_existing_registry"],
  createdAt: t0,
  createdBy: "Data Steward",
});
const lineBaseline = { ...lineBaselineDraft, state: "active" as const, validFrom: t0 };
await repo.saveDraftRevision(lineBaseline);

const lineProposedDraft = createGovernedRevision({
  id: "line_tech_rev_2",
  entity: lineEntity,
  revisionNumber: 2,
  predecessorRevisionId: lineBaseline.id,
  caseId: "case_reconductoring_angke_ancol",
  payload: {
    ...lineBaselinePayload,
    conductorDesignation: "ACSR 2xZebra",
    currentRatingA: 1600,
    r1Ohm: 0.16,
    x1Ohm: 0.75,
  },
  sourceEvidenceIds: ["evidence_reconductoring_design"],
  createdAt: t1,
  createdBy: "Engineer UPT",
});
const savedProposedDraft = await repo.saveDraftRevision(lineProposedDraft);
assert.equal(savedProposedDraft.record.state, "draft");

// detached read: mutating the returned record must not affect stored state
(savedProposedDraft.record as { state: string }).state = "active";
const revisionsAfterMutationAttempt = await repo.listRevisions(lineEntity);
assert.equal(
  revisionsAfterMutationAttempt.find((r) => r.id === lineProposedDraft.id)?.state,
  "draft",
  "mutating a returned revision record must not affect stored state"
);

const proposalReady = createDataChangeProposal({
  id: "proposal_reconductoring_1",
  caseId: "case_reconductoring_angke_ancol",
  target: lineEntity,
  baselineRevisionId: lineBaseline.id,
  proposedRevisionId: lineProposedDraft.id,
  reason: "Rekonduktoring permanen Angke–Ancol #1",
  fieldChanges: [
    {
      fieldPath: "conductorDesignation",
      beforeValue: "ACSR Zebra",
      proposedValue: "ACSR 2xZebra",
      sourceEvidenceIds: ["evidence_reconductoring_design"],
    },
    {
      fieldPath: "currentRatingA",
      beforeValue: 1200,
      proposedValue: 1600,
      unit: "A",
      sourceEvidenceIds: ["evidence_reconductoring_design"],
    },
  ],
  sourceEvidenceIds: ["evidence_reconductoring_design"],
  activationPolicy: "commissioning",
  plannedEffectiveAt: t2,
  createdAt: t1,
  createdBy: "Engineer UPT",
});
assert.equal(proposalReady.status, "ready");

const savedProposal = await repo.saveProposal(proposalReady);
assert.equal(savedProposal.version, "v1");

// optimistic concurrency on the proposal row
await assert.rejects(
  () => repo.saveProposal(proposalReady, { expectedVersion: "v0" }),
  RepositoryConflictError
);

const submitted = submitDataChangeProposal(savedProposal.record, t1);
const savedSubmitted = await repo.saveProposal(submitted, { expectedVersion: "v1" });
assert.equal(savedSubmitted.record.status, "submitted");

const approved = approveDataChangeProposal({
  proposal: savedSubmitted.record,
  proposedRevision: lineProposedDraft,
  approvedAt: t1,
  approvedBy: "Manager UPT",
});
await repo.saveDraftRevision(approved.revision, undefined);
const savedApproved = await repo.saveProposal(approved.proposal, { expectedVersion: "v2" });
assert.equal(savedApproved.record.status, "approved");

// commissioning activation with no evidence must fail closed — this is
// activateApprovedProposal()'s own rule (ssot-governance.ts, "Commissioning
// activation membutuhkan implementation/readback evidence"); the repository
// layer must surface that rejection, not swallow or bypass it.
await assert.rejects(() =>
  repo.activate({
    proposalId: savedApproved.record.id,
    proposedRevisionId: lineProposedDraft.id,
    expectedBaselineRevisionId: lineBaseline.id,
    activatedAt: t2,
    activatedBy: "Commissioning Engineer",
    trigger: "commissioning",
    evidenceIds: [],
  })
);

// the real activation: full atomic commit
const commit = await repo.activate({
  proposalId: savedApproved.record.id,
  proposedRevisionId: lineProposedDraft.id,
  expectedBaselineRevisionId: lineBaseline.id,
  activatedAt: t2,
  activatedBy: "Commissioning Engineer",
  trigger: "commissioning",
  evidenceIds: ["commissioning_ba_1", "readback_1"],
});
assert.equal(commit.activatedRevision.id, lineProposedDraft.id);
assert.equal(commit.activatedRevision.state, "active");
assert.equal(commit.supersededRevision?.id, lineBaseline.id);
assert.equal(commit.supersededRevision?.state, "superseded");
assert.equal(commit.supersededRevision?.validTo, t2);
assert.equal(commit.proposal.status, "activated");
assert.equal(commit.event.evidenceIds.length, 2);

// persisted state reflects the commit: exactly one active revision remains
const revisionsAfterActivation = await repo.listRevisions(lineEntity);
const activeRevisions = revisionsAfterActivation.filter((r) => r.state === "active");
assert.equal(activeRevisions.length, 1);
assert.equal(activeRevisions[0].id, lineProposedDraft.id);

const resolved = await repo.resolveEffective(lineEntity, t2);
assert.equal(resolved.revision?.id, lineProposedDraft.id);
assert.equal(resolved.conflicts.length, 0);

// re-activating an already-activated proposal must fail closed, not
// silently re-supersede — proposal.status is no longer 'approved'.
await assert.rejects(() =>
  repo.activate({
    proposalId: savedApproved.record.id,
    proposedRevisionId: lineProposedDraft.id,
    expectedBaselineRevisionId: lineBaseline.id,
    activatedAt: t2,
    activatedBy: "Commissioning Engineer",
    trigger: "commissioning",
    evidenceIds: ["commissioning_ba_1"],
  })
);

db.close();

console.log(
  "D1 governed data repository regression passed: draft/proposal persistence, detached reads, optimistic concurrency, atomic activation matching activateApprovedProposal(), and fail-closed re-activation."
);
