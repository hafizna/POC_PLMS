import assert from "node:assert/strict";
import {
  DEFAULT_SOURCE_SNAPSHOTS,
  DEFAULT_STUDY_SCENARIOS,
  LEGACY_FAULT_SNAPSHOT_ID,
  LEGACY_NETWORK_SNAPSHOT_ID,
  LEGACY_STUDY_SCENARIO_ID,
  resolveFaultScenario,
  selectFaultRecordsForScenario,
  type SourceSnapshot,
} from "../src/domain/engineering-data";
import type { CrosscheckFaultRecord } from "../src/domain/crosscheck-workbook-registry";

assert.equal(DEFAULT_SOURCE_SNAPSHOTS.length, 3);
assert.notEqual(LEGACY_NETWORK_SNAPSHOT_ID, LEGACY_FAULT_SNAPSHOT_ID);

const networkSnapshot = DEFAULT_SOURCE_SNAPSHOTS.find(
  (snapshot) => snapshot.id === LEGACY_NETWORK_SNAPSHOT_ID
);
const faultSnapshot = DEFAULT_SOURCE_SNAPSHOTS.find(
  (snapshot) => snapshot.id === LEGACY_FAULT_SNAPSHOT_ID
);
assert.ok(networkSnapshot);
assert.ok(faultSnapshot);
assert.equal(networkSnapshot.kind, "network-model");
assert.equal(faultSnapshot.kind, "fault-study");
assert.equal(networkSnapshot.state, "historical");
assert.equal(faultSnapshot.state, "historical");
assert.equal(networkSnapshot.sourcePartition, "DB");
assert.equal(faultSnapshot.sourcePartition, "IHS");
assert.equal(networkSnapshot.checksum.value, faultSnapshot.checksum.value);

const missingScenario = resolveFaultScenario(
  DEFAULT_SOURCE_SNAPSHOTS,
  DEFAULT_STUDY_SCENARIOS,
  undefined
);
assert.equal(missingScenario.status, "blocked");
assert.ok(
  missingScenario.issues.some((issue) => issue.code === "scenario-not-selected")
);

const validScenario = resolveFaultScenario(
  DEFAULT_SOURCE_SNAPSHOTS,
  DEFAULT_STUDY_SCENARIOS,
  LEGACY_STUDY_SCENARIO_ID
);
assert.equal(validScenario.status, "ready");
assert.ok(validScenario.issues.some((issue) => issue.code === "historical-source"));
assert.ok(validScenario.issues.some((issue) => issue.code === "condition-unknown"));
assert.ok(validScenario.issues.some((issue) => issue.code === "calculated-at-unknown"));

const mismatchedSnapshots: SourceSnapshot[] = DEFAULT_SOURCE_SNAPSHOTS.map(
  (snapshot) =>
    snapshot.id === LEGACY_FAULT_SNAPSHOT_ID
      ? { ...snapshot, networkRevisionId: "different-network-revision" }
      : snapshot
);
const mismatchedScenario = resolveFaultScenario(
  mismatchedSnapshots,
  DEFAULT_STUDY_SCENARIOS,
  LEGACY_STUDY_SCENARIO_ID
);
assert.equal(mismatchedScenario.status, "blocked");
assert.ok(
  mismatchedScenario.issues.some(
    (issue) => issue.code === "network-revision-mismatch"
  )
);

const faultRecords: CrosscheckFaultRecord[] = [
  makeFaultRecord(10, "CILEDUG", 26.24),
  makeFaultRecord(11, "TELUK NAGA", 33.5),
];

const blockedSelection = selectFaultRecordsForScenario({
  snapshots: DEFAULT_SOURCE_SNAPSHOTS,
  scenarios: DEFAULT_STUDY_SCENARIOS,
  scenarioId: null,
  records: faultRecords,
  substation: "CILEDUG",
});
assert.equal(blockedSelection.status, "blocked");
assert.deepEqual(blockedSelection.records, []);

const readySelection = selectFaultRecordsForScenario({
  snapshots: DEFAULT_SOURCE_SNAPSHOTS,
  scenarios: DEFAULT_STUDY_SCENARIOS,
  scenarioId: LEGACY_STUDY_SCENARIO_ID,
  records: faultRecords,
  substation: "ciledug",
});
assert.equal(readySelection.status, "ready");
assert.equal(readySelection.records.length, 1);
assert.equal(readySelection.records[0].fault3phKa, 26.24);

console.log(
  "Engineering-data regression passed: DB/IHS are distinct historical snapshots and fault lookup is scenario-gated."
);

function makeFaultRecord(
  row: number,
  substation: string,
  fault3phKa: number
): CrosscheckFaultRecord {
  return {
    row,
    key: `${substation}-150`,
    bus: `${substation} BUS`,
    substation,
    area: "TEST",
    voltageKv: 150,
    r1Pu: null,
    x1Pu: null,
    r2Pu: null,
    x2Pu: null,
    r0Pu: null,
    x0Pu: null,
    fault1phKa: null,
    fault3phKa,
    kitFault1phKa: null,
    kitFault3phKa: null,
  };
}
