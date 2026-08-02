import assert from "node:assert/strict";
import { createSettingCaseObject } from "../src/domain/setting-case";
import { useProsetStore } from "../src/store/useProsetStore";

const now = "2026-08-02T00:00:00.000Z";
const draft = createSettingCaseObject(
  {
    caseType: "crosscheck",
    title: "Baseline freeze regression",
    primaryReason: "other",
    changeItems: [],
    urgency: "normal",
    owningUnit: "UPT Test",
    protectedScope: {
      networkCaseId: "case_dks_dm_pik_mkb",
      subjectLineId: "anchor_line_359",
      subjectBayId: "bay_sub_gi_durikosambi_anchor_line_359_from",
      substationIds: ["sub_gi_durikosambi", "sub_gis_daan_mogot"],
    },
    flowProfileDraft: {
      ownerLevel: "UPT",
      notifiedUnits: ["UIT Test"],
      lifecycleIntent: "permanent",
      crosscheckMode: "issued_tap_document_audit",
    },
  },
  "Engineer",
  now,
  "case_baseline_flow_regression"
);

const scoped = {
  ...draft,
  stage: "scoping" as const,
  stageHistory: [
    ...draft.stageHistory,
    { stage: "scoping" as const, at: now, actor: "Engineer" },
  ],
};

// Asset 360 can launch the governed case wizard without losing stable scope.
useProsetStore.getState().openCaseWizard("new_setting", {
  title: "Reconductoring DKSBI - DNMGT",
  primaryReason: "reconductoring",
  subjectLineId: "anchor_line_359",
  subjectBayId: "bay_sub_gi_durikosambi_anchor_line_359_from",
  subjectLabel: "DKSBI - DNMGT #1",
  substationIds: ["sub_gi_durikosambi", "sub_gis_daan_mogot"],
});
assert.equal(useProsetStore.getState().currentTab, "cases");
assert.equal(
  useProsetStore.getState().caseWizardRequest?.preset?.subjectLineId,
  "anchor_line_359"
);
assert.equal(
  useProsetStore.getState().caseWizardRequest?.preset?.primaryReason,
  "reconductoring"
);
useProsetStore.getState().clearCaseWizardRequest();

// A new case must be able to freeze its current network/technical snapshot
// before the TAP/readback document is acquired in the next operational stage.
useProsetStore.setState({
  settingCases: [scoped],
  sourceIntakeRecords: [],
  currentPersona: "Engineer",
});

const freeze = useProsetStore
  .getState()
  .freezeSettingCaseBaseline(scoped.id);
assert.equal(freeze.ok, true);
if (!freeze.ok) throw new Error(freeze.errors.join(", "));

const frozen = useProsetStore.getState().settingCases[0];
assert.equal(frozen.stage, "baseline_frozen");
assert.ok(frozen.baseline);
assert.ok(frozen.baseline.revisionBindings.networkRevisionId);
assert.ok(frozen.baseline.revisionBindings.technicalDataRevisionId);

// Evidence for the planned change may be appended after freeze. It is linked
// to the case but must never be back-filled into the immutable baseline.
const changeSourceId = useProsetStore.getState().addSourceIntakeRecord({
  caseId: scoped.id,
  fileName: "relay-replacement-approved-note.pdf",
  documentType: "other",
  note: "Evidence perubahan rele setelah baseline dibekukan",
});
useProsetStore
  .getState()
  .linkToSettingCase(scoped.id, { kind: "source", refId: changeSourceId });
const withChangeEvidence = useProsetStore.getState().settingCases[0];
assert.ok(withChangeEvidence.links.sourceIntakeIds.includes(changeSourceId));
assert.equal(
  withChangeEvidence.baseline?.evidence.some(
    (item) => item.sourceIntakeId === changeSourceId
  ),
  false
);

useProsetStore
  .getState()
  .unlinkFromSettingCase(scoped.id, { kind: "source", refId: changeSourceId });
assert.equal(
  useProsetStore.getState().settingCases[0]?.links.sourceIntakeIds.includes(changeSourceId),
  false
);

useProsetStore.getState().advanceSettingCaseStage(scoped.id);
assert.equal(useProsetStore.getState().settingCases[0]?.stage, "document_audit");

useProsetStore.setState({ openedFromCaseId: scoped.id });
useProsetStore.getState().stageVendorImportForVerification({
  caseId: scoped.id,
  sourceFileName: "issued-tap.pdf",
  adapterId: "tap-pdf-profile-v1",
  sourceFormat: "PDF",
  vendor: "MiCOM",
  normalizedText: "Z1 = 1.2 ohm",
  evidenceAuthority: "derived_candidate",
});
useProsetStore.getState().advanceSettingCaseStage(scoped.id);
assert.equal(useProsetStore.getState().settingCases[0]?.stage, "verification");

console.log(
  "Case baseline flow regression passed: scoping -> immutable baseline -> document audit -> verification without pre-freeze TAP."
);
