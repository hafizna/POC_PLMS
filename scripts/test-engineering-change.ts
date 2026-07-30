import assert from "node:assert/strict";
import {
  buildInsertionChangeSet,
  type EngineeringChangeBaseline,
} from "../src/domain/engineering-change";
import { evaluateDataReadiness } from "../src/domain/engineering-readiness";
import {
  buildDigsilentStagingPackage,
  serializeNeutralDgsPreview,
  serializeStagingLinesCsv,
} from "../src/domain/digsilent-staging";
import type {
  Bay,
  Busbar,
  LineRelation,
  Terminal,
  UnifiedNetwork,
  UnifiedSubstation,
} from "../src/domain/unified";

const subA = substation("sub_a", "A");
const subB = substation("sub_b", "B");
const subNew = substation("sub_new", "NEW");
const busA = busbar("bus_a", subA.id);
const busB = busbar("bus_b", subB.id);
const busNew = busbar("bus_new", subNew.id);
const oldBayA = bay("bay_old_a", subA.id, "B");
const oldBayB = bay("bay_old_b", subB.id, "A");
const oldRelation: LineRelation = {
  ...relation(
    "line_old",
    subA.id,
    subB.id,
    oldBayA.id,
    oldBayB.id,
    "reviewed"
  ),
  physicalLengthKm: 2,
  r1Ohm: 0.2,
  x1Ohm: 0.4,
  r0Ohm: 0.6,
  x0Ohm: 0.8,
  lineXOhm: 0.4,
};

const before: UnifiedNetwork = {
  caseId: "case_test",
  substations: [subA, subB],
  busbars: [busA, busB],
  bays: [oldBayA, oldBayB],
  terminals: [
    terminal("term_old_a", oldBayA.id, busA.id),
    terminal("term_old_b", oldBayB.id, busB.id),
  ],
  lineRelations: [oldRelation],
  relayIeds: [],
  protectionFunctions: [],
};

const bayANear = bay("bay_a_near", subA.id, "NEW");
const bayANew = bay("bay_a_new", subNew.id, "A");
const bayBNear = bay("bay_b_near", subB.id, "NEW");
const bayBNew = bay("bay_b_new", subNew.id, "B");
const relationA: LineRelation = {
  ...relation(
    "line_old_a_user",
    subA.id,
    subNew.id,
    bayANear.id,
    bayANew.id,
    "imported"
  ),
  r1Ohm: 0.1,
  x1Ohm: 0.2,
  r0Ohm: 0.3,
  x0Ohm: 0.4,
  lineXOhm: 0.2,
};
const relationB: LineRelation = {
  ...relation(
    "line_old_b_user",
    subB.id,
    subNew.id,
    bayBNear.id,
    bayBNew.id,
    "imported"
  ),
  r1Ohm: 0.1,
  x1Ohm: 0.2,
  r0Ohm: 0.3,
  x0Ohm: 0.4,
  lineXOhm: 0.2,
};

const after: UnifiedNetwork = {
  ...before,
  substations: [...before.substations, subNew],
  busbars: [...before.busbars, busNew],
  bays: [...before.bays, bayANear, bayANew, bayBNear, bayBNew],
  terminals: [
    ...before.terminals,
    terminal("term_a_near", bayANear.id, busA.id),
    terminal("term_a_new", bayANew.id, busNew.id),
    terminal("term_b_near", bayBNear.id, busB.id),
    terminal("term_b_new", bayBNew.id, busNew.id),
  ],
  lineRelations: [
    { ...oldRelation, status: "superseded" },
    relationA,
    relationB,
  ],
};

const baseline: EngineeringChangeBaseline = {
  studyId: "study_test",
  scenarioId: "scenario_test",
  networkSnapshotId: "snapshot_test",
  networkRevisionId: "network-revision-test",
  warnings: [],
};

const first = buildInsertionChangeSet({
  id: "ecs_first",
  caseId: "case_test",
  createdAt: "2026-07-29T00:00:00.000Z",
  actor: "Engineer",
  baseline,
  beforeNetwork: before,
  afterNetwork: after,
  oldRelationId: oldRelation.id,
  newSubstationId: subNew.id,
  newRelationIds: [relationA.id, relationB.id],
});

assert.equal(first.validation.valid, true);
assert.deepEqual(first.validation.errors, []);
assert.ok(Object.isFrozen(first));
assert.ok(Object.isFrozen(first.before));
assert.ok(Object.isFrozen(first.operations));

const oldUpdate = first.operations.find(
  (operation) =>
    operation.operation === "update" &&
    operation.entityKind === "relation" &&
    operation.entityId === oldRelation.id
);
assert.ok(oldUpdate);
assert.deepEqual(oldUpdate.changedFields, ["status"]);
assert.equal(
  first.operations.filter(
    (operation) =>
      operation.operation === "add" && operation.entityKind === "relation"
  ).length,
  2
);
assert.equal(
  first.operations.filter(
    (operation) =>
      operation.operation === "add" && operation.entityKind === "substation"
  ).length,
  1
);

const second = buildInsertionChangeSet({
  id: "ecs_second",
  caseId: "case_test",
  createdAt: "2030-01-01T00:00:00.000Z",
  actor: "Reviewer",
  baseline,
  beforeNetwork: before,
  afterNetwork: after,
  oldRelationId: oldRelation.id,
  newSubstationId: subNew.id,
  newRelationIds: [relationB.id, relationA.id],
});
assert.equal(
  first.fingerprint.value,
  second.fingerprint.value,
  "Same engineering delta must produce the same deterministic fingerprint."
);
assert.deepEqual(first.operations, second.operations);

const readiness = evaluateDataReadiness(first);
assert.equal(readiness.status, "ready");
assert.equal(readiness.canGeneratePreview, true);
assert.equal(readiness.readyForStudy, true);
assert.equal(readiness.counts.missing, 0);
assert.equal(readiness.counts.conflict, 0);

const staging = buildDigsilentStagingPackage(
  first,
  "2026-07-30T00:00:00.000Z"
);
assert.equal(staging.status, "ready");
assert.equal(staging.package.lines.length, 2);
assert.equal(staging.package.substations.length, 1);
assert.equal(staging.package.importReady, true);
assert.equal(staging.package.lines[0].r1OhmPerKm, 0.1);
assert.match(serializeStagingLinesCsv(staging.package), /r1OhmPerKm/);
assert.match(
  serializeNeutralDgsPreview(staging.package),
  /\$\$PLMS_NEUTRAL_DGS_PREVIEW;1\.0/
);

const brokenAfter: UnifiedNetwork = {
  ...after,
  terminals: after.terminals.map((item) =>
    item.id === "term_a_new"
      ? { ...item, busbarId: "missing_busbar" }
      : item
  ),
};
const broken = buildInsertionChangeSet({
  id: "ecs_broken",
  caseId: "case_test",
  createdAt: "2026-07-29T00:00:00.000Z",
  actor: "Engineer",
  baseline,
  beforeNetwork: before,
  afterNetwork: brokenAfter,
  oldRelationId: oldRelation.id,
  newSubstationId: subNew.id,
  newRelationIds: [relationA.id, relationB.id],
});
assert.equal(broken.validation.valid, false);
assert.ok(
  broken.validation.errors.some((error) =>
    error.includes("missing busbar missing_busbar")
  )
);

const missingElectricalAfter: UnifiedNetwork = {
  ...after,
  lineRelations: after.lineRelations.map((line) =>
    line.id === relationA.id ? { ...line, x0Ohm: undefined } : line
  ),
};
const missingElectrical = buildInsertionChangeSet({
  id: "ecs_missing_electrical",
  caseId: "case_test",
  createdAt: "2026-07-30T00:00:00.000Z",
  actor: "Engineer",
  baseline,
  beforeNetwork: before,
  afterNetwork: missingElectricalAfter,
  oldRelationId: oldRelation.id,
  newSubstationId: subNew.id,
  newRelationIds: [relationA.id, relationB.id],
});
const missingReadiness = evaluateDataReadiness(missingElectrical);
assert.equal(missingReadiness.status, "blocked");
assert.ok(missingReadiness.counts.missing > 0);
assert.equal(
  buildDigsilentStagingPackage(
    missingElectrical,
    "2026-07-30T00:00:00.000Z"
  ).status,
  "blocked"
);

const staleChangeSet = buildInsertionChangeSet({
  id: "ecs_stale",
  caseId: "case_test",
  createdAt: "2026-07-30T00:00:00.000Z",
  actor: "Engineer",
  baseline: {
    ...baseline,
    warnings: ["Baseline network snapshot is historical."],
  },
  beforeNetwork: before,
  afterNetwork: after,
  oldRelationId: oldRelation.id,
  newSubstationId: subNew.id,
  newRelationIds: [relationA.id, relationB.id],
});
const staleReadiness = evaluateDataReadiness(staleChangeSet);
assert.equal(staleReadiness.status, "review");
assert.equal(staleReadiness.canGeneratePreview, true);
assert.equal(staleReadiness.readyForStudy, false);
const staleStaging = buildDigsilentStagingPackage(
  staleChangeSet,
  "2026-07-30T00:00:00.000Z"
);
assert.equal(staleStaging.status, "ready");
assert.equal(staleStaging.package.importReady, false);

console.log(
  "Engineering-change regression passed: deterministic diff, readiness gates, and neutral DIgSILENT staging outputs are valid."
);

function substation(id: string, shortCode: string): UnifiedSubstation {
  return {
    id,
    name: shortCode,
    shortCode,
    voltageKv: 150,
    kind: "GIS",
    normalizedName: shortCode,
  };
}

function busbar(id: string, substationId: string): Busbar {
  return {
    id,
    substationId,
    label: "150 kV Busbar",
    voltageKv: 150,
    kind: "single",
  };
}

function bay(id: string, substationId: string, remote: string): Bay {
  return {
    id,
    substationId,
    rawName: `PHT ${remote}`,
    normalizedName: remote,
    remoteEndpointHint: remote,
    circuit: "1",
    kind: "line",
  };
}

function terminal(id: string, bayId: string, busbarId: string): Terminal {
  return {
    id,
    bayId,
    busbarId,
    position: "bus-side",
  };
}

function relation(
  id: string,
  fromSubstationId: string,
  toSubstationId: string,
  fromBayId: string,
  toBayId: string,
  status: LineRelation["status"]
): LineRelation {
  return {
    id,
    fromBayId,
    toBayId,
    fromSubstationId,
    toSubstationId,
    circuit: "1",
    voltageKv: 150,
    lineXOhm: 1,
    physicalLengthKm: 1,
    protectionFunctionIds: [],
    sourceIds: ["test"],
    confidence: "high",
    status,
  };
}
