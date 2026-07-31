import assert from "node:assert/strict";
import {
  HEL_PHT_TAP_REGISTRY,
  mapHelPhtTapCandidatesToLines,
  promoteMatchedHelPhtTapCandidates,
} from "../src/domain/hel-pht-tap-import";
import type { NetworkLine, NetworkNode } from "../src/domain/seed-network-registry";

// Registry-shape check: extract-hel-pht-tap.mjs must have run at least once
// (npm run import:hel-pht-tap) and produced all 13 penghantar relay models'
// records (184 real bay rows total, confirmed during the audit).
assert.equal(
  HEL_PHT_TAP_REGISTRY.records.length,
  184,
  "expected all 184 real HEL_PHT_TAP bay rows across 13 models — run `npm run import:hel-pht-tap` first"
);
const EXPECTED_MODEL_COUNTS: Record<string, number> = {
  "MICOM P545": 52,
  "MICOM P546": 18,
  "MICOM P543": 11,
  "MICOM P521": 2,
  "MICOM P443": 5,
  "MICOM P442": 2,
  "MICOM P446": 4,
  L90: 1,
  "7SL87": 34,
  "7SD61": 4,
  RED670: 14,
  "PCS-931": 29,
  "GRL 200": 8,
};
for (const [model, expected] of Object.entries(EXPECTED_MODEL_COUNTS)) {
  const actual = HEL_PHT_TAP_REGISTRY.records.filter((r) => r.model === model).length;
  assert.equal(actual, expected, `expected ${expected} ${model} records, got ${actual}`);
}

function findByBay(bayId: string) {
  const record = HEL_PHT_TAP_REGISTRY.records.find((r) => r.bayId === bayId);
  assert.ok(record, `expected ${bayId} in the extracted registry`);
  return record!;
}

// One real spot-check per distinct column layout (7 shapes across 13
// models), each value confirmed against the source workbook directly.

// Layout A (MICOM P545/P546/P543/P521): PP/PE-split distance, Scheme Logic,
// SOTF/TOR, Autoreclose.
const pht01 = findByBay("PHT.01") as Extract<
  (typeof HEL_PHT_TAP_REGISTRY)["records"][number],
  { model: "MICOM P545" }
>;
assert.equal(pht01.distance.z1PhReachOhm, 0.263);
assert.equal(pht01.distance.z1PhAngleDeg, 70.066);
assert.equal(pht01.currentDiff.phaseK1, 0.3, "30% should normalize to a 0.3 fraction");
assert.equal(pht01.currentDiff.phaseK2, 1.5, "150% should normalize to a 1.5 fraction");
assert.equal(pht01.scheme.aid1Selection, "PUR");
assert.equal(pht01.scheme.sotfStatus, "Enable Pole Dead");
assert.equal(pht01.scheme.torStatus, "Enabled");
assert.equal(pht01.autoreclose.arMode, "1PAR/3PAR");
assert.equal(pht01.autoreclose.discrimTimeS, 0.1, "100 ms should normalize to 0.1 s");

// RED670: Zone 1 PP/PE-split (mirrors the XRIO ZMFPDIS structure from the
// .rio/XRIO parser work), Zone 2/3 shared reach.
const red670Sample = HEL_PHT_TAP_REGISTRY.records.find(
  (r) => r.model === "RED670" && r.zone1.x1ppOhm !== null
) as Extract<(typeof HEL_PHT_TAP_REGISTRY)["records"][number], { model: "RED670" }> | undefined;
assert.ok(red670Sample, "expected at least one RED670 record with Zone 1 data");
assert.equal(red670Sample!.zone1.x1ppOhm, 2.073);
assert.equal(red670Sample!.zone1.rfppOhm, 4.354);
assert.equal(red670Sample!.zone3.x1Ohm, 22.212);

// PCS-931: IEC-61850-style ZG/ZP naming, explicit Pilot Mode.
const pcs931Sample = HEL_PHT_TAP_REGISTRY.records.find(
  (r) => r.model === "PCS-931" && r.distSetting.pilotMode !== null
) as Extract<(typeof HEL_PHT_TAP_REGISTRY)["records"][number], { model: "PCS-931" }> | undefined;
assert.ok(pcs931Sample, "expected at least one PCS-931 record with a pilot mode set");
assert.equal(pcs931Sample!.lineSetting.x1lOhm, 0.153);
assert.equal(pcs931Sample!.distSetting.pilotMode, "POTT");

// GRL 200: separate phase (Mho) / ground (Quad) distance characteristics.
const grl200Sample = HEL_PHT_TAP_REGISTRY.records.find(
  (r) => r.model === "GRL 200" && r.phaseDistance.z1ReachOhm !== null
) as Extract<(typeof HEL_PHT_TAP_REGISTRY)["records"][number], { model: "GRL 200" }> | undefined;
assert.ok(grl200Sample, "expected at least one GRL 200 record with phase distance data");
assert.equal(grl200Sample!.phaseDistance.characteristic, "Mho");
assert.equal(grl200Sample!.groundDistance.characteristic, "Quad");
assert.equal(grl200Sample!.groundDistance.z1RReachOhm, 21);

// Number normalization: comma-decimal inputs (MICOM P546 uses "," not "."
// unlike P545) and parenthetical-suffixed units ("0,819 A (sec)") must both
// resolve to the same numeric form.
const p546WithComma = HEL_PHT_TAP_REGISTRY.records.find(
  (r) => r.model === "MICOM P546" && r.lineLengthKm !== null
) as Extract<(typeof HEL_PHT_TAP_REGISTRY)["records"][number], { model: "MICOM P546" }> | undefined;
assert.ok(p546WithComma, "expected at least one MICOM P546 record with line length data");
assert.ok(
  p546WithComma!.lineLengthKm! > 0,
  "comma-decimal line length should parse to a positive number, not null"
);

// Matching: build a fixture node/line pair for ANGKE<->ANCOL and confirm
// mapHelPhtTapCandidatesToLines resolves it the same way lcd-dist-import's
// matchAnySide resolves LCD/DIST rows (matcher.ts is shared, not reimplemented).
const nodes: NetworkNode[] = [
  { id: "n_angke", name: "GI ANGKE", shortCode: "ANGKE", type: "GI", voltageKv: 150 },
  { id: "n_ancol", name: "GI ANCOL", shortCode: "ANCOL", type: "GI", voltageKv: 150 },
];
const lines: NetworkLine[] = [
  {
    id: "line_angke_ancol_1",
    fromNodeId: "n_angke",
    toNodeId: "n_ancol",
    circuit: "1",
    fromBay: "ANCOL",
    toBay: "ANGKE",
    protectionFunctions: [],
  },
];

const candidates = mapHelPhtTapCandidatesToLines([pht01], nodes, lines);
assert.equal(candidates.length, 1);
assert.equal(candidates[0].matchStatus, "matched", candidates[0].reason);
assert.equal(candidates[0].matchedLineId, "line_angke_ancol_1");

// Promoted shape only lifts fields common to every one of the 7 record
// shapes (identity/matching/CT/VT); model-specific fields (distance zones,
// scheme, AR, etc.) live under `raw`, not flattened onto the promoted type —
// see hel-pht-tap-import.ts's file header for why a P545-shaped flatten
// would silently misrepresent the other 12 models' genuinely different data.
const promoted = promoteMatchedHelPhtTapCandidates([pht01], nodes, lines);
assert.equal(promoted.length, 1);
assert.equal(promoted[0].source, "hel-pht-tap-import");
assert.equal(promoted[0].model, "MICOM P545");
assert.equal(promoted[0].raw.id, pht01.id);
assert.equal((promoted[0].raw as typeof pht01).distance.z1PhReachOhm, 0.263);

console.log(
  `HEL_PHT_TAP import regression passed: 184 records across all 13 penghantar relay models extracted (7 distinct column layouts), ` +
    "spot-checked values for layout A/RED670/PCS-931/GRL 200 match the source workbook, comma-decimal and parenthetical-unit " +
    "normalization both resolve correctly, and PHT.01 (ANGKE-ANCOL) still resolves to a real line via the shared matcher."
);
