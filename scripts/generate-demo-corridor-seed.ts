// Precomputes the demo corridor seed (NETWORK_GRAPH_DKS_PIK in
// network-graph.ts) from the graph-builder anchor pipeline, once, and writes
// it to generated/demo-corridor-seed.json.
//
// Why this exists instead of network-graph.ts calling buildGraphForUltg()
// directly at module load: graph-builder.ts imports
// crosscheck-workbook-registry.json (1.2 MB — the full 610-substation
// digsilentLineDb) and network-graph.ts is imported almost everywhere in the
// app. Calling the builder eagerly at module scope dragged that whole JSON
// into the main bundle (measured: ~380 kB -> ~795 kB gzip-relevant chunk).
// Precomputing here keeps the seed anchored to real DIgSILENT data (same
// source graph-builder.ts uses for the Inbox) without paying that cost on
// every load — re-run this script (`npm run generate:demo-seed`) whenever
// the demo corridor's station selection changes or digsilentLineDb is
// re-indexed.
import fs from "node:fs";
import path from "node:path";
import { buildGraphForUltg, buildCaseFromGraphGroups } from "../src/domain/graph-builder";

const DEMO_STATION_NAMES = new Set([
  "gi durikosambi",
  "daan mogot gis",
  "gis pantai indah kapuk",
  "gis muarakarang baru",
]);

const { groups } = buildGraphForUltg();
const selected = groups.filter((g) => DEMO_STATION_NAMES.has(g.station.name.toLowerCase()));

if (selected.length !== DEMO_STATION_NAMES.size) {
  console.error(
    `Expected ${DEMO_STATION_NAMES.size} demo stations, matched ${selected.length}: ${selected.map((g) => g.station.name).join(", ")}`
  );
  process.exit(1);
}

const network = buildCaseFromGraphGroups("case_dks_dm_pik_mkb", selected);

const outPath = path.join(process.cwd(), "src", "domain", "generated", "demo-corridor-seed.json");
fs.writeFileSync(outPath, JSON.stringify(network, null, 2) + "\n");
console.log(`Wrote ${outPath}`);
console.log(`  substations: ${network.substations.length}, bays: ${network.bays.length}, lineRelations: ${network.lineRelations.length}`);
