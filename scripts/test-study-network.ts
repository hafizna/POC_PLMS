import assert from "node:assert/strict";
import {
  deriveStudyNetwork,
  getConfirmedMasterNetwork,
  suggestedStudyScope,
} from "../src/domain/study-network";

const master = getConfirmedMasterNetwork();

assert.notEqual(
  master.caseId,
  "case_dks_dm_pik_mkb",
  "confirmed master must never resolve to the historical demo corridor"
);
assert.ok(master.lineRelations.length > 0, "confirmed master must expose source-anchored relations");

const subject = master.lineRelations.find((relation) => relation.id === "anchor_line_16")
  ?? master.lineRelations[0];
assert.ok(subject, "test requires at least one confirmed subject relation");

const scope = suggestedStudyScope(master, subject.id);
const resolution = deriveStudyNetwork(master, {
  id: "test_arbitrary_bay",
  subjectLineId: subject.id,
  substationIds: scope,
  scopeRevision: 1,
});

assert.equal(resolution.ready, true, resolution.blockers.join(" "));
assert.ok(resolution.network, "valid subject line must produce a Study graph");
assert.ok(
  resolution.network!.lineRelations.some((relation) => relation.id === subject.id),
  "Study projection must retain the selected subject relation"
);
assert.ok(
  resolution.network!.lineRelations.every(
    (relation) =>
      scope.includes(relation.fromSubstationId) &&
      scope.includes(relation.toSubstationId)
  ),
  "Study projection must not leak relations outside the frozen scope"
);
assert.match(resolution.fingerprint, /test_arbitrary_bay\|r1\|/);

const missing = deriveStudyNetwork(master, {
  id: "test_missing_bay",
  subjectLineId: "line_not_confirmed",
  substationIds: [],
});
assert.equal(missing.ready, false);
assert.equal(missing.network, undefined);
assert.ok(
  missing.blockers.some((message) => message.includes("Graph Builder")),
  "missing topology must ask for confirmation instead of falling back"
);

const noStudy = deriveStudyNetwork(master, null);
assert.equal(noStudy.ready, false);
assert.equal(noStudy.fingerprint, "no-active-study");

console.log(
  `Study network tests passed: ${master.lineRelations.length} master relations, ${resolution.network!.lineRelations.length} projected relations.`
);
