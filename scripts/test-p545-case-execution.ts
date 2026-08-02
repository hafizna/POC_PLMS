import assert from "node:assert/strict";
import {
  buildP545CaseExecutionContract,
  executeP545CaseCalculation,
  type P545CaseInputOverride,
} from "../src/domain/p545-case-execution";
import type { ChangeItemKind, SettingCase } from "../src/domain/setting-case";
import type { LineRelation } from "../src/domain/unified";
import { useProsetStore } from "../src/store/useProsetStore";

const at = "2026-08-02T10:00:00.000Z";

function line(
  id: string,
  fromSubstationId: string,
  toSubstationId: string,
  fromBayId: string,
  toBayId: string,
  values: { length: number; r1: number; x1: number; r0?: number; x0?: number }
): LineRelation {
  return {
    id,
    fromSubstationId,
    toSubstationId,
    fromBayId,
    toBayId,
    circuit: "1",
    voltageKv: 150,
    physicalLengthKm: values.length,
    r1Ohm: values.r1,
    x1Ohm: values.x1,
    r0Ohm: values.r0,
    x0Ohm: values.x0,
    currentRatingKa: 1.428,
    protectionFunctionIds: [],
    sourceIds: ["fixture"],
    confidence: "high",
    status: "reviewed",
  };
}

function makeCase(reason: ChangeItemKind): SettingCase {
  const protectedLine = line(
    "line_ab",
    "sub_a",
    "sub_b",
    "bay_a_b",
    "bay_b_a",
    { length: 10, r1: 0.35, x1: 3.2, r0: 1.1, x0: 9.6 }
  );
  const forward = line(
    "line_bc",
    "sub_b",
    "sub_c",
    "bay_b_c",
    "bay_c_b",
    { length: 12, r1: 0.42, x1: 3.8 }
  );
  const reverse = line(
    "line_ad",
    "sub_a",
    "sub_d",
    "bay_a_d",
    "bay_d_a",
    { length: 8, r1: 0.28, x1: 2.5 }
  );
  const secondForward = line(
    "line_ce",
    "sub_c",
    "sub_e",
    "bay_c_e",
    "bay_e_c",
    { length: 15, r1: 0.5, x1: 4.5 }
  );
  const changes = [
    ["line.physical_length_km", 10],
    ["line.current_rating_a", 1428],
    ["line.r1_ohm", 0.35],
    ["line.x1_ohm", 3.2],
    ["line.r0_ohm", 1.1],
    ["line.x0_ohm", 9.6],
    ["line.c1_nf_per_km", 420.17],
  ] as const;

  return {
    id: `case_${reason}`,
    caseType: "network_change",
    title: `P545 ${reason}`,
    primaryReason: reason,
    changeItems: [{ id: `change_${reason}`, kind: reason }],
    urgency: "normal",
    flowProfile: {},
    owningUnit: "UPT Test",
    protectedScope: {
      networkCaseId: "network_fixture",
      subjectLineId: protectedLine.id,
      subjectBayId: protectedLine.fromBayId,
      substationIds: ["sub_a", "sub_b"],
    },
    baseline: {
      id: "baseline_fixture",
      settingCaseId: `case_${reason}`,
      frozenAt: at,
      frozenBy: "Engineer",
      caseType: "network_change",
      primaryReason: reason,
      changeItems: [{ id: `change_${reason}`, kind: reason }],
      owningUnit: "UPT Test",
      protectedScope: {
        networkCaseId: "network_fixture",
        subjectLineId: protectedLine.id,
        subjectBayId: protectedLine.fromBayId,
        substationIds: ["sub_a", "sub_b"],
      },
      evidence: [],
      revisionBindings: {
        networkRevisionId: "network_rev_1",
        technicalDataRevisionId: "technical_rev_1",
        issuedSettingRevisionId: "issued_rev_1",
      },
      issues: [],
      network: {
        networkCaseId: "network_fixture",
        substations: [],
        bays: [],
        lineRelations: [protectedLine, forward, reverse, secondForward],
        relayIeds: [
          {
            id: "relay_local",
            bayId: protectedLine.fromBayId,
            make: "Schneider",
            model: "P545",
            ctRatio: "3000/1",
            vtRatio: "150kV/100V",
            ct: { kind: "CT", primaryA: 3000, secondaryA: 1, ratioText: "3000/1" },
            vt: { kind: "VT", primaryKv: 150, secondaryV: 100, ratioText: "150kV/100V" },
            functionGroup: "LCD+DIST",
            confidence: "high",
          },
          {
            id: "relay_remote",
            bayId: protectedLine.toBayId,
            make: "Schneider",
            model: "P545",
            ctRatio: "2000/1",
            vtRatio: "150kV/100V",
            ct: { kind: "CT", primaryA: 2000, secondaryA: 1, ratioText: "2000/1" },
            vt: { kind: "VT", primaryKv: 150, secondaryV: 100, ratioText: "150kV/100V" },
            functionGroup: "LCD+DIST",
            confidence: "high",
          },
        ],
        protectionFunctions: [],
        transformers: [
          {
            id: "trafo_remote",
            substationId: "sub_b",
            bayId: "bay_trafo_b",
            label: "Remote transformer",
            hvVoltageKv: 150,
            lvVoltageKv: 20,
            xOhm: 18,
          },
        ],
      },
      fingerprint: { algorithm: "fnv1a32", value: "baseline-fingerprint" },
    },
    proposedDataRevisions: [
      {
        id: "proposal_fixture",
        settingCaseId: `case_${reason}`,
        baselineId: "baseline_fixture",
        version: 1,
        kind: "line_technical",
        kinds: ["line_technical"],
        primaryReason: reason,
        sourceEvidenceIds: ["engineering_fixture"],
        fieldChanges: changes.map(([fieldKey, proposedValue]) => ({
          fieldKey,
          label: fieldKey,
          valueType: "number" as const,
          proposedValue,
        })),
        status: "ready_for_impact",
        validation: { valid: true, errors: [] },
        createdAt: at,
        createdBy: "Engineer",
        fingerprint: { algorithm: "fnv1a32", value: "proposal-fingerprint" },
      },
    ],
    impactAssessments: [
      {
        id: "impact_fixture",
        status: "ready_without_study",
      },
    ],
    studyBindings: [],
    studyPackageBindings: [],
    links: {
      sourceIntakeIds: [],
      calculationSnapshotIds: [],
      engineeringChangeSetIds: [],
      coordinationCheckIds: [],
      verificationRunIds: [],
    },
    stage: "calculation",
    stageHistory: [],
    createdAt: at,
    updatedAt: at,
    createdBy: "Engineer",
  } as unknown as SettingCase;
}

const overrides: P545CaseInputOverride[] = [
  ["fault_3ph_ka", 26.24],
  ["arc_spacing", 4.3],
  ["normal_diff_current_a", 42],
].map(([key, value]) => ({
  key: String(key),
  value: Number(value),
  reason: "Engineering fixture value",
  evidenceRef: `evidence:${String(key)}`,
  actor: "Engineer",
  at,
}));

const reconductoring = makeCase("reconductoring");
const blocked = buildP545CaseExecutionContract({ settingCase: reconductoring });
assert.equal(blocked.status, "blocked");
assert.ok(blocked.blockers.some((item) => item.includes("3-phase fault")));

const ready = buildP545CaseExecutionContract({
  settingCase: reconductoring,
  overrides,
});
assert.equal(ready.status, "ready");
assert.equal(ready.summary.overridden, 3);

const executed = executeP545CaseCalculation({
  settingCase: reconductoring,
  overrides,
  runId: "run_fixture",
  executedAt: at,
  executedBy: "Engineer",
});
assert.equal(executed.ok, true);
if (!executed.ok) throw new Error(executed.errors.join(", "));
assert.deepEqual(executed.run.executedBlocks, [
  "distance-core",
  "residual-compensation",
  "resistive-reach",
  "load-blinder-psb",
  "line-differential",
]);
assert.ok(executed.run.outputs.length > 0);
assert.ok(
  executed.run.outputs.every(
    (item) => typeof item.value === "string" || Number.isFinite(item.value)
  )
);
assert.ok(!executed.run.executedBlocks.includes("autoreclose-policy"));
assert.equal(executed.run.baselineFingerprint, "baseline-fingerprint");

// CT replacement deliberately carries residual compensation forward. Removing
// R0/X0 must not make unrelated auxiliary calculation inputs fail.
const ctReplacement = makeCase("ct_replacement");
const protectedLine = ctReplacement.baseline?.network.lineRelations[0] as LineRelation;
delete protectedLine.r0Ohm;
delete protectedLine.x0Ohm;
const ctRun = executeP545CaseCalculation({
  settingCase: ctReplacement,
  overrides,
  runId: "run_ct_fixture",
  executedAt: at,
  executedBy: "Engineer",
});
assert.equal(ctRun.ok, true);
if (!ctRun.ok) throw new Error(ctRun.errors.join(", "));
assert.ok(!ctRun.run.executedBlocks.includes("residual-compensation"));

useProsetStore.setState({
  settingCases: [reconductoring],
  targetedCalculationRuns: [],
  auditEvents: [],
  currentPersona: "Engineer",
});
const stored = useProsetStore
  .getState()
  .runP545TargetedCalculation(reconductoring.id, overrides);
assert.equal(stored.ok, true);
if (!stored.ok) throw new Error(stored.errors.join(", "));
assert.equal(useProsetStore.getState().targetedCalculationRuns.length, 1);
assert.ok(
  useProsetStore
    .getState()
    .settingCases[0]?.links.calculationSnapshotIds.includes(stored.run.id)
);
useProsetStore.getState().advanceSettingCaseStage(reconductoring.id);
assert.equal(useProsetStore.getState().settingCases[0]?.stage, "coordination");

console.log(
  "P545 case execution regression passed: fail-closed inputs, targeted blocks, immutable provenance, store linking, and Calculation gate release."
);
