import ocrRegistry from "./generated/ocr-registry.json";
import type { NetworkLine, NetworkNode } from "./seed-network-registry";
import { matchAnySide } from "./matcher";
import type { LifecycleStatus } from "./unified";

export type OcrRegistry = typeof ocrRegistry;
export type OcrRecord = OcrRegistry["records"][number];
export type OcrMismatchStatus = "match" | "cosmetic" | "functional" | "unknown";

export type OcrLineCandidate = {
  recordId: string;
  matchStatus:
    | "matched"
    | "ambiguous"
    | "needs_relation"
    | "needs_substation"
    | "unmatched"
    | "candidate"
    | "needs_validation";
  matchedLineId?: string;
  candidateLineIds: string[];
  reason: string;
  lifecycleStatus: LifecycleStatus;
  remoteStationHint?: string;
  localStationHint?: string;
};

export const OCR_REGISTRY = ocrRegistry;

export function findOcrRecordsByBay(pattern: RegExp): OcrRecord[] {
  return OCR_REGISTRY.records.filter((record) =>
    pattern.test(`${record.substation} ${record.bay} ${record.circuit}`)
  );
}

export function mapOcrCandidatesToLines(
  records: OcrRecord[],
  nodes: NetworkNode[],
  lines: NetworkLine[]
): OcrLineCandidate[] {
  return records.map((record) => {
    const match = matchAnySide(
      { substation: record.substation, bay: record.bay, circuit: record.circuit },
      nodes,
      lines
    );
    return {
      recordId: record.id,
      matchStatus: match.status,
      matchedLineId: match.matchedLineId,
      candidateLineIds: match.candidateLineIds,
      reason: match.reason,
      lifecycleStatus: "imported",
      remoteStationHint: match.remoteStationHint,
      localStationHint: match.localStationHint,
    };
  });
}

export function summarizeOcrMismatch(record: OcrRecord) {
  const ocMismatch = compareNumber(record.actual.ocPickupA, record.tap.ocPickupA);
  const gfMismatch = compareNumber(record.actual.gfPickupA, record.tap.gfPickupA);
  const tmsMismatch = compareNumber(record.actual.ocTms, record.tap.ocTms);
  const gfTmsMismatch = compareNumber(record.actual.gfTms, record.tap.gfTms);
  return {
    ocMismatch,
    gfMismatch,
    tmsMismatch,
    gfTmsMismatch,
    hasFunctionalRisk:
      ocMismatch === "functional" ||
      gfMismatch === "functional" ||
      tmsMismatch === "functional" ||
      gfTmsMismatch === "functional",
  };
}

function compareNumber(actual: number | null, tap: number | null): OcrMismatchStatus {
  if (actual === null || tap === null) return "unknown";
  if (actual === tap) return "match";
  if (tap === 0) return Math.abs(actual) < 1e-9 ? "match" : "functional";
  const pct = Math.abs((actual - tap) / tap) * 100;
  return pct <= 1 ? "cosmetic" : "functional";
}
