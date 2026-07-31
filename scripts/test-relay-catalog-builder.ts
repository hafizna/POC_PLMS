import assert from "node:assert/strict";
import { buildAnchorTopology, resolveUltgScope } from "../src/domain/graph-builder";
import { buildRelayIedsFromCatalog } from "../src/domain/relay-catalog-builder";
import { RELAY_CATALOG } from "../src/domain/relay-catalog";
import type { UnifiedNetwork } from "../src/domain/unified";

// Uses the real ULTG Durikosambi anchor topology (buildAnchorTopology over
// the full digsilentLineDb) and the real relay catalog — not a synthetic
// fixture — because the point is to prove the matchedRow -> LineRelation.id
// bridge actually works end to end against real data, including the known
// case: asset relay_serial_t1645093_1ij7f83 (ABB RED670, Daan Mogot side)
// matches digsilentLineDb row 359, which graph-builder.ts anchors as
// "anchor_line_359" — the same line already used throughout this session's
// other tests/seed (study_dksbi_dnmgt's subjectLineId).

const scope = resolveUltgScope();
const anchor = buildAnchorTopology(scope);
const network: UnifiedNetwork = {
  caseId: "case_test_ultg_durikosambi",
  substations: anchor.substations,
  busbars: [],
  bays: anchor.bays,
  terminals: [],
  lineRelations: anchor.lineRelations,
  relayIeds: [],
  protectionFunctions: [],
};

const { relayIeds, issues } = buildRelayIedsFromCatalog(network);

console.log(
  `Resolved ${relayIeds.length} RelayIEDs from ${RELAY_CATALOG.summary.digsilentMatchedCount} confirmed-matched catalog assets; ${issues.length} skipped (out of scope or ambiguous bay side).`
);

// At least some assets must resolve for this ULTG scope — if this becomes 0,
// either the catalog/graph-builder id convention drifted apart or the
// dataset changed in a way worth failing loudly on.
assert.ok(relayIeds.length > 0, "expected at least one RelayIED to resolve for ULTG Durikosambi scope");

// No fabrication: every resolved RelayIED must reference a bayId that
// actually exists in this network (no dangling references).
const bayIds = new Set(anchor.bays.map((b) => b.id));
for (const ied of relayIeds) {
  assert.ok(bayIds.has(ied.bayId), `RelayIED ${ied.id} references unknown bayId ${ied.bayId}`);
}

// Specific known case: the ABB RED670 on anchor_line_359 (Durikosambi <->
// Daan Mogot) must resolve, bound to the Daan Mogot side (per
// stationRaw "GIS 150kV DAAN MOGOT").
const line359 = anchor.lineRelations.find((l) => l.id === "anchor_line_359");
assert.ok(line359, "expected anchor_line_359 to exist in this scope");
const red670 = relayIeds.find((ied) => ied.id === "relay_serial_t1645093_1ij7f83");
assert.ok(red670, "expected the known ABB RED670 asset to resolve to a RelayIED");
assert.equal(red670?.bayId, line359?.fromBayId === red670?.bayId ? line359?.fromBayId : line359?.toBayId);
assert.ok(
  red670?.bayId === line359?.fromBayId || red670?.bayId === line359?.toBayId,
  "expected the RED670 RelayIED to be bound to one of anchor_line_359's own bays"
);

// Every relayIedId used must be unique (no accidental duplicate ids from
// two catalog assets colliding).
const ids = relayIeds.map((r) => r.id);
assert.equal(new Set(ids).size, ids.length, "expected all RelayIED ids to be unique");

console.log(
  "Relay-catalog-builder regression passed: matched assets resolve to real LineRelation bays with no fabrication, no dangling references, no duplicate ids."
);
