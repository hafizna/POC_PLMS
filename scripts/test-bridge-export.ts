// Smoke test for PLMS → NMM bridge export.
//
// Builds bridge export from the seeded network graph (DKS-DM-PIK-MKB corridor) +
// the LCD+DIST and OCR registries, with no user decisions / no PDF
// promotions. Writes the output to a file we can inspect manually.
//
// Run: npm run test:bridge
// Output: out/bridge-export-sample.json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildBridgeExport } from "../src/domain/bridge-export";
import { NETWORK_GRAPH_DKS_PIK } from "../src/domain/network-graph";
import type { CandidateDecision, PdfTapPromotion } from "../src/store/useProsetStore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const outDir = path.resolve(__dirname, "..", "out");
fs.mkdirSync(outDir, { recursive: true });

// Run two scenarios so we can diff and prove that user decisions + PDF
// promotions populate the protection settings section.
const emptyOutFile = path.join(outDir, "bridge-export-sample.json");
const populatedOutFile = path.join(outDir, "bridge-export-with-decisions.json");

console.log(`Building bridge exports for case: ${NETWORK_GRAPH_DKS_PIK.caseId}`);
console.log(
  `Network graph: ${NETWORK_GRAPH_DKS_PIK.substations.length} subs, ${NETWORK_GRAPH_DKS_PIK.bays.length} bays, ${NETWORK_GRAPH_DKS_PIK.lineRelations.length} relations, ${NETWORK_GRAPH_DKS_PIK.relayIeds.length} IEDs`
);

// ============================================================================
// Scenario A: fresh state (no decisions, no promotions)
// ============================================================================
console.log("\n=== Scenario A: empty decisions + promotions ===");

const emptyExport = buildBridgeExport({
  caseId: NETWORK_GRAPH_DKS_PIK.caseId,
  caseTitle: "DKS - DM - PIK - MKB (empty state)",
  networkGraph: NETWORK_GRAPH_DKS_PIK,
  decisions: {},
  pdfTapPromotions: [],
});

fs.writeFileSync(emptyOutFile, JSON.stringify(emptyExport, null, 2));
console.log(
  `Wrote ${emptyOutFile} (${(fs.statSync(emptyOutFile).size / 1024).toFixed(1)} KB)`
);
console.log(
  `  protectionSettings: ${emptyExport.protectionSettings.length} (expected 0)`
);

// ============================================================================
// Scenario B: realistic state with user decisions and PDF promotion
// ============================================================================
console.log("\n=== Scenario B: with decisions + 1 PDF TAP promotion ===");

// Simulate engineer reviewing/approving some imports + promoting 1 PDF.
// IDs match real records that mapLcdDistCandidatesToLines / mapOcrCandidatesToLines
// find for the DKS-DM-PIK-MKB neighborhood.
const fakeDecisions: Record<string, CandidateDecision> = {
  // Approve LCD+DIST for DM→DKS line
  "lcd:gis_150kv_daan_mogot_pht_150kv_durikosambi_1_1_37": {
    status: "approved",
    decidedAt: "2026-05-14T10:00:00Z",
    note: "Verified against TAP PDF TJBB/01/04/2019/155",
  },
  // Approve LCD+DIST for DM→PIK line
  "lcd:gis_150kv_daan_mogot_pht_150kv_pantai_indah_kapuk_1_1_39": {
    status: "approved",
    decidedAt: "2026-05-14T10:05:00Z",
    note: "Verified against screening Excel",
  },
  // Reviewed (not yet approved) LCD+DIST for GRB→DKS
  "lcd:gis_150kv_grogol_baru_pht_150kv_durikosambi_1_1_45": {
    status: "reviewed",
    decidedAt: "2026-05-14T11:00:00Z",
  },
  // Approve OCR for one bay (assuming this record matches; if not, will just
  // be ignored by the builder since it requires matchedLineId)
  "ocr:gis_150kv_daan_mogot_pht_150kv_durikosambi_1_1_37": {
    status: "approved",
    decidedAt: "2026-05-14T10:10:00Z",
  },
  // Reject one ambiguous candidate
  "lcd:gis_150kv_muarakarang_baru_pht_150kv_pantai_indah_kapuk_1_1_55": {
    status: "rejected",
    decidedAt: "2026-05-14T11:30:00Z",
    note: "Likely refers to a different bay",
  },
};

const fakePromotions: PdfTapPromotion[] = [
  {
    id: "pdftap_test_dks_dm_1",
    sourceIntakeId: "intake_test_001",
    caseId: NETWORK_GRAPH_DKS_PIK.caseId,
    lineId: "line_dm_dks_1",
    fileName: "official tap setting proteksi sutt durikosambi - daan mogot 1_rev01.pdf",
    promotedAt: "2026-05-14T12:00:00Z",
    actor: "Engineer",
    status: "reviewed",
    fields: [
      { field: "Z1 reach", value: "2.073", unit: "ohm" },
      { field: "Z2 reach", value: "3.110", unit: "ohm" },
      { field: "Z3 reach", value: "5.183", unit: "ohm" },
      { field: "t2 delay", value: "0.4", unit: "s" },
      { field: "t3 delay", value: "1.6", unit: "s" },
      { field: "Line impedance", value: "2.59", unit: "ohm" },
      { field: "CT ratio", value: "3000/5", unit: "A" },
      { field: "VT ratio", value: "150 kV/100 V" },
      { field: "TAP document", value: "TJBB/01/04/2019/155" },
    ],
    note: "Promoted from official TAP PDF for DKS-DM line setting baseline",
  },
];

const populatedExport = buildBridgeExport({
  caseId: NETWORK_GRAPH_DKS_PIK.caseId,
  caseTitle: "DKS - DM - PIK - MKB (with decisions)",
  networkGraph: NETWORK_GRAPH_DKS_PIK,
  decisions: fakeDecisions,
  pdfTapPromotions: fakePromotions,
});

fs.writeFileSync(populatedOutFile, JSON.stringify(populatedExport, null, 2));
console.log(
  `Wrote ${populatedOutFile} (${(fs.statSync(populatedOutFile).size / 1024).toFixed(1)} KB)`
);
console.log(
  `  protectionSettings: ${populatedExport.protectionSettings.length} (expected > 0)`
);

// ============================================================================
// Compare and report
// ============================================================================
console.log("\n=== Diff: empty vs populated ===");
console.log(
  `Empty:     ${emptyExport.protectionSettings.length} settings, confidence mix: ${JSON.stringify(emptyExport.meta.confidenceMix)}`
);
console.log(
  `Populated: ${populatedExport.protectionSettings.length} settings, confidence mix: ${JSON.stringify(populatedExport.meta.confidenceMix)}`
);

console.log("\nPopulated state — protection settings breakdown:");
const byLine: Record<string, number> = {};
const bySource: Record<string, number> = {};
const byFn: Record<string, number> = {};
const byStatus: Record<string, number> = {};
for (const ps of populatedExport.protectionSettings) {
  byLine[ps.lineRelationId] = (byLine[ps.lineRelationId] ?? 0) + 1;
  bySource[ps.source] = (bySource[ps.source] ?? 0) + 1;
  byFn[ps.function] = (byFn[ps.function] ?? 0) + 1;
  byStatus[ps.status] = (byStatus[ps.status] ?? 0) + 1;
}
console.log("  By line:    ", JSON.stringify(byLine));
console.log("  By source:  ", JSON.stringify(bySource));
console.log("  By function:", JSON.stringify(byFn));
console.log("  By status:  ", JSON.stringify(byStatus));

console.log("\nSample protection settings (first 3):");
for (const ps of populatedExport.protectionSettings.slice(0, 3)) {
  console.log(
    `  ${ps.lineRelationId} | ${ps.function} | ${ps.source} | ${ps.status} | confidence=${ps.confidence}`
  );
  console.log(`    ref: ${ps.sourceRef}`);
  console.log(
    `    values: ${Object.entries(ps.values)
      .slice(0, 3)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")}${Object.keys(ps.values).length > 3 ? " ..." : ""}`
  );
}

console.log("\n--- Test complete ---");
console.log("\nNext: run NMM consumer to confirm both states are handled:");
console.log("  python -m pln_nmm.cli plms-inspect --bridge-export out/bridge-export-with-decisions.json");
console.log("  python -m pln_nmm.cli plms-generate-eq --bridge-export out/bridge-export-with-decisions.json out/case_scoped_with_decisions_EQ.xml");
