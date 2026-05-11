// Generalized matcher: maps a normalized "imported endpoint" (substation +
// bay + circuit) to a LineRelation in the active network case. This replaces
// the substring/regex logic that used to live separately inside the LCD+DIST
// and OCR/GFR import modules so every importer can share one mapper.

import type { NetworkLine, NetworkNode } from "./seed-network-registry";
import {
  inferRemoteEndpoint,
  looseTokenMatch,
  normalizeCircuit,
  normalizeStationName,
} from "./normalization";

export type ImportedEndpoint = {
  substation: string;
  bay: string;
  circuit: string;
};

export type MatchStatus =
  | "matched"            // exactly 1 LineRelation cocok
  | "ambiguous"          // multi candidate; user pilih manual
  | "needs_relation"     // both substations ada di mini-NMM, line belum ada
  | "needs_substation"   // remote substation belum ada di mini-NMM (perlu expansion)
  | "unmatched";         // local substation bukan bagian case

export type LineMatch = {
  status: MatchStatus;
  matchedLineId?: string;
  candidateLineIds: string[];
  reason: string;
  // Hint untuk UI quick-add: nama remote substation hasil parsing bay name.
  // Diisi saat status `needs_substation` atau `needs_relation` agar tombol
  // "+ Add Relation" / "+ Add Substation" tahu apa yang harus diciptakan.
  remoteStationHint?: string;
  localStationHint?: string;
};

export function matchEndpointToLine(
  ep: ImportedEndpoint,
  nodes: NetworkNode[],
  lines: NetworkLine[]
): LineMatch {
  const localStation = normalizeStationName(ep.substation);
  const remote = inferRemoteEndpoint(ep.bay);
  const circuit = normalizeCircuit(ep.circuit) || remote.circuit;

  if (!localStation) {
    return {
      status: "unmatched",
      candidateLineIds: [],
      reason: "Substation name missing or unparseable.",
    };
  }

  const candidates = lines.filter((line) => {
    const from = nodes.find((n) => n.id === line.fromNodeId);
    const to = nodes.find((n) => n.id === line.toNodeId);
    if (!from || !to) return false;
    const fromName = normalizeStationName(from.name);
    const toName = normalizeStationName(to.name);
    const lineCircuit = normalizeCircuit(line.circuit);

    const localMatchesFrom = looseTokenMatch(localStation, fromName);
    const remoteMatchesTo = remote.endpoint
      ? looseTokenMatch(remote.endpoint, toName)
      : false;
    const circuitMatches = !lineCircuit || !circuit || lineCircuit === circuit;

    return localMatchesFrom && remoteMatchesTo && circuitMatches;
  });

  if (candidates.length === 1) {
    return {
      status: "matched",
      matchedLineId: candidates[0].id,
      candidateLineIds: [candidates[0].id],
      reason: "Matched by GI/GIS name, remote endpoint, and circuit.",
      localStationHint: localStation,
      remoteStationHint: remote.endpoint,
    };
  }
  if (candidates.length > 1) {
    return {
      status: "ambiguous",
      candidateLineIds: candidates.map((c) => c.id),
      reason: `Multiple line relations match (${candidates.length}); circuit or endpoint disambiguation needed.`,
      localStationHint: localStation,
      remoteStationHint: remote.endpoint,
    };
  }

  const hasLocalEndpoint = nodes.some((node) =>
    looseTokenMatch(localStation, normalizeStationName(node.name))
  );
  if (!hasLocalEndpoint) {
    return {
      status: "unmatched",
      candidateLineIds: [],
      reason: "Local substation does not appear in the active network case.",
      localStationHint: localStation,
      remoteStationHint: remote.endpoint,
    };
  }

  // Local IS in the case. Differentiate based on whether the remote endpoint
  // is also a known substation (needs only relation creation) or a brand new
  // GI that must be added first (needs substation expansion).
  const hasRemoteEndpoint = remote.endpoint
    ? nodes.some((node) =>
        looseTokenMatch(remote.endpoint, normalizeStationName(node.name))
      )
    : false;
  if (hasRemoteEndpoint) {
    return {
      status: "needs_relation",
      candidateLineIds: [],
      reason: "Both substations exist in mini-NMM, but no line relation connects them. Add relation.",
      localStationHint: localStation,
      remoteStationHint: remote.endpoint,
    };
  }
  return {
    status: "needs_substation",
    candidateLineIds: [],
    reason: `Remote endpoint "${remote.endpoint}" not yet in mini-NMM. Add substation + relation.`,
    localStationHint: localStation,
    remoteStationHint: remote.endpoint,
  };
}

// Returns a predicate that decides whether an imported record (with its raw
// substation and bay strings) belongs to the active case. Replaces the
// hardcoded `/DURIKOSAMBI|DAAN MOGOT|.../i` regex used to scope inbox/import
// previews to the corridor — the predicate is now derived from the case's
// own substation list, so adding a new case in mini-NMM or NETWORK_CASES
// automatically widens the scope.
export function buildCaseScopePredicate(
  nodes: NetworkNode[]
): (record: { substation: string; bay: string }) => boolean {
  if (nodes.length === 0) return () => true;
  const stationPatterns = nodes.map((node) => normalizeStationName(node.name));
  return (record) => {
    const haystack = normalizeStationName(`${record.substation} ${record.bay}`);
    return stationPatterns.some((pattern) => pattern && haystack.includes(pattern));
  };
}

export function matchAnySide(
  ep: ImportedEndpoint,
  nodes: NetworkNode[],
  lines: NetworkLine[]
): LineMatch {
  const forward = matchEndpointToLine(ep, nodes, lines);
  if (forward.status === "matched") return forward;

  const swappedLines: NetworkLine[] = lines.map((line) => ({
    ...line,
    fromNodeId: line.toNodeId,
    toNodeId: line.fromNodeId,
    fromBay: line.toBay,
    toBay: line.fromBay,
  }));
  const reverse = matchEndpointToLine(ep, nodes, swappedLines);
  if (reverse.status === "matched") {
    return {
      ...reverse,
      reason: `${reverse.reason} (reverse-side bay)`,
    };
  }

  if (matchStatusRank(reverse.status) > matchStatusRank(forward.status)) {
    return {
      ...reverse,
      reason: `${reverse.reason} (reverse-side bay)`,
    };
  }
  return forward;
}

function matchStatusRank(status: MatchStatus) {
  const rank: Record<MatchStatus, number> = {
    matched: 5,
    ambiguous: 4,
    needs_relation: 3,
    needs_substation: 2,
    unmatched: 1,
  };
  return rank[status];
}
