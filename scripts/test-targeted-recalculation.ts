import assert from "node:assert/strict";
import {
  buildTargetedRecalculationPlan,
  type LineProtectionBlockId,
} from "../src/domain/targeted-recalculation";
import type {
  ChangeItemKind,
  SettingCase,
  SettingCaseType,
} from "../src/domain/setting-case";

function makeCase(options: {
  caseType?: SettingCaseType;
  reason?: ChangeItemKind;
  withIssuedBaseline?: boolean;
  ready?: boolean;
} = {}): SettingCase {
  const reason = options.reason ?? "reconductoring";
  const ready = options.ready ?? false;
  const withIssuedBaseline = options.withIssuedBaseline ?? false;

  return {
    id: `case_${reason}`,
    caseType: options.caseType ?? "network_change",
    title: `Case ${reason}`,
    primaryReason: reason,
    changeItems: [{ id: `change_${reason}`, kind: reason }],
    urgency: "normal",
    flowProfile: {},
    owningUnit: "UPT Test",
    protectedScope: {
      networkCaseId: "network_test",
      subjectLineId: "line_test",
      substationIds: ["sub_local", "sub_remote"],
    },
    baseline: {
      id: "baseline_issued",
      revisionBindings: {
        issuedSettingRevisionId: withIssuedBaseline ? "setting_rev_issued" : undefined,
      },
      evidence: [],
    },
    proposedDataRevisions: ready
      ? [{ id: "proposal_1", status: "ready_for_impact" }]
      : [],
    impactAssessments: ready
      ? [{ id: "impact_1", status: "ready_for_study" }]
      : [],
    studyBindings: [],
    studyPackageBindings: ready
      ? [{ id: "package_1", status: "compatible" }]
      : [],
    links: {
      sourceIntakeIds: [],
      calculationSnapshotIds: [],
      engineeringChangeSetIds: [],
      coordinationCheckIds: [],
    },
    stage: "calculation",
    stageHistory: [],
    createdAt: "2026-08-02T00:00:00.000Z",
    updatedAt: "2026-08-02T00:00:00.000Z",
    createdBy: "test",
  } as unknown as SettingCase;
}

function actionFor(plan: ReturnType<typeof buildTargetedRecalculationPlan>, id: LineProtectionBlockId) {
  return plan.blocks.find((block) => block.id === id)?.action;
}

const noCase = buildTargetedRecalculationPlan(undefined);
assert.equal(noCase.mode, "benchmark-only");
assert.equal(noCase.processReadiness, "blocked");
assert.equal(noCase.canCreateLiveRun, false);

const crosscheck = buildTargetedRecalculationPlan(
  makeCase({ caseType: "crosscheck", reason: "other" })
);
assert.equal(crosscheck.mode, "ineligible-case");
assert.match(crosscheck.blockers[0] ?? "", /Crosscheck Case/);

const greenfieldInsertion = buildTargetedRecalculationPlan(
  makeCase({ reason: "new_gi_insertion", withIssuedBaseline: false })
);
assert.equal(greenfieldInsertion.mode, "full-design-deferred");
assert.equal(greenfieldInsertion.processReadiness, "deferred");

const reconductoring = buildTargetedRecalculationPlan(
  makeCase({ reason: "reconductoring", withIssuedBaseline: true, ready: true })
);
assert.equal(reconductoring.mode, "targeted-recalculation");
assert.equal(reconductoring.processReadiness, "ready-for-rule-binding");
assert.equal(reconductoring.blockers.length, 0);
assert.equal(reconductoring.canCreateLiveRun, true);
assert.equal(reconductoring.runtimeStatus, "live-case-adapter");
assert.equal(actionFor(reconductoring, "distance-core"), "recalculate");
assert.equal(actionFor(reconductoring, "residual-compensation"), "recalculate");
assert.equal(actionFor(reconductoring, "line-differential"), "recalculate");
assert.equal(actionFor(reconductoring, "autoreclose-policy"), "engineering-review");
assert.equal(actionFor(reconductoring, "remote-coordination"), "engineering-review");

const ctReplacement = buildTargetedRecalculationPlan(
  makeCase({
    caseType: "new_setting",
    reason: "ct_replacement",
    withIssuedBaseline: true,
    ready: true,
  })
);
assert.equal(actionFor(ctReplacement, "distance-core"), "recalculate");
assert.equal(actionFor(ctReplacement, "line-differential"), "recalculate");
assert.equal(actionFor(ctReplacement, "residual-compensation"), "carry-forward");

const missingIssuedSetting = buildTargetedRecalculationPlan(
  makeCase({ reason: "reconductoring", withIssuedBaseline: false, ready: true })
);
assert.equal(missingIssuedSetting.processReadiness, "blocked");
assert.ok(
  missingIssuedSetting.blockers.some((blocker) => blocker.includes("Issued setting"))
);

console.log("Targeted recalculation planning tests passed.");
