import assert from "node:assert/strict";
import { buildCaseBaseline } from "../src/domain/case-baseline";
import { buildCaseImpactAssessment } from "../src/domain/case-impact-readiness";
import { buildCaseStudyBinding } from "../src/domain/case-study-binding";
import { buildCaseStudyPackageBinding } from "../src/domain/case-study-package";
import {
  assessCrosscheckEvidence,
  validateCaseFlowProfile,
} from "../src/domain/case-flow-hardening";
import {
  buildProposedDataRevision,
  proposedFieldDefinitionsForChangeItems,
} from "../src/domain/case-proposed-revision";
import {
  applicableStages,
  createSettingCaseObject,
  deriveSettingCaseType,
  isStageImplemented,
  nextStageOf,
  stageGate,
  type ChangeItemKind,
  type SettingCase,
} from "../src/domain/setting-case";
import type { UnifiedNetwork } from "../src/domain/unified";
import type {
  SourceSnapshot,
  StudyScenario,
} from "../src/domain/engineering-data";

assert.equal(deriveSettingCaseType("crosscheck", "other"), "crosscheck");
assert.equal(deriveSettingCaseType("setting_change", "relay_replacement"), "relay_replacement");
assert.equal(deriveSettingCaseType("setting_change", "new_gi_insertion"), "network_change");
assert.equal(deriveSettingCaseType("setting_change", "data_correction"), "data_correction");
assert.equal(deriveSettingCaseType("setting_change", "ct_replacement"), "new_setting");

const now = "2026-07-30T00:00:00.000Z";
const baseInput = {
  title: "Reconductoring DKSBI - DNMGT",
  primaryReason: "reconductoring" as ChangeItemKind,
  changeItems: [],
  urgency: "normal" as const,
  plannedEffectiveDate: "2026-09-01",
  owningUnit: "UPT Durikosambi",
  remoteUnit: "UPT Cawang",
  protectedScope: {
    networkCaseId: "case_inventory",
    subjectLineId: "line_dks_dnm",
    subjectBayId: "bay_dks_dnm",
    substationIds: ["sub_dks", "sub_dnm"],
  },
  flowProfileDraft: {
    ownerLevel: "UPT" as const,
    notifiedUnits: ["UIT JBB"],
    lifecycleIntent: "permanent" as const,
  },
};

const networkCase = createSettingCaseObject(
  { ...baseInput, caseType: "network_change" },
  "Engineer",
  now,
  "case_1"
);

assert.equal(networkCase.changeItems.length, 1);
assert.equal(networkCase.changeItems[0]?.kind, "reconductoring");
assert.ok(
  applicableStages(networkCase.caseType, networkCase.changeItems).includes(
    "data_change_preparation"
  )
);
assert.ok(
  applicableStages(
    "data_correction",
    [{ id: "correction", kind: "data_correction" }]
  ).includes("data_change_preparation")
);
assert.equal(nextStageOf(networkCase), "scoping");
assert.equal(networkCase.flowProfile.activation.mode, "commissioning");
assert.equal(networkCase.flowProfile.authority.acknowledgementRequired, true);
assert.deepEqual(validateCaseFlowProfile(networkCase.flowProfile), []);

assert.equal(isStageImplemented("draft"), true);
assert.equal(isStageImplemented("scoping"), true);
assert.equal(isStageImplemented("baseline_frozen"), true);
assert.equal(isStageImplemented("data_change_preparation"), true);
assert.equal(isStageImplemented("impact_and_readiness"), true);
assert.equal(isStageImplemented("study_preparation"), true);
assert.equal(isStageImplemented("approval"), false);

const gateContext = {
  evidenceCount: 1,
  hasScenario: false,
  calculationCount: 0,
  coordinationCheckCount: 0,
  changeSetCount: 0,
  persona: "Engineer",
  hasBaseline: false,
  proposedRevisionReady: false,
  impactAssessmentReady: false,
  studyBindingReady: false,
  studyPackageReady: false,
  crosscheckEvidenceBlockers: [],
  crosscheckEvidenceWarnings: [],
};
const scopedCase: SettingCase = { ...networkCase, stage: "scoping" };
assert.deepEqual(stageGate(scopedCase, gateContext).blockers, []);

const incompleteScope: SettingCase = {
  ...scopedCase,
  owningUnit: "",
  protectedScope: {
    networkCaseId: "case_inventory",
    substationIds: [],
  },
};
assert.equal(
  stageGate(incompleteScope, { ...gateContext, evidenceCount: 0 }).blockers.length,
  3
);

const network: UnifiedNetwork = {
  caseId: "case_inventory",
  substations: [
    {
      id: "sub_dks",
      name: "Durikosambi",
      shortCode: "DKSBI",
      voltageKv: 150,
      kind: "GI",
      normalizedName: "durikosambi",
    },
    {
      id: "sub_dnm",
      name: "Daan Mogot",
      shortCode: "DNMGT",
      voltageKv: 150,
      kind: "GI",
      normalizedName: "daan mogot",
    },
  ],
  busbars: [],
  bays: [
    {
      id: "bay_dks_dnm",
      substationId: "sub_dks",
      rawName: "Daan Mogot",
      normalizedName: "daan mogot",
      remoteEndpointHint: "DNMGT",
      circuit: "1",
      kind: "line",
    },
    {
      id: "bay_dnm_dks",
      substationId: "sub_dnm",
      rawName: "Durikosambi",
      normalizedName: "durikosambi",
      remoteEndpointHint: "DKSBI",
      circuit: "1",
      kind: "line",
    },
  ],
  terminals: [],
  lineRelations: [
    {
      id: "line_dks_dnm",
      fromBayId: "bay_dks_dnm",
      toBayId: "bay_dnm_dks",
      fromSubstationId: "sub_dks",
      toSubstationId: "sub_dnm",
      circuit: "1",
      voltageKv: 150,
      r1Ohm: 0.2,
      x1Ohm: 0.8,
      r0Ohm: 0.6,
      x0Ohm: 2.4,
      currentRatingKa: 1.2,
      physicalLengthKm: 10,
      protectionFunctionIds: ["DIST", "OCR"],
      sourceIds: ["source_1"],
      confidence: "high",
      status: "reviewed",
    },
  ],
  relayIeds: [
    {
      id: "ied_dks",
      bayId: "bay_dks_dnm",
      make: "Schneider",
      model: "P545",
      ctRatio: "2000/1",
      vtRatio: "150kV/100V",
      functionGroup: "LCD+DIST",
      confidence: "high",
    },
    {
      id: "ied_dnm",
      bayId: "bay_dnm_dks",
      make: "Siemens",
      model: "7SA",
      ctRatio: "2000/1",
      vtRatio: "150kV/100V",
      functionGroup: "DIST+OCR",
      confidence: "high",
    },
  ],
  protectionFunctions: [
    { id: "pf_dist", relayIedId: "ied_dks", function: "DIST" },
    { id: "pf_dist_remote", relayIedId: "ied_dnm", function: "DIST" },
  ],
};

const baselineResult = buildCaseBaseline({
  settingCase: scopedCase,
  network,
  evidence: [
    {
      sourceIntakeId: "source_1",
      fileName: "project-approved.pdf",
      documentType: "other",
      status: "extracted",
      stagedAt: now,
      checksum: { algorithm: "sha256", value: "abc123" },
    },
  ],
  revisionBindings: {
    networkRevisionId: "network_rev_1",
    technicalDataRevisionId: "technical_rev_1",
  },
  frozenAt: now,
  frozenBy: "Engineer",
  id: "baseline_1",
});
assert.equal(baselineResult.ok, true);
if (!baselineResult.ok) throw new Error(baselineResult.errors.join(", "));
assert.equal(baselineResult.baseline.network.lineRelations.length, 1);
assert.equal(baselineResult.baseline.network.relayIeds.length, 2);

const frozenCase: SettingCase = {
  ...scopedCase,
  stage: "baseline_frozen",
  baseline: baselineResult.baseline,
};
assert.deepEqual(
  stageGate(frozenCase, { ...gateContext, hasBaseline: true }).blockers,
  []
);

const proposalValues = {
  "line.proposed_network_revision_ref": "network_rev_proposed_2",
  "line.conductor_designation": "ACSR 2xZebra",
  "line.current_rating_a": "1600",
  "line.physical_length_km": "10",
  "line.r1_ohm": "0.16",
  "line.x1_ohm": "0.75",
  "line.r0_ohm": "0.48",
  "line.x0_ohm": "2.1",
  "line.c1_nf_per_km": "12",
  "line.c0_nf_per_km": "8",
};
const proposal = buildProposedDataRevision({
  settingCase: frozenCase,
  baseline: baselineResult.baseline,
  draft: {
    targetEntityId: "line_dks_dnm",
    targetLabel: "DKSBI - DNMGT",
    sourceEvidenceIds: ["source_1"],
    values: proposalValues,
  },
  version: 1,
  id: "proposal_1",
  createdAt: now,
  createdBy: "Engineer",
});
assert.equal(proposal.status, "ready_for_impact");
assert.equal(proposal.validation.valid, true);
assert.equal(
  proposal.fieldChanges.find((item) => item.fieldKey === "line.current_rating_a")
    ?.beforeValue,
  1200
);

const draftProposal = buildProposedDataRevision({
  settingCase: frozenCase,
  baseline: baselineResult.baseline,
  draft: { sourceEvidenceIds: [], values: {} },
  version: 2,
  id: "proposal_2",
  createdAt: now,
  createdBy: "Engineer",
});
assert.equal(draftProposal.status, "draft");
assert.ok(draftProposal.validation.errors.length > 1);

const multiItemFields = proposedFieldDefinitionsForChangeItems(
  [
    { id: "line", kind: "new_gi_insertion" },
    { id: "ct", kind: "ct_replacement" },
    { id: "vt", kind: "vt_replacement" },
    { id: "relay", kind: "relay_replacement" },
  ],
  "new_gi_insertion"
);
assert.ok(multiItemFields.some((item) => item.key === "topology.change_description"));
assert.ok(multiItemFields.some((item) => item.key === "ct.primary_a"));
assert.ok(multiItemFields.some((item) => item.key === "vt.primary_kv"));
assert.ok(multiItemFields.some((item) => item.key === "relay.model"));

const impactCase: SettingCase = {
  ...frozenCase,
  stage: "impact_and_readiness",
};
const impact = buildCaseImpactAssessment({
  settingCase: impactCase,
  baseline: baselineResult.baseline,
  proposedRevision: proposal,
  assessmentInput: {
    confirmed: true,
    confirmationNote: "Endpoint lokal dan remote dikonfirmasi.",
    selectedStudyDisposition: "new_study_required",
  },
  version: 1,
  id: "impact_1",
  evaluatedAt: now,
  evaluatedBy: "Engineer",
});
assert.equal(impact.status, "ready_for_study");
assert.equal(impact.endpoints.length, 2);
assert.equal(impact.study.suggestedDisposition, "new_study_required");
assert.ok(impact.protectionFunctions.some((item) => item.function === "GFR"));
assert.equal(
  impact.issues.filter((item) => item.severity === "blocker").length,
  0
);
assert.deepEqual(
  stageGate(impactCase, { ...gateContext, impactAssessmentReady: true }).blockers,
  []
);

const unsafeReuse = buildCaseImpactAssessment({
  settingCase: impactCase,
  baseline: baselineResult.baseline,
  proposedRevision: proposal,
  assessmentInput: {
    confirmed: true,
    selectedStudyDisposition: "approved_scenario_reuse_candidate",
  },
  version: 2,
  id: "impact_2",
  evaluatedAt: now,
  evaluatedBy: "Engineer",
});
assert.equal(unsafeReuse.status, "blocked");
assert.ok(
  unsafeReuse.issues.some((item) => item.id === "study-hard-rule-conflict")
);

const unconfirmedImpact = buildCaseImpactAssessment({
  settingCase: impactCase,
  baseline: baselineResult.baseline,
  proposedRevision: proposal,
  assessmentInput: { confirmed: false },
  version: 3,
  id: "impact_3",
  evaluatedAt: now,
  evaluatedBy: "Engineer",
});
assert.equal(unconfirmedImpact.status, "draft_confirmation");

const ctImpact = buildCaseImpactAssessment({
  settingCase: {
    ...impactCase,
    caseType: "new_setting",
    primaryReason: "ct_replacement",
    changeItems: [{ id: "ct", kind: "ct_replacement" }],
  },
  baseline: baselineResult.baseline,
  assessmentInput: { confirmed: false },
  version: 1,
  id: "impact_ct",
  evaluatedAt: now,
  evaluatedBy: "Engineer",
});
assert.equal(
  ctImpact.study.suggestedDisposition,
  "approved_scenario_reuse_candidate"
);

const remoteImpact = buildCaseImpactAssessment({
  settingCase: {
    ...impactCase,
    primaryReason: "remote_side_work",
    changeItems: [{ id: "remote", kind: "remote_side_work" }],
  },
  baseline: baselineResult.baseline,
  assessmentInput: { confirmed: false },
  version: 1,
  id: "impact_remote",
  evaluatedAt: now,
  evaluatedBy: "Engineer",
});
assert.equal(
  remoteImpact.study.suggestedDisposition,
  "engineering_decision_required"
);

const futureCase: SettingCase = {
  ...impactCase,
  stage: "study_preparation",
  proposedDataRevisions: [proposal],
  impactAssessments: [impact],
};
assert.deepEqual(stageGate(futureCase, gateContext).blockers, [
  "Belum ada Study Scenario Package yang lengkap dan compatible dengan revision case.",
]);

const studySnapshots: SourceSnapshot[] = [
  {
    id: "snapshot_network_proposed",
    label: "Proposed network revision 2",
    kind: "network-model",
    state: "current-candidate",
    sourceSystem: "DIgSILENT",
    sourceRef: "project-study.pfd",
    capturedAt: now,
    checksum: { algorithm: "sha256", value: "networkhash", scope: "dataset" },
    networkRevisionId: "network_rev_proposed_2",
    notes: [],
  },
  {
    id: "snapshot_fault_proposed",
    label: "Fault study proposed revision 2",
    kind: "fault-study",
    state: "current-candidate",
    sourceSystem: "DIgSILENT",
    sourceRef: "short-circuit-export.csv",
    capturedAt: now,
    checksum: { algorithm: "sha256", value: "faulthash", scope: "dataset" },
    networkRevisionId: "network_rev_proposed_2",
    notes: [],
  },
];
const approvedStudy: StudyScenario = {
  id: "scenario_proposed_max",
  name: "Proposed revision 2 maximum fault",
  description: "Approved project study",
  networkSnapshotId: "snapshot_network_proposed",
  faultSnapshotId: "snapshot_fault_proposed",
  networkRevisionId: "network_rev_proposed_2",
  studyMethod: "digsilent-short-circuit",
  condition: "maximum",
  generationState: "approved maximum dispatch",
  sourceState: "approved switching state",
  calculatedAt: now,
  createdAt: now,
  status: "approved",
  sourceEvidenceIds: ["snapshot_network_proposed", "snapshot_fault_proposed"],
};
const approvedMinimumStudy: StudyScenario = {
  ...approvedStudy,
  id: "scenario_proposed_min",
  name: "Proposed revision 2 minimum fault",
  condition: "minimum",
  generationState: "approved minimum dispatch",
};
const compatibleBinding = buildCaseStudyBinding({
  settingCase: futureCase,
  impactAssessment: impact,
  proposedRevision: proposal,
  scenarioId: approvedStudy.id,
  scenarios: [approvedStudy],
  snapshots: studySnapshots,
  version: 1,
  id: "binding_1",
  boundAt: now,
  boundBy: "Engineer",
});
assert.equal(compatibleBinding.status, "compatible");
assert.equal(compatibleBinding.expectedNetworkRevisionId, "network_rev_proposed_2");
assert.equal(compatibleBinding.issues.length, 0);

const incompletePackage = buildCaseStudyPackageBinding({
  settingCase: futureCase,
  impactAssessment: impact,
  proposedRevision: proposal,
  scenarioIds: [approvedStudy.id],
  scenarios: [approvedStudy, approvedMinimumStudy],
  snapshots: studySnapshots,
  version: 1,
  id: "package_1",
  boundAt: now,
  boundBy: "Engineer",
});
assert.equal(incompletePackage.status, "blocked");
assert.deepEqual(incompletePackage.missingRequiredConditions, ["minimum"]);

const compatiblePackage = buildCaseStudyPackageBinding({
  settingCase: futureCase,
  impactAssessment: impact,
  proposedRevision: proposal,
  scenarioIds: [approvedStudy.id, approvedMinimumStudy.id],
  scenarios: [approvedStudy, approvedMinimumStudy],
  snapshots: studySnapshots,
  version: 2,
  id: "package_2",
  boundAt: now,
  boundBy: "Engineer",
});
assert.equal(compatiblePackage.status, "compatible");
assert.deepEqual(compatiblePackage.missingRequiredConditions, []);
assert.deepEqual(
  compatiblePackage.requirementProfile.requiredConditions,
  ["maximum", "minimum"]
);
assert.equal(compatiblePackage.requirementProfile.excludesWorkOutageCondition, true);

const historicalStudy: StudyScenario = {
  ...approvedStudy,
  id: "scenario_historical",
  status: "historical",
  condition: "unknown",
  calculatedAt: undefined,
};
const blockedBinding = buildCaseStudyBinding({
  settingCase: futureCase,
  impactAssessment: impact,
  proposedRevision: proposal,
  scenarioId: historicalStudy.id,
  scenarios: [historicalStudy],
  snapshots: studySnapshots.map((item) => ({ ...item, state: "historical" })),
  version: 2,
  id: "binding_2",
  boundAt: now,
  boundBy: "Engineer",
});
assert.equal(blockedBinding.status, "blocked");
assert.ok(blockedBinding.issues.some((item) => item.code === "scenario-not-approved"));
assert.ok(blockedBinding.issues.some((item) => item.code === "condition-unknown"));
assert.ok(blockedBinding.issues.some((item) => item.code === "snapshot-state-ineligible"));

const reuseImpact = {
  ...impact,
  id: "impact_reuse",
  study: {
    ...impact.study,
    suggestedDisposition: "approved_scenario_reuse_candidate" as const,
    selectedDisposition: "approved_scenario_reuse_candidate" as const,
  },
};
const reuseSnapshots: SourceSnapshot[] = studySnapshots.map((item, index) => ({
  ...item,
  id: index === 0 ? "snapshot_network_baseline" : "snapshot_fault_baseline",
  state: "current",
  networkRevisionId: "network_rev_1",
}));
const approvedReuseStudy: StudyScenario = {
  ...approvedStudy,
  id: "scenario_baseline_max",
  networkSnapshotId: "snapshot_network_baseline",
  faultSnapshotId: "snapshot_fault_baseline",
  networkRevisionId: "network_rev_1",
  sourceEvidenceIds: ["snapshot_network_baseline", "snapshot_fault_baseline"],
};
const compatibleReuseBinding = buildCaseStudyBinding({
  settingCase: futureCase,
  impactAssessment: reuseImpact,
  proposedRevision: proposal,
  scenarioId: approvedReuseStudy.id,
  scenarios: [approvedReuseStudy],
  snapshots: reuseSnapshots,
  version: 3,
  id: "binding_3",
  boundAt: now,
  boundBy: "Engineer",
});
assert.equal(compatibleReuseBinding.status, "compatible");
assert.equal(compatibleReuseBinding.expectedNetworkRevisionId, "network_rev_1");

assert.deepEqual(
  stageGate(
    { ...futureCase, studyPackageBindings: [compatiblePackage] },
    { ...gateContext, studyPackageReady: true }
  ).blockers,
  []
);

// Sprint 5 opens the `calculation` stage: it is no longer an unimplemented
// boundary, but it still gates on at least one linked Calculation Run.
const calculationBoundaryCase: SettingCase = {
  ...futureCase,
  stage: "calculation",
  studyPackageBindings: [compatiblePackage],
};
assert.equal(isStageImplemented("calculation"), true);
assert.deepEqual(stageGate(calculationBoundaryCase, gateContext).blockers, [
  "Belum ada Calculation Run yang tersimpan dan ter-link ke case ini.",
]);
assert.deepEqual(
  stageGate(calculationBoundaryCase, { ...gateContext, calculationCount: 1 })
    .blockers,
  []
);

// Sprint 5 (cont'd) opens `coordination`: gates on at least one linked
// CoordinationCheck (coverage/selectivity/gap), same shape as calculation's
// gate one stage earlier.
const coordinationBoundaryCase: SettingCase = {
  ...futureCase,
  stage: "coordination",
  studyPackageBindings: [compatiblePackage],
};
assert.equal(isStageImplemented("coordination"), true);
assert.deepEqual(
  stageGate(coordinationBoundaryCase, { ...gateContext, calculationCount: 1 })
    .blockers,
  ["Belum ada Coordination Check (coverage/selectivity/gap) yang tersimpan dan ter-link ke case ini."]
);
assert.deepEqual(
  stageGate(coordinationBoundaryCase, {
    ...gateContext,
    calculationCount: 1,
    coordinationCheckCount: 1,
  }).blockers,
  []
);

const dynamicCorrectionImpact = {
  ...impact,
  id: "impact_correction_study",
  study: {
    ...impact.study,
    suggestedDisposition: "engineering_decision_required" as const,
    selectedDisposition: "approved_scenario_reuse_candidate" as const,
  },
};
assert.ok(
  applicableStages(
    "data_correction",
    [{ id: "correction", kind: "data_correction" }],
    [dynamicCorrectionImpact]
  ).includes("study_preparation")
);
assert.equal(
  applicableStages(
    "data_correction",
    [{ id: "correction", kind: "data_correction" }],
    [{ ...dynamicCorrectionImpact, status: "ready_without_study" }]
  ).includes("study_preparation"),
  false
);
assert.ok(
  applicableStages(
    "data_correction",
    [{ id: "correction", kind: "data_correction" }],
    [{ ...dynamicCorrectionImpact, status: "ready_without_study" }]
  ).includes("activation")
);
assert.ok(
  applicableStages(
    "relay_replacement",
    [{ id: "relay", kind: "relay_replacement" }]
  ).includes("study_preparation")
);

const crosscheckCase = createSettingCaseObject(
  {
    ...baseInput,
    caseType: "crosscheck",
    primaryReason: "other",
    changeItems: [{ id: "should_be_removed", kind: "relay_replacement" }],
  },
  "Engineer",
  now,
  "case_2"
);
assert.deepEqual(crosscheckCase.changeItems, []);
assert.equal(
  crosscheckCase.flowProfile.crosscheckMode,
  "actual_relay_readback_verification"
);
assert.deepEqual(
  applicableStages(
    "crosscheck",
    [],
    [],
    crosscheckCase.flowProfile
  ),
  [
    "draft",
    "scoping",
    "baseline_frozen",
    "actual_readback_intake",
    "verification",
    "closed",
  ]
);
assert.equal(
  assessCrosscheckEvidence(crosscheckCase, [
    { documentType: "relay_export", fileName: "readback.set" },
  ]).ready,
  true
);
assert.equal(
  assessCrosscheckEvidence(crosscheckCase, [
    { documentType: "tap_setting", fileName: "issued-tap.pdf" },
  ]).ready,
  false
);

const tapAuditCase = createSettingCaseObject(
  {
    ...baseInput,
    caseType: "crosscheck",
    primaryReason: "other",
    changeItems: [],
    flowProfileDraft: {
      ...baseInput.flowProfileDraft,
      crosscheckMode: "issued_tap_document_audit",
    },
  },
  "Engineer",
  now,
  "case_tap_audit"
);
assert.deepEqual(
  applicableStages("crosscheck", [], [], tapAuditCase.flowProfile),
  [
    "draft",
    "scoping",
    "baseline_frozen",
    "document_audit",
    "verification",
    "closed",
  ]
);
assert.equal(
  assessCrosscheckEvidence(tapAuditCase, [
    { documentType: "tap_setting", fileName: "issued-tap.pdf" },
  ]).ready,
  true
);

const emergencyCase = createSettingCaseObject(
  {
    ...baseInput,
    caseType: "network_change",
    urgency: "emergency",
    primaryReason: "topology_change",
    changeItems: [{ id: "temporary_jumper", kind: "topology_change" }],
    flowProfileDraft: {
      ownerLevel: "UIT",
      notifiedUnits: ["UPT Durikosambi"],
      lifecycleIntent: "temporary_emergency",
      temporaryExpiresAt: "2026-08-07T00:00:00.000Z",
      emergencyReason: "Temporary jumper after GIS failure",
    },
  },
  "Engineer",
  now,
  "case_emergency"
);
assert.deepEqual(validateCaseFlowProfile(emergencyCase.flowProfile), []);
assert.equal(emergencyCase.flowProfile.temporaryPolicy?.restorationRequired, true);
assert.ok(
  applicableStages(
    emergencyCase.caseType,
    emergencyCase.changeItems,
    emergencyCase.impactAssessments,
    emergencyCase.flowProfile
  ).includes("restoration")
);

const administrativeCorrection = createSettingCaseObject(
  {
    ...baseInput,
    caseType: "data_correction",
    primaryReason: "data_correction",
    changeItems: [{ id: "alias", kind: "data_correction" }],
  },
  "Engineer",
  now,
  "case_admin_correction"
);
assert.equal(
  administrativeCorrection.flowProfile.activation.mode,
  "approved_effective_date"
);
assert.equal(
  administrativeCorrection.flowProfile.activation.requiresCommissioningEvidence,
  false
);

assert.deepEqual(applicableStages("crosscheck", []), [
  "draft",
  "scoping",
  "baseline_frozen",
  "actual_readback_intake",
  "verification",
  "closed",
]);

console.log(
  "Setting Case regression passed: flow authority, P1 evidence modes, permanent/emergency routing, activation policy, immutable baseline/proposals/impact, and multi-condition Study Scenario Packages."
);
