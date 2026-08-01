import assert from "node:assert/strict";
import { buildGraphForUltg } from "../src/domain/graph-builder";
import {
  buildScopedTopologyCandidates,
  collectUniqueGraphEntities,
  topologyDecisionKey,
} from "../src/domain/topology-remediation";

const { groups } = buildGraphForUltg();
const entities = collectUniqueGraphEntities(groups);
assert.equal(
  new Set(entities.bays.map((bay) => bay.id)).size,
  entities.bays.length,
  "case scope picker must receive one option per physical bay id"
);
assert.equal(
  new Set(entities.lineRelations.map((relation) => relation.id)).size,
  entities.lineRelations.length,
  "case scope picker must receive one option per relation id"
);

const angkeAncol = entities.lineRelations
  .filter((relation) => relation.digsilentName?.startsWith("ANGKE-ANCOL"))
  .sort((left, right) => left.circuit.localeCompare(right.circuit));
assert.deepEqual(
  angkeAncol.map((relation) => relation.circuit),
  ["1", "2"],
  "ANGKE-ANCOL circuit #1 and #2 must remain distinct"
);
assert.notEqual(angkeAncol[0].fromBayId, angkeAncol[1].fromBayId);
assert.notEqual(angkeAncol[0].toBayId, angkeAncol[1].toBayId);

const subject = groups.flatMap((group) => group.lineRelations)[0];
assert.ok(subject, "fixture must expose at least one topology relation");

const lineScoped = buildScopedTopologyCandidates(groups, {
  id: "case_line_scope",
  subjectLineId: subject.id,
  substationIds: [subject.fromSubstationId, subject.toSubstationId],
});
assert.equal(lineScoped.length, 1, "subject-line case must render exactly one approval card");
assert.equal(lineScoped[0].relation.id, subject.id);
assert.deepEqual(
  new Set(lineScoped[0].bays.map((bay) => bay.id)),
  new Set([subject.fromBayId, subject.toBayId]),
  "approval payload must contain only the two endpoint bays"
);

const bayScoped = buildScopedTopologyCandidates(groups, {
  id: "case_bay_scope",
  subjectBayId: subject.fromBayId,
  substationIds: [],
});
assert.ok(bayScoped.length >= 1);
assert.ok(
  bayScoped.every(
    (candidate) =>
      candidate.relation.fromBayId === subject.fromBayId ||
      candidate.relation.toBayId === subject.fromBayId
  ),
  "subject-bay case must not leak unrelated relations"
);

const stationScoped = buildScopedTopologyCandidates(groups, {
  id: "case_station_scope",
  substationIds: [subject.fromSubstationId],
});
assert.ok(stationScoped.length >= 1);
assert.ok(
  stationScoped.every(
    (candidate) =>
      candidate.relation.fromSubstationId === subject.fromSubstationId ||
      candidate.relation.toSubstationId === subject.fromSubstationId
  )
);
assert.equal(
  new Set(stationScoped.map((candidate) => candidate.relation.id)).size,
  stationScoped.length,
  "duplicate endpoint groups must collapse into one card per relation"
);

assert.notEqual(
  topologyDecisionKey("case_a", subject.id),
  topologyDecisionKey("case_b", subject.id),
  "approval decisions must remain attributable to their Case/Study"
);

const missing = buildScopedTopologyCandidates(groups, {
  id: "case_missing",
  subjectLineId: "relation_not_in_sources",
  substationIds: [],
});
assert.equal(missing.length, 0, "missing source must not produce a guessed relation card");

console.log(
  `Topology remediation tests passed: unique bay options, ANGKE-ANCOL #1/#2 separation, one subject card, ${stationScoped.length} station-scope cards, no guessed relation.`
);
