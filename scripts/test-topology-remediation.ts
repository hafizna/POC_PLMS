import assert from "node:assert/strict";
import { buildGraphForUltg } from "../src/domain/graph-builder";
import {
  buildScopedTopologyCandidates,
  topologyDecisionKey,
} from "../src/domain/topology-remediation";

const { groups } = buildGraphForUltg();
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
  `Topology remediation tests passed: one subject card, ${stationScoped.length} station-scope cards, no guessed relation.`
);
