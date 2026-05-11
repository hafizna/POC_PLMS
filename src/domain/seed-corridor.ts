import { Topology, Corridor, Substation, LineSegment, Relay, Zone, LoadEncroachment } from "./types";
import { GTACSR_410 } from "./conductors";
import { MINI_NMM_NETWORK_LINES, MINI_NMM_NETWORK_NODES } from "./mini-nmm";
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

const orderedNodes = ["dks", "dm", "pik", "mkb"];

const subs: Substation[] = MINI_NMM_NETWORK_NODES.map(n => ({
  id: n.id,
  name: n.name,
  short_code: n.shortCode,
  voltage_kv: n.voltageKv,
  is_synthetic: false
}));

const promoted = promoteMatchedLcdDistCandidates(
  LCD_DIST_REGISTRY.records,
  MINI_NMM_NETWORK_NODES,
  MINI_NMM_NETWORK_LINES
);

const segs: LineSegment[] = [];
const relays: Relay[] = [];
const orderedSegmentIds: string[] = [];

for (let i = 0; i < orderedNodes.length - 1; i++) {
  const leftNodeId = orderedNodes[i];
  const rightNodeId = orderedNodes[i+1];
  
  // Find the line that connects these two nodes (in any direction)
  const line = MINI_NMM_NETWORK_LINES.find(l => 
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
  const leftNode = MINI_NMM_NETWORK_NODES.find(n => n.id === leftNodeId);
  const rightNode = MINI_NMM_NETWORK_NODES.find(n => n.id === rightNodeId);

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

export const CORRIDORS: Corridor[] = [
  {
    id: "corr_dks_dm_pik_mkb",
    label: "DKS - DM - PIK - MKB (Dynamic)",
    ordered_segment_ids: orderedSegmentIds,
    start_substation_id: "dks",
    axis_unit_label: "ohm-X",
  }
];
