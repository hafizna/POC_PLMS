// Graph-aware distance-protection reach and coordination math.
//
// This is a from-scratch port of corridor-math.ts / coordination-checks.ts
// (src/lib/) onto the newer UnifiedNetwork graph (src/domain/unified.ts)
// instead of the legacy linear Topology/Corridor/Relay model
// (src/domain/types.ts).
//
// Why a rewrite instead of a direct port: the legacy math measures reach as
// an absolute "km position along a pre-ordered corridor" and walks a flat
// array. UnifiedNetwork has no single ordered axis — a LineRelation's remote
// bus can have zero, one, or several RemoteBusBranch candidates (a
// continuing line, a transformer tap, or a busbar dead-end), so "the next
// element" is a choice, not a given. This module instead accumulates reach
// as consumed impedance (ohms) while walking outward from the relay's own
// line, and at each remote bus resolves the *governing* branch — the
// candidate with the greatest impedance, per zone-3 setting practice (see
// RemoteBusBranch's doc comment in unified.ts): that is the branch most
// likely to be under-covered and therefore the one reach must be checked
// against.
//
// Nothing in this file is wired into CoverageView/CorridorDiagram/
// VerifiedReportView yet — those still read the legacy Relay/Corridor model.
// This is deliberately scoped as a standalone, independently testable layer;
// wiring it into the UI is separate follow-up work.

import type {
  DistanceZoneId,
  DistanceZoneSetting,
  LineRelation,
  RelayIED,
  RelaySetting,
  RemoteBusBranch,
  UnifiedNetwork,
} from "../domain/unified";

// ---------------------------------------------------------------------------
// Reach walking
// ---------------------------------------------------------------------------

export type ReachHopKind = "line" | "transformer" | "busbar";

// One element the reach walk passed through or ended on.
export type ReachHop = {
  kind: ReachHopKind;
  id: string; // LineRelation.id | Transformer.id | Busbar id
  label: string;
  xOhm: number; // impedance of this hop as offered to the walk
};

export type GraphReachEndpoint = {
  // Total X ohm actually consumed before the walk stopped (<= zone's reach).
  consumedOhm: number;
  // The chain of hops the walk traversed, starting with the relay's own line.
  path: ReachHop[];
  // True once the zone's requested X reach was fully consumed within known
  // data (the endpoint lies inside a hop). False if the walk ran out of
  // known network before consuming the full requested reach.
  exhausted: boolean;
  // True when the walk stopped only because there was no further branch
  // data (dead end / unmodeled remote bus) rather than because the reach
  // was satisfied. Distinct from the legacy "beyond_corridor" clamp — there
  // is no fixed corridor length here, only "known so far".
  ranOutOfData: boolean;
  // True when two or more RemoteBusBranch candidates existed at some bus
  // along the walk and one was picked as governing (see selectGoverningBranch).
  choseBetweenBranches: boolean;
};

function branchAsHop(
  branch: RemoteBusBranch,
  network: UnifiedNetwork
): ReachHop | null {
  if (branch.targetKind === "line") {
    const line = network.lineRelations.find((l) => l.id === branch.targetLineRelationId);
    const xOhm = branch.xOhm ?? line?.x1Ohm ?? line?.lineXOhm;
    if (xOhm === undefined) return null;
    return {
      kind: "line",
      id: branch.targetLineRelationId ?? branch.id,
      label: line ? `${line.circuit}` : branch.targetLineRelationId ?? branch.id,
      xOhm,
    };
  }
  if (branch.targetKind === "transformer") {
    const transformer = network.transformers?.find((t) => t.id === branch.targetTransformerId);
    const xOhm = branch.xOhm ?? transformer?.xOhm;
    if (xOhm === undefined) return null;
    return {
      kind: "transformer",
      id: branch.targetTransformerId ?? branch.id,
      label: transformer?.label ?? branch.targetTransformerId ?? branch.id,
      xOhm,
    };
  }
  // targetKind === "busbar": a modeled dead end (e.g. a busbar with no
  // further outgoing branch data captured yet). Zero impedance, walk cannot
  // continue past it.
  return {
    kind: "busbar",
    id: branch.targetBusbarId ?? branch.id,
    label: branch.targetBusbarId ?? branch.id,
    xOhm: 0,
  };
}

// Per zone-3 setting practice: reach must be checked against whichever
// branch at the remote bus has the *greatest* impedance, since that is the
// branch most likely to be under-covered by a given reach setting. Ties are
// broken by array order (first candidate wins) for determinism.
export function selectGoverningBranch(
  branches: RemoteBusBranch[],
  network: UnifiedNetwork
): { branch: RemoteBusBranch; hop: ReachHop } | null {
  let best: { branch: RemoteBusBranch; hop: ReachHop } | null = null;
  for (const branch of branches) {
    const hop = branchAsHop(branch, network);
    if (!hop) continue;
    if (!best || hop.xOhm > best.hop.xOhm) {
      best = { branch, hop };
    }
  }
  return best;
}

// Walk a zone's X reach outward from `startLineId`, in the direction implied
// by `fromRemoteEnd` (the relay looks toward the *other* end of its own
// line first, then — if reach remains — through whichever branch governs
// at that line's remote bus, recursively).
export function walkGraphReach(
  network: UnifiedNetwork,
  startLineId: string,
  zoneXReachOhm: number
): GraphReachEndpoint {
  const path: ReachHop[] = [];
  let remaining = zoneXReachOhm;
  let choseBetweenBranches = false;
  let currentLineId: string | undefined = startLineId;
  let consumedOhm = 0;

  // Guard against cyclic branch data (e.g. a ring network fed back on
  // itself) — without this, a mis-modeled loop would spin forever.
  const visitedLineIds = new Set<string>();

  while (currentLineId) {
    if (visitedLineIds.has(currentLineId)) {
      return { consumedOhm, path, exhausted: false, ranOutOfData: true, choseBetweenBranches };
    }
    visitedLineIds.add(currentLineId);

    const line = network.lineRelations.find((l) => l.id === currentLineId);
    if (!line) {
      return { consumedOhm, path, exhausted: false, ranOutOfData: true, choseBetweenBranches };
    }
    const lineXOhm = line.x1Ohm ?? line.lineXOhm;
    if (lineXOhm === undefined) {
      return { consumedOhm, path, exhausted: false, ranOutOfData: true, choseBetweenBranches };
    }

    path.push({ kind: "line", id: line.id, label: line.circuit, xOhm: lineXOhm });

    if (remaining <= lineXOhm) {
      consumedOhm += remaining;
      return { consumedOhm, path, exhausted: true, ranOutOfData: false, choseBetweenBranches };
    }
    remaining -= lineXOhm;
    consumedOhm += lineXOhm;

    const branches = (network.remoteBusBranches ?? []).filter(
      (b) => b.lineRelationId === currentLineId
    );
    if (branches.length === 0) {
      // No modeled remote-bus data past this line: we know reach extends
      // further, but not into what.
      return { consumedOhm, path, exhausted: false, ranOutOfData: true, choseBetweenBranches };
    }
    if (branches.length > 1) choseBetweenBranches = true;

    const governing = selectGoverningBranch(branches, network);
    if (!governing) {
      return { consumedOhm, path, exhausted: false, ranOutOfData: true, choseBetweenBranches };
    }

    if (governing.hop.kind === "line") {
      currentLineId = governing.hop.id;
      continue;
    }

    // Transformer or busbar: not a LineRelation, so the walk cannot continue
    // through it with this function (a transformer's LV-side network is a
    // separate line-relation graph, out of scope for a single reach walk).
    // Record the hop and stop — this mirrors zone-3 practice of reach being
    // set to reach *into* the transformer's HV winding without needing to
    // resolve what's behind its LV side.
    path.push(governing.hop);
    if (remaining <= governing.hop.xOhm) {
      consumedOhm += remaining;
      return { consumedOhm, path, exhausted: true, ranOutOfData: false, choseBetweenBranches };
    }
    consumedOhm += governing.hop.xOhm;
    return { consumedOhm, path, exhausted: false, ranOutOfData: true, choseBetweenBranches };
  }

  return { consumedOhm, path, exhausted: false, ranOutOfData: true, choseBetweenBranches };
}

// ---------------------------------------------------------------------------
// Relay <-> line resolution
// ---------------------------------------------------------------------------

export type RelayLineContext = {
  relay: RelayIED;
  setting: RelaySetting;
  line: LineRelation;
  // True if the relay sits at line.fromBayId looking toward toBayId.
  looksTowardToEnd: boolean;
};

// Resolve which LineRelation a RelayIED's setting applies to, and which end
// of that line the relay looks toward, mirroring the legacy
// relayKmOnCorridor/directionAlongCorridor from<->to/forward<->reverse logic.
export function resolveRelayLineContext(
  network: UnifiedNetwork,
  relaySetting: RelaySetting
): RelayLineContext | null {
  const relay = network.relayIeds.find((r) => r.id === relaySetting.relayIedId);
  if (!relay) return null;
  const line = network.lineRelations.find(
    (l) => l.fromBayId === relay.bayId || l.toBayId === relay.bayId
  );
  if (!line) return null;
  const isAtFromEnd = line.fromBayId === relay.bayId;
  // "forward" = looking away from the relay's own substation, toward the
  // opposite end of the line (the direction primary protection covers).
  const looksTowardToEnd =
    relaySetting.direction === "forward" ? isAtFromEnd : !isAtFromEnd;
  return { relay, setting: relaySetting, line, looksTowardToEnd };
}

export function computeGraphZoneExtents(
  network: UnifiedNetwork,
  relaySetting: RelaySetting
): { context: RelayLineContext; extents: { zone: DistanceZoneSetting; endpoint: GraphReachEndpoint }[] } | null {
  const context = resolveRelayLineContext(network, relaySetting);
  if (!context) return null;
  const extents = relaySetting.zones.map((zone) => ({
    zone,
    endpoint: walkGraphReach(network, context.line.id, zone.xReachOhm),
  }));
  return { context, extents };
}

// ---------------------------------------------------------------------------
// Coordination diagnostics (graph-aware port of coordination-checks.ts)
// ---------------------------------------------------------------------------

export type GraphDiagnosticSeverity = "ok" | "info" | "warning" | "error";

export type GraphDiagnostic = {
  id: string;
  severity: GraphDiagnosticSeverity;
  code: string;
  title: string;
  detail: string;
  affectedRelayIedIds: string[];
  affectedZones?: DistanceZoneId[];
};

const TIME_GRADING_MARGIN_S = 0.3;

function zoneById(setting: RelaySetting, id: DistanceZoneId): DistanceZoneSetting {
  const zone = setting.zones.find((z) => z.id === id);
  if (!zone) throw new Error(`RelaySetting ${setting.id} missing zone ${id}`);
  return zone;
}

// Checks 1-4 from coordination-checks.ts are purely per-relay/per-own-line —
// they never depended on corridor walking, so they port with only a field
// rename (X_reach_ohm -> xReachOhm etc.) and a lookup of the relay's own
// line impedance instead of its CorridorSegment.
function runOwnLineChecks(
  relay: RelayIED,
  setting: RelaySetting,
  line: LineRelation
): GraphDiagnostic[] {
  const diagnostics: GraphDiagnostic[] = [];
  const segX = line.x1Ohm ?? line.lineXOhm;
  if (segX === undefined) return diagnostics;

  const z1 = zoneById(setting, "Z1");
  const z2 = zoneById(setting, "Z2");
  const z3 = zoneById(setting, "Z3");
  const label = `${relay.make} ${relay.model} (${line.circuit})`;

  const z1Pct = (z1.xReachOhm / segX) * 100;
  if (z1Pct < 70) {
    diagnostics.push({
      id: `${relay.id}_Z1_UNDERREACH`,
      severity: "warning",
      code: "Z1_UNDERREACH",
      title: `${label}: Z1 reach below typical 80% margin`,
      detail: `Z1 X reach is ${z1.xReachOhm.toFixed(2)} ohm = ${z1Pct.toFixed(0)}% of line X (${segX.toFixed(2)} ohm). Standard practice is 80%, with 70-85% acceptable. Below 70% leaves more of the line uncovered by instantaneous protection than necessary.`,
      affectedRelayIedIds: [relay.id],
      affectedZones: ["Z1"],
    });
  } else if (z1Pct > 85) {
    diagnostics.push({
      id: `${relay.id}_Z1_OVERREACH`,
      severity: "error",
      code: "Z1_OVERREACH",
      title: `${label}: Z1 risk of remote-bus over-reach`,
      detail: `Z1 X reach is ${z1.xReachOhm.toFixed(2)} ohm = ${z1Pct.toFixed(0)}% of line X (${segX.toFixed(2)} ohm). Z1 must under-reach the remote bus to remain selective; values >85% risk false instantaneous tripping for faults beyond the remote bus due to measurement error and infeed.`,
      affectedRelayIedIds: [relay.id],
      affectedZones: ["Z1"],
    });
  }

  if (z2.xReachOhm < segX) {
    diagnostics.push({
      id: `${relay.id}_Z2_SHORT`,
      severity: "error",
      code: "Z2_SHORT",
      title: `${label}: Z2 does not reach remote bus`,
      detail: `Z2 X reach is ${z2.xReachOhm.toFixed(2)} ohm but the protected line X is ${segX.toFixed(2)} ohm. Z2 must reach beyond the remote bus to provide full primary coverage of the protected line; current setting leaves a gap.`,
      affectedRelayIedIds: [relay.id],
      affectedZones: ["Z2"],
    });
  }

  const z2Pct = (z2.xReachOhm / segX) * 100;
  if (z2Pct > 250) {
    diagnostics.push({
      id: `${relay.id}_Z2_OVERREACH`,
      severity: "warning",
      code: "Z2_OVERREACH",
      title: `${label}: Z2 reaches deep into downstream lines`,
      detail: `Z2 X reach is ${z2Pct.toFixed(0)}% of the protected line. This typically over-reaches into the second downstream line, creating coordination complexity that may require time-grading checks against the remote bay's Z2 timer.`,
      affectedRelayIedIds: [relay.id],
      affectedZones: ["Z2"],
    });
  }

  if (z2.timeDelayPpS <= 0) {
    diagnostics.push({
      id: `${relay.id}_Z2_INSTANT`,
      severity: "error",
      code: "Z2_INSTANT",
      title: `${label}: Z2 timer is zero (no selectivity)`,
      detail: `Z2 trips instantaneously. This defeats the purpose of zone time grading and will trip the bay for faults outside the protected line that should be cleared by remote relays first.`,
      affectedRelayIedIds: [relay.id],
      affectedZones: ["Z2"],
    });
  }
  if (z3.timeDelayPpS - z2.timeDelayPpS < TIME_GRADING_MARGIN_S) {
    diagnostics.push({
      id: `${relay.id}_Z2_Z3_MARGIN`,
      severity: "warning",
      code: "Z2_Z3_MARGIN",
      title: `${label}: Z2 and Z3 timer separation below margin`,
      detail: `Z2 = ${z2.timeDelayPpS.toFixed(2)} s, Z3 = ${z3.timeDelayPpS.toFixed(2)} s. Difference of ${(z3.timeDelayPpS - z2.timeDelayPpS).toFixed(2)} s is below the typical 300 ms minimum margin between zones to ensure selective backup operation.`,
      affectedRelayIedIds: [relay.id],
      affectedZones: ["Z2", "Z3"],
    });
  }

  return diagnostics;
}

// Check 5 from coordination-checks.ts (backup gap + time race), ported to
// walk the graph via computeGraphZoneExtents instead of a flat corridor
// array. Compares an upstream relay's Z2 reach (in consumed ohms from its
// own line start) against a downstream relay's Z1 reach on the *next* line
// along the walk — found by walking one hop from the upstream relay's line.
function runBackupGapChecks(
  network: UnifiedNetwork,
  relaySettings: RelaySetting[]
): GraphDiagnostic[] {
  const diagnostics: GraphDiagnostic[] = [];

  for (const upstreamSetting of relaySettings) {
    const upstreamCtx = resolveRelayLineContext(network, upstreamSetting);
    if (!upstreamCtx) continue;

    const branches = (network.remoteBusBranches ?? []).filter(
      (b) => b.lineRelationId === upstreamCtx.line.id
    );
    const governing = selectGoverningBranch(branches, network);
    if (!governing || governing.hop.kind !== "line") continue;
    const downstreamLineId = governing.hop.id;

    // Find the forward relay on the downstream line (the one whose Z1
    // protects that line from its near end, mirroring the legacy check's
    // "forward relay at the downstream end").
    const downstreamSetting = relaySettings.find((candidate) => {
      const ctx = resolveRelayLineContext(network, candidate);
      return (
        ctx?.line.id === downstreamLineId &&
        candidate.direction === "forward"
      );
    });
    if (!downstreamSetting) continue;
    const downstreamCtx = resolveRelayLineContext(network, downstreamSetting);
    if (!downstreamCtx) continue;

    const upstreamRelay = network.relayIeds.find((r) => r.id === upstreamSetting.relayIedId);
    const downstreamRelay = network.relayIeds.find((r) => r.id === downstreamSetting.relayIedId);
    if (!upstreamRelay || !downstreamRelay) continue;

    const upstreamLineX = upstreamCtx.line.x1Ohm ?? upstreamCtx.line.lineXOhm ?? 0;
    const upstreamZ2 = zoneById(upstreamSetting, "Z2");
    const downstreamZ1 = zoneById(downstreamSetting, "Z1");

    // Distance past the upstream line's own end that Z2 reaches into the
    // downstream line (0 if Z2 doesn't even reach the remote bus).
    const upstreamZ2PastRemoteBusOhm = Math.max(0, upstreamZ2.xReachOhm - upstreamLineX);
    const downstreamZ1Ohm = downstreamZ1.xReachOhm;

    if (upstreamZ2PastRemoteBusOhm < downstreamZ1Ohm) {
      diagnostics.push({
        id: `${upstreamRelay.id}_BACKUP_GAP`,
        severity: "warning",
        code: "BACKUP_GAP",
        title: `Backup gap: ${upstreamRelay.make} ${upstreamRelay.model} (${upstreamCtx.line.circuit}) Z2 does not cover ${downstreamRelay.make} ${downstreamRelay.model} (${downstreamCtx.line.circuit}) Z1 territory`,
        detail: `Z2 of upstream relay reaches ${upstreamZ2PastRemoteBusOhm.toFixed(2)} ohm past the remote bus, but Z1 of downstream relay reaches ${downstreamZ1Ohm.toFixed(2)} ohm. There is a ${(downstreamZ1Ohm - upstreamZ2PastRemoteBusOhm).toFixed(2)} ohm region with no fast backup if the downstream Z1 fails.`,
        affectedRelayIedIds: [upstreamRelay.id, downstreamRelay.id],
      });
    }

    const upstreamZ2Time = upstreamZ2.timeDelayPpS;
    const downstreamZ1Time = downstreamZ1.timeDelayPpS;
    if (upstreamZ2Time - downstreamZ1Time < TIME_GRADING_MARGIN_S) {
      diagnostics.push({
        id: `${upstreamRelay.id}_Z2_DOWN_Z1_RACE`,
        severity: "warning",
        code: "Z2_DOWN_Z1_RACE",
        title: `Time race risk: ${upstreamRelay.make} ${upstreamRelay.model} Z2 vs ${downstreamRelay.make} ${downstreamRelay.model} Z1`,
        detail: `Z2 timer of upstream (${upstreamZ2Time.toFixed(2)} s) leaves only ${(upstreamZ2Time - downstreamZ1Time).toFixed(2)} s margin over downstream Z1 (${downstreamZ1Time.toFixed(2)} s). For overlapping fault locations both relays will see the fault; the downstream Z1 must clear first.`,
        affectedRelayIedIds: [upstreamRelay.id, downstreamRelay.id],
      });
    }
  }

  return diagnostics;
}

export function runGraphCoordinationChecks(network: UnifiedNetwork): GraphDiagnostic[] {
  const relaySettings = network.relaySettings ?? [];
  const diagnostics: GraphDiagnostic[] = [];

  for (const setting of relaySettings) {
    const context = resolveRelayLineContext(network, setting);
    if (!context) continue;
    diagnostics.push(...runOwnLineChecks(context.relay, setting, context.line));
  }

  diagnostics.push(...runBackupGapChecks(network, relaySettings));

  return diagnostics;
}

export function summarizeGraphDiagnostics(diags: GraphDiagnostic[]) {
  return {
    error: diags.filter((d) => d.severity === "error").length,
    warning: diags.filter((d) => d.severity === "warning").length,
    info: diags.filter((d) => d.severity === "info").length,
    ok: diags.filter((d) => d.severity === "ok").length,
  };
}

