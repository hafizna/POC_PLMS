// Imports HEL_PHT_TAP — the per-bay sheet that is far deeper than DIST/AR/
// OCR_PHT (Current Diff, Distance Z1-Z3 with PP/PE split, Scheme Logic
// incl. POTT/PUTT selection, SOTF/TOR, Autoreclose, System Checks/Sync,
// VTS/CTS supervision, OCR/GFR backup) — see the HEL_PHT_TAP
// data-completeness audit. This module mirrors lcd-dist-import.ts's
// candidate/promote shape so it slots into the same overlay/graph-builder
// pipeline, rather than inventing a parallel import path.
//
// All 13 penghantar relay models in the sheet now have a column map
// (scripts/extract-hel-pht-tap.mjs), but they collapse into 7 distinct
// record shapes, not 1 — each relay family reports genuinely different
// fields (P545's PP/PE-split distance vs 7SL87's flat Z1/R(Ph-g)/R(Ph-ph)
// vs PCS-931's IEC-61850-style ZG/ZP naming vs GRL 200's separate
// phase-Mho/ground-Quad blocks). `PromotedHelPhtTapBay` therefore only
// promotes the fields common to every shape (identity, matching, CT/VT,
// confidence) and keeps the full original `HelPhtTapRecord` alongside it —
// consumers that need model-specific fields (e.g. a future RelaySetting
// builder) read `raw` and switch on `model`, the same way
// rio-xrio-import.ts's callers switch on `kind`/vendor rather than one
// flattened universal shape.

import helPhtTapRegistry from "./generated/hel-pht-tap-registry.json";
import type { NetworkLine, NetworkNode } from "./seed-network-registry";
import { matchAnySide } from "./matcher";
import type { LifecycleStatus } from "./unified";

export type HelPhtTapRegistry = typeof helPhtTapRegistry;
export type HelPhtTapRecord = HelPhtTapRegistry["records"][number];

export type HelPhtTapLineCandidate = {
  id: string;
  recordId: string;
  sourceRow: number;
  substation: string;
  remoteBay: string;
  model: string;
  matchStatus:
    | "matched"
    | "ambiguous"
    | "needs_relation"
    | "needs_substation"
    | "unmatched";
  matchedLineId?: string;
  candidateLineIds: string[];
  reason: string;
  lifecycleStatus: LifecycleStatus;
  remoteStationHint?: string;
  localStationHint?: string;
};

// Matched-bay view of one HEL_PHT_TAP row. Only fields present on every one
// of the sheet's 7 record shapes are promoted to top level (identity,
// matching, CT/VT ratio); `raw` carries the full model-specific record
// (distance zones, scheme, AR, OCR backup, etc.) for consumers that already
// know which model they're dealing with — see the file header for why this
// isn't flattened further.
export type PromotedHelPhtTapBay = {
  id: string;
  source: "hel-pht-tap-import";
  matchedLineId: string;
  sourceRow: number;
  substation: string;
  remoteBay: string;
  model: string;
  ctRatio: string;
  vtRatio: string;
  raw: HelPhtTapRecord;
  confidence: "reviewed_candidate";
};

export const HEL_PHT_TAP_REGISTRY = helPhtTapRegistry;

export function findHelPhtTapRecordsByBay(pattern: RegExp): HelPhtTapRecord[] {
  return HEL_PHT_TAP_REGISTRY.records.filter((record) =>
    pattern.test(`${record.substation} ${record.remoteBay}`)
  );
}

export function mapHelPhtTapCandidatesToLines(
  records: HelPhtTapRecord[],
  nodes: NetworkNode[],
  lines: NetworkLine[]
): HelPhtTapLineCandidate[] {
  return records.map((record) => {
    // HEL_PHT_TAP carries no circuit column (unlike DIST/OCR_PHT) — the
    // sheet only distinguishes bays by remote substation name, so circuit
    // is left blank and matchAnySide/inferRemoteEndpoint resolve it from
    // the bay label the same way they do for a "-1"-less LCD/DIST row.
    const match = matchAnySide(
      { substation: record.substation, bay: record.remoteBay, circuit: "" },
      nodes,
      lines
    );

    return {
      id: `candidate_${record.id}`,
      recordId: record.id,
      sourceRow: record.sourceRow,
      substation: record.substation,
      remoteBay: record.remoteBay,
      model: record.model,
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

export function promoteMatchedHelPhtTapCandidates(
  records: HelPhtTapRecord[],
  nodes: NetworkNode[],
  lines: NetworkLine[]
): PromotedHelPhtTapBay[] {
  return mapHelPhtTapCandidatesToLines(records, nodes, lines)
    .filter((candidate) => candidate.matchStatus === "matched" && candidate.matchedLineId)
    .map((candidate) => {
      const record = records.find((item) => item.id === candidate.recordId)!;
      return {
        id: `promoted_${candidate.recordId}`,
        source: "hel-pht-tap-import",
        matchedLineId: candidate.matchedLineId!,
        sourceRow: record.sourceRow,
        substation: record.substation,
        remoteBay: record.remoteBay,
        model: record.model,
        ctRatio: record.ctRatio,
        vtRatio: record.vtRatio,
        raw: record,
        confidence: "reviewed_candidate",
      };
    });
}
