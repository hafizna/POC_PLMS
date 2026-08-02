import assert from "node:assert/strict";
import {
  activateApprovedProposal,
  approveDataChangeProposal,
  authorityRuleFor,
  createDataChangeProposal,
  createGovernedRevision,
  resolveEffectiveRevision,
  submitDataChangeProposal,
  validateRevisionChain,
  type GovernedRevision,
  type LineTechnicalRevisionPayload,
  type RelayInstallationRevisionPayload,
} from "../src/domain/ssot-governance";

const t0 = "2026-01-01T00:00:00.000Z";
const t1 = "2026-08-01T00:00:00.000Z";
const t2 = "2026-09-01T00:00:00.000Z";

assert.equal(authorityRuleFor("asset_identity").systemOfRecord, "external_asset_registry");
assert.equal(authorityRuleFor("actual_setting").systemOfRecord, "physical_relay_readback");
assert.equal(authorityRuleFor("source_document").plmsRole, "reference");
assert.throws(
  () =>
    createGovernedRevision({
      id: "invalid_payload_entity",
      entity: { kind: "relay_installation", id: "position_1" },
      revisionNumber: 1,
      caseId: "case_invalid",
      payload: {
        type: "line_technical",
        lineRelationId: "line_1",
      },
      sourceEvidenceIds: ["evidence_1"],
      createdAt: t0,
      createdBy: "Engineer",
    }),
  /tidak cocok dengan entity kind/
);

// Reconductoring: stable line identity, new technical revision, approval is not
// activation, and commissioning supersedes rather than overwrites the baseline.
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
const lineBaseline: GovernedRevision<LineTechnicalRevisionPayload> = {
  ...createGovernedRevision({
    id: "line_tech_rev_1",
    entity: lineEntity,
    revisionNumber: 1,
    caseId: "migration_seed",
    payload: lineBaselinePayload,
    sourceEvidenceIds: ["evidence_existing_registry"],
    createdAt: t0,
    createdBy: "Data Steward",
  }),
  state: "active",
  validFrom: t0,
};
const lineProposed = createGovernedRevision({
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
assert.deepEqual(validateRevisionChain([lineBaseline, lineProposed]), []);

const lineProposalReady = createDataChangeProposal({
  id: "proposal_reconductoring_1",
  caseId: "case_reconductoring_angke_ancol",
  target: lineEntity,
  baselineRevisionId: lineBaseline.id,
  proposedRevisionId: lineProposed.id,
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
assert.equal(lineProposalReady.status, "ready");
const lineSubmitted = submitDataChangeProposal(lineProposalReady, t1);
assert.throws(
  () =>
    approveDataChangeProposal({
      proposal: lineSubmitted,
      proposedRevision: lineProposed,
      approvedAt: t1,
      approvedBy: "Engineer UPT",
    }),
  /Creator proposal/
);
const lineApproved = approveDataChangeProposal({
  proposal: lineSubmitted,
  proposedRevision: lineProposed,
  approvedAt: t1,
  approvedBy: "Manager UPT",
});
assert.equal(lineApproved.proposal.status, "approved");
assert.equal(lineApproved.revision.state, "scheduled");
assert.equal(
  resolveEffectiveRevision([lineBaseline, lineApproved.revision], lineEntity, t1).revision?.id,
  lineBaseline.id,
  "approval must not activate the proposed technical revision"
);

const blockedLineActivation = activateApprovedProposal({
  proposal: lineApproved.proposal,
  proposedRevision: lineApproved.revision,
  existingRevisions: [lineBaseline, lineApproved.revision],
  trigger: "commissioning",
  activatedAt: t2,
  activatedBy: "Commissioning Engineer",
  evidenceIds: [],
  eventId: "activation_reconductoring_blocked",
});
assert.equal(blockedLineActivation.ok, false);

const missingBaselineActivation = activateApprovedProposal({
  proposal: lineApproved.proposal,
  proposedRevision: lineApproved.revision,
  existingRevisions: [lineApproved.revision],
  trigger: "commissioning",
  activatedAt: t2,
  activatedBy: "Commissioning Engineer",
  evidenceIds: ["commissioning_ba_1"],
  eventId: "activation_without_current_baseline",
});
assert.equal(missingBaselineActivation.ok, false);
if (missingBaselineActivation.ok) throw new Error("Expected missing baseline failure");
assert.ok(missingBaselineActivation.errors.some((error) => error.includes("tidak ada active revision")));

const lineActivation = activateApprovedProposal({
  proposal: lineApproved.proposal,
  proposedRevision: lineApproved.revision,
  existingRevisions: [lineBaseline, lineApproved.revision],
  trigger: "commissioning",
  activatedAt: t2,
  activatedBy: "Commissioning Engineer",
  evidenceIds: ["commissioning_ba_1", "readback_1"],
  eventId: "activation_reconductoring_1",
});
assert.equal(lineActivation.ok, true);
if (!lineActivation.ok) throw new Error(lineActivation.errors.join(", "));
assert.equal(lineActivation.supersededRevision?.id, lineBaseline.id);
assert.equal(lineActivation.supersededRevision?.validTo, t2);
assert.equal(lineActivation.activatedRevision.id, lineProposed.id);
assert.equal(lineActivation.event.evidenceIds.length, 2);
assert.equal(
  resolveEffectiveRevision(lineActivation.revisions, lineEntity, t2).revision?.id,
  lineProposed.id
);

// Relay replacement versions the installation position, not the physical IED
// identity. Both IED IDs remain addressable; only the bay/role assignment changes.
const installationEntity = {
  kind: "relay_installation" as const,
  id: "installation_angke_ancol_1_main_1",
};
const oldInstallation: GovernedRevision<RelayInstallationRevisionPayload> = {
  ...createGovernedRevision({
    id: "relay_install_rev_1",
    entity: installationEntity,
    revisionNumber: 1,
    caseId: "migration_seed",
    payload: {
      type: "relay_installation",
      bayId: "bay_angke_ancol_1",
      slotRole: "main_1",
      relayIedId: "ied_micom_p545_old",
      ctRevisionId: "ct_rev_1",
      vtRevisionId: "vt_rev_1",
    },
    sourceEvidenceIds: ["existing_asset_registry"],
    createdAt: t0,
    createdBy: "Data Steward",
  }),
  state: "active",
  validFrom: t0,
};
const newInstallation = createGovernedRevision({
  id: "relay_install_rev_2",
  entity: installationEntity,
  revisionNumber: 2,
  predecessorRevisionId: oldInstallation.id,
  caseId: "case_relay_replacement",
  payload: {
    ...oldInstallation.payload,
    relayIedId: "ied_replacement_new",
  },
  sourceEvidenceIds: ["relay_replacement_work_order", "new_relay_datasheet"],
  createdAt: t1,
  createdBy: "Engineer UPT",
});
const relayProposal = createDataChangeProposal({
  id: "proposal_relay_replacement",
  caseId: "case_relay_replacement",
  target: installationEntity,
  baselineRevisionId: oldInstallation.id,
  proposedRevisionId: newInstallation.id,
  reason: "Penggantian relay main 1",
  fieldChanges: [
    {
      fieldPath: "relayIedId",
      beforeValue: "ied_micom_p545_old",
      proposedValue: "ied_replacement_new",
      sourceEvidenceIds: ["relay_replacement_work_order", "new_relay_datasheet"],
    },
  ],
  sourceEvidenceIds: ["relay_replacement_work_order", "new_relay_datasheet"],
  activationPolicy: "commissioning",
  createdAt: t1,
  createdBy: "Engineer UPT",
});
const relayApproved = approveDataChangeProposal({
  proposal: submitDataChangeProposal(relayProposal, t1),
  proposedRevision: newInstallation,
  approvedAt: t1,
  approvedBy: "Manager UPT",
});
const relayActivation = activateApprovedProposal({
  proposal: relayApproved.proposal,
  proposedRevision: relayApproved.revision,
  existingRevisions: [oldInstallation, relayApproved.revision],
  trigger: "commissioning",
  activatedAt: t2,
  activatedBy: "Commissioning Engineer",
  evidenceIds: ["relay_readback_after_install"],
  eventId: "activation_relay_replacement",
});
assert.equal(relayActivation.ok, true);
if (!relayActivation.ok) throw new Error(relayActivation.errors.join(", "));
assert.equal(relayActivation.activatedRevision.payload.relayIedId, "ied_replacement_new");
assert.equal(relayActivation.supersededRevision?.payload.relayIedId, "ied_micom_p545_old");
assert.equal(relayActivation.activatedRevision.entity.id, oldInstallation.entity.id);

// Two active revisions for the same instant are a data conflict, never a
// "latest row wins" situation.
const conflict = resolveEffectiveRevision(
  [
    lineBaseline,
    { ...lineBaseline, id: "line_tech_conflict", revisionNumber: 99 },
  ],
  lineEntity,
  t1
);
assert.equal(conflict.revision, undefined);
assert.equal(conflict.conflicts.length, 1);

console.log(
  "SSOT governance regression passed: authority, stable identity, immutable revision chain, approval/activation separation, commissioning evidence, supersession, and conflict detection."
);
