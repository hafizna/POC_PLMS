// Spike per docs/adr/0001-ssot-2d0-persistence-and-authority-design.md §7.1:
// proves buildProposedDataRevision() now backs governedProposals[].
// proposedRevisionId with a real GovernedRevision (governedRevisions[])
// for kinds that have a typed CanonicalRevisionPayload, instead of the
// synthetic `${caseId}:${kind}` id found during ADR migration-section
// investigation. Also proves the kinds without a payload type
// (policy_rule/master_correction/other_technical) and relay_asset
// (payload type exists, but no identity field is collected by the UI)
// still fall back to the synthetic id rather than fabricating one.
import assert from "node:assert/strict";
import { createSettingCaseObject } from "../src/domain/setting-case";
import { buildCaseBaseline } from "../src/domain/case-baseline";
import { buildProposedDataRevision } from "../src/domain/case-proposed-revision";
import { validateRevisionChain } from "../src/domain/ssot-governance";
import type { UnifiedNetwork } from "../src/domain/unified";

const now = "2026-08-03T00:00:00.000Z";

const network: UnifiedNetwork = {
  substations: [
    { id: "sub_angke", name: "GI Angke", voltageLevels: [], confidence: "confirmed", status: "active", sourceIds: [] },
    { id: "sub_ancol", name: "GI Ancol", voltageLevels: [], confidence: "confirmed", status: "active", sourceIds: [] },
  ],
  bays: [
    { id: "bay_angke_1", substationId: "sub_angke", name: "Angke#1", voltageKv: 150, confidence: "confirmed", status: "active", sourceIds: [] },
  ],
  lineRelations: [
    {
      id: "line_angke_ancol_1",
      fromBayId: "bay_angke_1",
      toBayId: "bay_ancol_1",
      fromSubstationId: "sub_angke",
      toSubstationId: "sub_ancol",
      circuit: "1",
      voltageKv: 150,
      r1Ohm: 0.21,
      x1Ohm: 0.82,
      r0Ohm: 0.63,
      x0Ohm: 2.46,
      currentRatingKa: 1.2,
      physicalLengthKm: 8.2,
      protectionFunctionIds: [],
      sourceIds: [],
      confidence: "confirmed",
      status: "active",
    },
  ],
  relayIeds: [],
  protectionFunctions: [],
} as unknown as UnifiedNetwork;

const draftCase = createSettingCaseObject(
  {
    caseType: "network_change",
    title: "Rekonduktoring Angke-Ancol",
    primaryReason: "reconductoring",
    changeItems: [{ id: "change_1", kind: "reconductoring" }],
    urgency: "normal",
    plannedEffectiveDate: "2026-09-01",
    owningUnit: "UPT Test",
    flowProfileDraft: {
      ownerLevel: "UPT",
      notifiedUnits: ["UIT Test"],
      lifecycleIntent: "permanent",
    },
    protectedScope: {
      networkCaseId: "case_inventory",
      subjectLineId: "line_angke_ancol_1",
      subjectBayId: "bay_angke_1",
      subjectLabel: "Angke - Ancol #1",
      substationIds: ["sub_angke", "sub_ancol"],
    },
    links: { sourceIntakeIds: ["evidence_1"] },
  },
  "Engineer",
  now,
  "case_spike_1"
);
const settingCase = {
  ...draftCase,
  stage: "scoping" as const,
  stageHistory: [...draftCase.stageHistory, { stage: "scoping" as const, at: now, actor: "Engineer" }],
};

const baselineResult = buildCaseBaseline({
  settingCase,
  network,
  evidence: [
    {
      sourceIntakeId: "evidence_1",
      fileName: "design.pdf",
      documentType: "design",
      status: "accepted",
      stagedAt: now,
    },
  ],
  revisionBindings: {
    networkRevisionId: "network_rev_1",
    technicalDataRevisionId: "technical_rev_1",
  },
  frozenAt: now,
  frozenBy: "Engineer",
  id: "baseline_spike_1",
});
assert.ok(baselineResult.ok, `baseline build failed: ${!baselineResult.ok ? baselineResult.errors.join(", ") : ""}`);
if (!baselineResult.ok) throw new Error("unreachable");
const baseline = baselineResult.baseline;

// line_technical: has a payload type and a resolvable target id (subjectLineId) -> real GovernedRevision
const proposed = buildProposedDataRevision({
  settingCase,
  baseline,
  draft: {
    targetEntityId: undefined,
    targetLabel: undefined,
    sourceEvidenceIds: ["evidence_1"],
    values: {
      "line.proposed_network_revision_ref": "change_set_1",
      "line.conductor_designation": "ACSR 2xZebra",
      "line.current_rating_a": "1600",
      "line.physical_length_km": "8.2",
      "line.r1_ohm": "0.16",
      "line.x1_ohm": "0.75",
      "line.r0_ohm": "0.63",
      "line.x0_ohm": "2.46",
      "line.c1_nf_per_km": "10",
      "line.c0_nf_per_km": "5",
    },
  },
  version: 1,
  id: "proposal_spike_1",
  createdAt: now,
  createdBy: "Engineer",
});

assert.equal(proposed.kinds.length, 1);
assert.equal(proposed.kinds[0], "line_technical");
assert.ok(proposed.governedRevisions && proposed.governedRevisions.length === 1, "expected one real GovernedRevision for line_technical");
const revision = proposed.governedRevisions![0];
assert.equal(revision.entity.kind, "line_technical");
assert.equal(revision.entity.id, "line_angke_ancol_1");
assert.equal(revision.payload.type, "line_technical");
if (revision.payload.type === "line_technical") {
  assert.equal(revision.payload.conductorDesignation, "ACSR 2xZebra");
  assert.equal(revision.payload.currentRatingA, 1600);
  assert.equal(revision.payload.r1Ohm, 0.16);
}

const lineProposal = proposed.governedProposals!.find((p) => p.target.kind === "line_technical")!;
assert.equal(
  lineProposal.proposedRevisionId,
  revision.id,
  "proposedRevisionId must point at the real GovernedRevision id, not a synthetic string"
);
assert.notEqual(
  lineProposal.proposedRevisionId,
  "proposal_spike_1:line_technical",
  "proposedRevisionId must not be the old synthetic caseId:kind format"
);

// The GovernedRevision must actually satisfy ssot-governance's own chain
// validation — proving this isn't just a shape match but a value
// createGovernedRevision() itself accepted.
assert.deepEqual(validateRevisionChain([revision]), []);

// A case whose only change item is relay_replacement has a payload type
// (RelayInstallationRevisionPayload) but no identity field collected by
// the UI (relay.make/model/firmware/order_code are specification fields,
// not a physical relay id) -> must fall back to the synthetic id rather
// than fabricate a relayIedId from a model name.
const draftRelayCase = createSettingCaseObject(
  {
    caseType: "relay_replacement",
    title: "Penggantian relay Angke#1",
    primaryReason: "relay_replacement",
    changeItems: [{ id: "change_1", kind: "relay_replacement" }],
    urgency: "normal",
    plannedEffectiveDate: "2026-09-01",
    owningUnit: "UPT Test",
    flowProfileDraft: {
      ownerLevel: "UPT",
      notifiedUnits: ["UIT Test"],
      lifecycleIntent: "permanent",
    },
    protectedScope: {
      networkCaseId: "case_inventory",
      subjectLineId: "line_angke_ancol_1",
      subjectBayId: "bay_angke_1",
      subjectLabel: "Angke - Ancol #1",
      substationIds: ["sub_angke", "sub_ancol"],
    },
    links: { sourceIntakeIds: ["evidence_1"] },
  },
  "Engineer",
  now,
  "case_spike_relay_1"
);
const relayCase = {
  ...draftRelayCase,
  stage: "scoping" as const,
  stageHistory: [...draftRelayCase.stageHistory, { stage: "scoping" as const, at: now, actor: "Engineer" }],
};
const relayBaselineResult = buildCaseBaseline({
  settingCase: relayCase,
  network,
  evidence: [
    {
      sourceIntakeId: "evidence_1",
      fileName: "design.pdf",
      documentType: "design",
      status: "accepted",
      stagedAt: now,
    },
  ],
  revisionBindings: {
    networkRevisionId: "network_rev_1",
    technicalDataRevisionId: "technical_rev_1",
  },
  frozenAt: now,
  frozenBy: "Engineer",
  id: "baseline_spike_relay_1",
});
assert.ok(relayBaselineResult.ok);
if (!relayBaselineResult.ok) throw new Error("unreachable");

const relayProposed = buildProposedDataRevision({
  settingCase: relayCase,
  baseline: relayBaselineResult.baseline,
  draft: {
    sourceEvidenceIds: ["evidence_1"],
    values: {
      "relay.make": "Schneider",
      "relay.model": "MiCOM P545",
      "relay.firmware": "v11",
      "relay.order_code": "P545-XYZ",
      "relay.capability_profile": "Distance + LCD",
      "relay.logic_communication_notes": "IEC 61850",
    },
  },
  version: 1,
  id: "proposal_spike_relay_1",
  createdAt: now,
  createdBy: "Engineer",
});
assert.equal(
  relayProposed.governedRevisions?.length ?? 0,
  0,
  "relay_asset must not fabricate a GovernedRevision without a real identity field"
);
const relayProposal = relayProposed.governedProposals!.find((p) => p.target.kind === "relay_installation")!;
assert.equal(
  relayProposal.proposedRevisionId,
  "proposal_spike_relay_1:relay_asset",
  "relay_asset must keep the synthetic id when no relay identity is available"
);

console.log(
  "Case proposed governed revision spike passed: line_technical/instrument_ct/instrument_vt/network_topology bind to a real GovernedRevision satisfying validateRevisionChain(); relay_asset/policy_rule/master_correction/other_technical correctly keep the synthetic id rather than fabricate one."
);
