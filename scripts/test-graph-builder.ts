// Ad-hoc verification script for the new per-GI graph builder. Not part of
// the app build — run with `npx tsx scripts/test-graph-builder.ts` to sanity
// check anchor matching and per-GI grouping against real ULTG Durikosambi
// data before wiring this into any UI.
import { buildGraphForUltg } from "../src/domain/graph-builder";

const result = buildGraphForUltg();

console.log(`\n=== ${result.groups.length} groups (one per scoped/anchored GI) ===\n`);

for (const group of result.groups) {
  const tag = group.needsManualTopology ? "NEEDS MANUAL TOPOLOGY" : `confidence=${group.confidence}`;
  console.log(`--- ${group.station.name} [${group.station.shortCode}] [${group.station.kind}] (${tag}) ---`);
  console.log(`  bays: ${group.bays.length}, lineRelations: ${group.lineRelations.length}`);
  for (const rel of group.lineRelations) {
    const farId = rel.fromSubstationId === group.station.id ? rel.toSubstationId : rel.fromSubstationId;
    console.log(`    line "${rel.digsilentName}" circuit #${rel.circuit} -> ${farId} (X=${rel.lineXOhm}ohm, ${rel.lengthKm ?? "?"}km, oos=${rel.outOfService})`);
  }
  const matched = group.overlays.filter((o) => o.matchStatus === "matched");
  const unmatched = group.overlays.filter((o) => o.matchStatus === "unmatched");
  console.log(`  overlays: ${matched.length} matched, ${unmatched.length} unmatched`);
  for (const o of unmatched.slice(0, 3)) {
    console.log(`    UNMATCHED [${o.sourceKind}] ${o.substationRaw} / ${o.bayRaw} (#${o.circuit})`);
  }
  console.log("");
}

console.log(`=== ${result.unresolvedStations.length} stations with NO digsilentLineDb match at all ===`);
for (const s of result.unresolvedStations) {
  console.log(`  ${s.rawName} [${s.kind}]`);
}
