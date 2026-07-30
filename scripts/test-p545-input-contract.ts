import assert from "node:assert/strict";
import {
  DEFAULT_SOURCE_SNAPSHOTS,
  DEFAULT_STUDY_SCENARIOS,
  LEGACY_STUDY_SCENARIO_ID,
} from "../src/domain/engineering-data";
import {
  buildP545InputContract,
  createP545InputOverride,
} from "../src/domain/p545-input-contract";

const blocked = buildP545InputContract({
  snapshots: DEFAULT_SOURCE_SNAPSHOTS,
  scenarios: DEFAULT_STUDY_SCENARIOS,
});
assert.equal(blocked.status, "blocked");
assert.equal(input(blocked, "fault_3ph").status, "blocked");
assert.ok(
  blocked.scenarioIssues.some((issue) => issue.code === "scenario-not-selected")
);

const historical = buildP545InputContract({
  snapshots: DEFAULT_SOURCE_SNAPSHOTS,
  scenarios: DEFAULT_STUDY_SCENARIOS,
  scenarioId: LEGACY_STUDY_SCENARIO_ID,
});
assert.equal(input(historical, "line_length").value, 3.25);
assert.equal(input(historical, "line_length").unit, "km");
assert.equal(input(historical, "line_r1").value, 0.046956);
assert.equal(input(historical, "line_x1").value, 0.2029267);
assert.equal(input(historical, "ct_primary").value, 3000);
assert.equal(input(historical, "ct_secondary").value, 1);
assert.equal(input(historical, "continuous_current").value, 1428);
assert.equal(input(historical, "conductor_current_rating").value, 1860);

const relayModel = input(historical, "relay_model");
assert.equal(relayModel.status, "conflict");
assert.deepEqual(
  relayModel.candidates.map((candidate) => candidate.value),
  ["P545", "MiCOM P543"]
);

const fault3ph = input(historical, "fault_3ph");
assert.equal(fault3ph.status, "conflict");
assert.deepEqual(
  fault3ph.candidates.map((candidate) => candidate.value),
  [26.24, 33.22]
);
assert.ok(fault3ph.candidates.every((candidate) => candidate.source.capturedAt));
assert.ok(
  fault3ph.candidates.some(
    (candidate) => candidate.source.scenarioId === LEGACY_STUDY_SCENARIO_ID
  )
);

assert.throws(
  () =>
    createP545InputOverride({
      contract: historical,
      inputKey: "fault_3ph",
      rawValue: "33.22",
      reason: "pilih",
      actor: "Engineer",
    }),
  /at least 8 characters/
);

const override = createP545InputOverride({
  contract: historical,
  inputKey: "fault_3ph",
  rawValue: "33.22",
  reason: "Use selected historical IHS scenario for parity review.",
  actor: "Engineer",
  at: "2026-07-30T00:00:00.000Z",
});
const overridden = buildP545InputContract({
  snapshots: DEFAULT_SOURCE_SNAPSHOTS,
  scenarios: DEFAULT_STUDY_SCENARIOS,
  scenarioId: LEGACY_STUDY_SCENARIO_ID,
  overrides: [override],
});
assert.equal(input(overridden, "fault_3ph").status, "overridden");
assert.equal(input(overridden, "fault_3ph").value, 33.22);
assert.equal(input(overridden, "fault_3ph").candidates.length, 2);
assert.match(input(overridden, "fault_3ph").override?.reason ?? "", /historical IHS/);

assert.throws(
  () =>
    createP545InputOverride({
      contract: blocked,
      inputKey: "fault_3ph",
      rawValue: "26.24",
      reason: "Use benchmark value temporarily.",
      actor: "Engineer",
    }),
  /valid scenario/
);

console.log(
  "P545 input-contract regression passed: units/provenance, scenario gate, conflicts, and justified overrides are explicit."
);

function input(
  contract: ReturnType<typeof buildP545InputContract>,
  key: string
) {
  const value = contract.inputs.find((item) => item.key === key);
  assert.ok(value, `Expected input ${key}.`);
  return value;
}
