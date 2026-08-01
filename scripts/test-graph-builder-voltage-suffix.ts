import assert from "node:assert/strict";
import {
  buildAnchorTopology,
  buildGraphForUltg,
  getFullAnchoredNetwork,
  resolveUltgScope,
} from "../src/domain/graph-builder";

// Reported issue: Durikosambi-Kembangan should have 3 relations (2x150kV +
// 1x500kV) but the graph builder was silently dropping the 500kV path,
// because digsilentLineDb names each substation's per-voltage-level section
// with the site's shortcode plus a trailing digit ("DKSBI7", "KEMBANGAN7")
// rather than a name stationNameMatches' token comparison could resolve to
// the already-scoped "GISTET DURIKOSAMBI" / (no GISTET KEMBANGAN in the
// ULTG Durikosambi scope, so that side stays unresolved — see below).
//
// Actual raw data (confirmed via crosscheck-workbook-registry.json):
//   KBNGN-DKSBI-1 | KEMBANGAN5 -> DURIKOSAMBI       | CAB-150kV  (150kV)
//   KBNGN-DKSBI-2 | KEMBANGAN5 -> DURIKOSAMBI       | CAB-150kV  (150kV)
//   DKSBI-KMBGN1  | KEMBANGAN7 -> DKSBI7            | OHL-500kV  (500kV)
//   DKSBI-KMBGN2  | KEMBANGAN7 -> DKSBI7            | OHL-500kV  (500kV)
// So there are actually 4 raw records (2x150kV + 2x500kV) between the two
// sites, all of which should now anchor once DKSBI7/KEMBANGAN7 resolve.

const scope = resolveUltgScope();
const anchor = buildAnchorTopology(scope);

const durikosambiRelations = anchor.lineRelations.filter((r) => {
  const fromSub = anchor.substations.find((s) => s.id === r.fromSubstationId);
  const toSub = anchor.substations.find((s) => s.id === r.toSubstationId);
  const names = [fromSub?.normalizedName, toSub?.normalizedName];
  return (
    names.some((n) => n?.includes("durikosambi")) &&
    names.some((n) => n?.includes("kembangan"))
  );
});

console.log(
  "Durikosambi<->Kembangan relations found:",
  durikosambiRelations.map((r) => ({
    id: r.id,
    digsilentName: r.digsilentName,
    voltageKv:
      anchor.substations.find((s) => s.id === r.fromSubstationId)?.voltageKv,
  }))
);

// Both the 150kV cable pair and the 500kV OHL pair must now be present —
// previously only the 150kV pair (if any) survived, since neither DKSBI7 nor
// KEMBANGAN7 resolved to any scope.
assert.equal(
  durikosambiRelations.length,
  4,
  `expected 4 raw Durikosambi<->Kembangan records (2x150kV + 2x500kV) to anchor, got ${durikosambiRelations.length}`
);

const byVoltage = new Map<number, number>();
for (const r of durikosambiRelations) {
  const fromSub = anchor.substations.find((s) => s.id === r.fromSubstationId)!;
  byVoltage.set(fromSub.voltageKv, (byVoltage.get(fromSub.voltageKv) ?? 0) + 1);
}
assert.equal(byVoltage.get(150), 2, "expected exactly 2 relations at 150kV");
assert.equal(byVoltage.get(500), 2, "expected exactly 2 relations at 500kV");

// The 500kV substation must be a DIFFERENT UnifiedSubstation from the 150kV
// GI — same physical site, different voltage level, both real per the SLD
// scope ("GI DURIKOSAMBI" and "GISTET DURIKOSAMBI" are two folders).
const gi150 = anchor.substations.find(
  (s) => s.normalizedName === "durikosambi" && s.voltageKv === 150
);
const gistet500 = anchor.substations.find(
  (s) => s.voltageKv === 500 && s.normalizedName.includes("durikosambi")
);
assert.ok(gi150, "expected a 150kV Durikosambi substation");
assert.ok(gistet500, "expected a 500kV Durikosambi (GISTET) substation");
assert.notEqual(
  gi150!.id,
  gistet500!.id,
  "150kV GI and 500kV GISTET must be distinct substations, not merged"
);

// Sanity check on the voltage-suffix mapping itself: no substation anywhere
// in the full anchor should have been mislabeled 150kV when its digsilentName
// carried a trusted non-150 suffix digit for an OTHER known case (Gandul,
// which the same 500kV lines touch).
const gandul500 = anchor.substations.find(
  (s) => s.normalizedName.includes("gandul") && s.voltageKv === 500
);
assert.ok(
  gandul500,
  "expected Gandul's 500kV section (GANDUL7, touched by GNDUL-KMBGN lines) to resolve at 500kV"
);

const { groups } = buildGraphForUltg();
const dadap = groups.find((group) => group.station.normalizedName === "dadap");
const ulujami = groups.find((group) => group.station.normalizedName === "ulujami");
const muarakarang = groups.find((group) =>
  group.station.id === "sub_unresolved_gi_muarakarang_baru"
);
assert.equal(dadap?.indicators.topology, "corroborated_candidate");
assert.equal(ulujami?.indicators.topology, "corroborated_candidate");
assert.equal(muarakarang?.indicators.topology, "identity_conflict");
assert.ok(dadap?.lineRelations.length, "Dadap confirmation candidate must retain its inferred relations");
assert.ok(ulujami?.indicators.reciprocalEvidence, "Ulujami must retain reciprocal corroboration");
assert.equal(
  getFullAnchoredNetwork().lineRelations.some((relation) =>
    relation.sourceIds.some((sourceId) => sourceId.startsWith("engineer-confirmation"))
  ),
  false,
  "corroborated candidates must not enter the live graph before Graph Builder confirmation"
);

console.log(
  "Graph-builder voltage-suffix regression passed: Durikosambi<->Kembangan resolves all 4 raw records (2x150kV + 2x500kV) as distinct correctly-voltage-labeled substations."
);
