import lcdDistRegistry from "./generated/lcd-dist-registry.json";
import type { NetworkLine, NetworkNode } from "./seed-network-registry";
import { matchAnySide } from "./matcher";
import type { LifecycleStatus } from "./unified";

export type LcdDistRegistry = typeof lcdDistRegistry;
export type LcdDistRecord = LcdDistRegistry["records"][number];

export type LcdDistLineCandidate = {
  id: string;
  recordId: string;
  sourceRow: number;
  substation: string;
  bay: string;
  circuit: string;
  relayLabel: string;
  lineImpedanceOhm: number | null;
  z1PhPh: number | null;
  z2PhPh: number | null;
  z3PhPh: number | null;
  tapDocument: string;
  // matchStatus mirrors matcher.ts MatchStatus + a `candidate` synonym for
  // ambiguous (kept for legacy UI). New values:
  //   matched / ambiguous / needs_relation / needs_substation / unmatched
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

export type PromotedLcdDistLine = {
  id: string;
  source: "lcd-dist-import";
  matchedLineId: string;
  sourceRow: number;
  substation: string;
  bay: string;
  circuit: string;
  relayLabel: string;
  ctRatio: string;
  vtRatio: string;
  lineImpedanceOhm: number | null;
  zones: {
    z1: number | null;
    z2: number | null;
    z3: number | null;
    t1: number | null;
    t2: number | null;
    t3: number | null;
  };
  tapDocument: string;
  tapDate: string;
  confidence: "reviewed_candidate";
};

export const LCD_DIST_REGISTRY = lcdDistRegistry;

export function findLcdDistRecordsByBay(pattern: RegExp): LcdDistRecord[] {
  return LCD_DIST_REGISTRY.records.filter((record) =>
    pattern.test(`${record.substation} ${record.bay} ${record.circuit}`)
  );
}

export function mapLcdDistCandidatesToLines(
  records: LcdDistRecord[],
  nodes: NetworkNode[],
  lines: NetworkLine[]
): LcdDistLineCandidate[] {
  return records.map((record) => {
    const match = matchAnySide(
      { substation: record.substation, bay: record.bay, circuit: record.circuit },
      nodes,
      lines
    );
    const hasDistance =
      record.distance.lineImpedanceOhm !== null ||
      record.distance.z1PhPh !== null ||
      record.tap.z1PhPh !== null;

    let matchStatus: LcdDistLineCandidate["matchStatus"];
    let reason = match.reason;
    if (match.status === "matched") {
      matchStatus = "matched";
    } else if (!hasDistance && match.status !== "needs_substation" && match.status !== "unmatched") {
      // Records without distance values are classified separately so the UI
      // can flag them for "no distance to validate" instead of mapping issue.
      matchStatus = "needs_validation";
      reason = "No distance values found in imported row.";
    } else {
      // Pass through the new matcher sub-statuses verbatim. UI in Inbox
      // groups them into priority sections (ambiguous / needs_relation /
      // needs_substation).
      matchStatus = match.status;
    }

    return {
      id: `candidate_${record.id}`,
      recordId: record.id,
      sourceRow: record.sourceRow,
      substation: record.substation,
      bay: record.bay,
      circuit: record.circuit,
      relayLabel: `${record.relay.make} ${record.relay.model}`.trim(),
      lineImpedanceOhm: record.distance.lineImpedanceOhm,
      z1PhPh: record.distance.z1PhPh ?? record.tap.z1PhPh,
      z2PhPh: record.distance.z2PhPh ?? record.tap.z2PhPh,
      z3PhPh: record.distance.z3PhPh ?? record.tap.z3PhPh,
      tapDocument: record.tap.document,
      matchStatus,
      matchedLineId: match.matchedLineId,
      candidateLineIds: match.candidateLineIds,
      reason,
      lifecycleStatus: "imported",
      remoteStationHint: match.remoteStationHint,
      localStationHint: match.localStationHint,
    };
  });
}

export function promoteMatchedLcdDistCandidates(
  records: LcdDistRecord[],
  nodes: NetworkNode[],
  lines: NetworkLine[]
): PromotedLcdDistLine[] {
  return mapLcdDistCandidatesToLines(records, nodes, lines)
    .filter((candidate) => candidate.matchStatus === "matched" && candidate.matchedLineId)
    .map((candidate) => {
      const record = records.find((item) => item.id === candidate.recordId)!;
      return {
        id: `promoted_${candidate.recordId}`,
        source: "lcd-dist-import",
        matchedLineId: candidate.matchedLineId!,
        sourceRow: record.sourceRow,
        substation: record.substation,
        bay: record.bay,
        circuit: record.circuit,
        relayLabel: `${record.relay.make} ${record.relay.model}`.trim(),
        ctRatio: record.ctRatio,
        vtRatio: record.vtRatio,
        lineImpedanceOhm: record.distance.lineImpedanceOhm,
        zones: {
          z1: record.distance.z1PhPh ?? record.tap.z1PhPh,
          z2: record.distance.z2PhPh ?? record.tap.z2PhPh,
          z3: record.distance.z3PhPh ?? record.tap.z3PhPh,
          t1: record.distance.t1S ?? record.tap.t1S,
          t2: record.distance.t2S ?? record.tap.t2S,
          t3: record.distance.t3S ?? record.tap.t3S,
        },
        tapDocument: record.tap.document,
        tapDate: record.tap.date,
        confidence: "reviewed_candidate",
      };
    });
}
