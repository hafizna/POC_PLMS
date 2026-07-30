import { Topology, Corridor, Substation, LineSegment, Relay, Zone, LoadEncroachment } from "./types";
import { GTACSR_410 } from "./conductors";
import { NETWORK_GRAPH_LINES, NETWORK_GRAPH_NODES } from "./network-graph";
import type { NetworkLine, NetworkNode } from "./seed-network-registry";
import { promoteMatchedLcdDistCandidates, LCD_DIST_REGISTRY } from "./lcd-dist-import";

// =============================================================================
// DYNAMIC TOPOLOGY FROM REGISTRY
// =============================================================================

const SYN_LOAD_ENC: LoadEncroachment = {
  enabled: true,
  RLdFw_ohm_per_phase: 30.0,
  RLdRv_ohm_per_phase: 30.0,
  ArgLd_deg: 35.0,
};

function deriveMagnitudeZones(
  z1: number,
  z2: number,
  z3: number,
  z2Delay = 0.4,
  z3Delay = 1.6,
  rfppMultiplier = 2.1,
  rfpeMultiplier = 3.9
): [Zone, Zone, Zone] {
  const mk = (
    id: "Z1" | "Z2" | "Z3",
    reach: number,
    delay: number
  ): Zone => ({
    id,
    X_reach_ohm: reach,
    R_reach_ohm: +(reach * 0.15).toFixed(3),
    RFPP_ohm_per_loop: +(reach * rfppMultiplier).toFixed(3),
    RFPE_ohm_per_loop: +(reach * rfpeMultiplier).toFixed(3),
    time_delay_pp_s: delay,
    time_delay_pe_s: delay,
    operate_pp: true,
    operate_pe: true,
  });
  return [mk("Z1", z1, 0), mk("Z2", z2, z2Delay), mk("Z3", z3, z3Delay)];
}

// Derives the linear node order for the demo corridor by walking
// NETWORK_GRAPH_LINES from one end, instead of a hand-maintained id list
// (previously ["dks", "dm", "pik", "mkb"] — ids invented by the old
// generateCorridorNmm generator, meaningless once the seed switched to
// graph-builder's real DIgSILENT-anchored ids like "sub_durikosambi").
// Assumes the demo corridor is a simple chain (each node has at most 2
// line-neighbors) — true for the current DKSBI-DNMGT-PINKA-MB seed, but
// this walk will silently stop early if a future seed branches instead of
// chaining; it doesn't attempt to pick a "best" path through a branch.
function deriveLinearNodeOrder(nodes: NetworkNode[], lines: NetworkLine[]): string[] {
  if (nodes.length === 0) return [];
  const neighborsOf = (nodeId: string) =>
    lines
      .filter((l) => l.fromNodeId === nodeId || l.toNodeId === nodeId)
      .map((l) => (l.fromNodeId === nodeId ? l.toNodeId : l.fromNodeId));

  // Start from a node with only one neighbor (an end of the chain), if one
  // exists; otherwise start from the first node (e.g. a single-line case).
  const start = nodes.find((n) => new Set(neighborsOf(n.id)).size <= 1) ?? nodes[0];

  const order: string[] = [start.id];
  const visited = new Set([start.id]);
  let current = start.id;
  for (let i = 1; i < nodes.length; i++) {
    const next = neighborsOf(current).find((id) => !visited.has(id));
    if (!next) break;
    order.push(next);
    visited.add(next);
    current = next;
  }
  return order;
}

const orderedNodes = deriveLinearNodeOrder(NETWORK_GRAPH_NODES, NETWORK_GRAPH_LINES);

const subs: Substation[] = NETWORK_GRAPH_NODES.map(n => ({
  id: n.id,
  name: n.name,
  short_code: n.shortCode,
  voltage_kv: n.voltageKv,
  is_synthetic: false
}));

const promoted = promoteMatchedLcdDistCandidates(
  LCD_DIST_REGISTRY.records,
  NETWORK_GRAPH_NODES,
  NETWORK_GRAPH_LINES
);

const segs: LineSegment[] = [];
const relays: Relay[] = [];
const orderedSegmentIds: string[] = [];

for (let i = 0; i < orderedNodes.length - 1; i++) {
  const leftNodeId = orderedNodes[i];
  const rightNodeId = orderedNodes[i+1];
  
  // Find the line that connects these two nodes (in any direction)
  const line = NETWORK_GRAPH_LINES.find(l =>
    (l.fromNodeId === leftNodeId && l.toNodeId === rightNodeId) ||
    (l.fromNodeId === rightNodeId && l.toNodeId === leftNodeId)
  );
  
  if (!line) continue;
  
  // Always create the segment going left -> right
  const segId = line.id;
  segs.push({
    id: segId,
    from_substation: leftNodeId,
    to_substation: rightNodeId,
    length_km: line.physicalLengthKm ?? 10,
    conductor: GTACSR_410, // fallback
    is_synthetic: false
  });
  orderedSegmentIds.push(segId);

  // Now find the relays for left and right ends
  const matchingRecords = promoted.filter(p => p.matchedLineId === line.id);
  const leftNode = NETWORK_GRAPH_NODES.find(n => n.id === leftNodeId);
  const rightNode = NETWORK_GRAPH_NODES.find(n => n.id === rightNodeId);

  const leftRecord = matchingRecords.find(p => leftNode && p.substation.toUpperCase().includes(leftNode.name.toUpperCase()));
  const rightRecord = matchingRecords.find(p => rightNode && p.substation.toUpperCase().includes(rightNode.name.toUpperCase()));
  
  // Left relay (Forward)
  if (leftRecord) {
    const z1 = leftRecord.zones.z1 ?? 10;
    const z2 = leftRecord.zones.z2 ?? 20;
    const z3 = leftRecord.zones.z3 ?? 30;
    const t2 = leftRecord.zones.t2 ?? 0.4;
    const t3 = leftRecord.zones.t3 ?? 1.6;
    
    relays.push({
      id: `rel_${leftNodeId}_fwd_${rightNodeId}`,
      substation_id: leftNodeId,
      segment_id: segId,
      direction: "forward",
      make: leftRecord.relayLabel.split(" ")[0] || "Unknown",
      model: leftRecord.relayLabel.split(" ").slice(1).join(" ") || "Relay",
      bay_name: leftNodeId === line.fromNodeId ? line.fromBay : line.toBay,
      zones: deriveMagnitudeZones(z1, z2, z3, t2, t3),
      load_encroachment: SYN_LOAD_ENC,
      characteristic_angle_deg: 81.3,
      is_synthetic: false,
      setting_doc_no: leftRecord.tapDocument || undefined,
    });
  } else {
    relays.push({
      id: `rel_${leftNodeId}_fwd_${rightNodeId}`,
      substation_id: leftNodeId,
      segment_id: segId,
      direction: "forward",
      make: "Synthetic",
      model: "Relay",
      bay_name: leftNodeId === line.fromNodeId ? line.fromBay : line.toBay,
      zones: deriveMagnitudeZones(10, 20, 30),
      load_encroachment: SYN_LOAD_ENC,
      characteristic_angle_deg: 81.3,
      is_synthetic: true,
    });
  }

  // Right relay (Reverse)
  if (rightRecord) {
    const z1 = rightRecord.zones.z1 ?? 10;
    const z2 = rightRecord.zones.z2 ?? 20;
    const z3 = rightRecord.zones.z3 ?? 30;
    const t2 = rightRecord.zones.t2 ?? 0.4;
    const t3 = rightRecord.zones.t3 ?? 1.6;
    
    relays.push({
      id: `rel_${rightNodeId}_rev_${leftNodeId}`,
      substation_id: rightNodeId,
      segment_id: segId,
      direction: "reverse",
      make: rightRecord.relayLabel.split(" ")[0] || "Unknown",
      model: rightRecord.relayLabel.split(" ").slice(1).join(" ") || "Relay",
      bay_name: rightNodeId === line.toNodeId ? line.toBay : line.fromBay,
      zones: deriveMagnitudeZones(z1, z2, z3, t2, t3),
      load_encroachment: SYN_LOAD_ENC,
      characteristic_angle_deg: 81.3,
      is_synthetic: false,
      setting_doc_no: rightRecord.tapDocument || undefined,
    });
  } else {
     relays.push({
      id: `rel_${rightNodeId}_rev_${leftNodeId}`,
      substation_id: rightNodeId,
      segment_id: segId,
      direction: "reverse",
      make: "Synthetic",
      model: "Relay",
      bay_name: rightNodeId === line.toNodeId ? line.toBay : line.fromBay,
      zones: deriveMagnitudeZones(10, 20, 30),
      load_encroachment: SYN_LOAD_ENC,
      characteristic_angle_deg: 81.3,
      is_synthetic: true,
    });
  }
}

export const TOPOLOGY: Topology = {
  substations: subs,
  segments: segs,
  relays: relays,
};

const corridorLabel = orderedNodes
  .map((id) => NETWORK_GRAPH_NODES.find((n) => n.id === id)?.shortCode ?? id)
  .join(" - ");

export const CORRIDORS: Corridor[] = [
  {
    id: "corr_dks_dm_pik_mkb",
    label: `${corridorLabel} (Dynamic)`,
    ordered_segment_ids: orderedSegmentIds,
    start_substation_id: orderedNodes[0] ?? "",
    axis_unit_label: "ohm-X",
  }
];
