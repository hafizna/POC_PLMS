// Domain types for PLMS POC.
// These mirror the data model described in the design doc §7.

export type Substation = {
  id: string;
  name: string;
  short_code: string;
  voltage_kv: number;
  is_synthetic?: boolean;
};

export type ConductorSpec = {
  type: string;
  is_underground: boolean;
  Z1_R_per_km: number;
  Z1_X_per_km: number;
  Z0_R_per_km: number;
  Z0_X_per_km: number;
};

export type LineSegment = {
  id: string;
  from_substation: string;
  to_substation: string;
  length_km: number;
  conductor: ConductorSpec;
  is_synthetic?: boolean;
};

export type ZoneId = "Z1" | "Z2" | "Z3";

export type Zone = {
  id: ZoneId;
  X_reach_ohm: number;
  R_reach_ohm: number;
  RFPP_ohm_per_loop: number;
  RFPE_ohm_per_loop: number;
  time_delay_pp_s: number;
  time_delay_pe_s: number;
  operate_pp: boolean;
  operate_pe: boolean;
};

export type LoadEncroachment = {
  enabled: boolean;
  RLdFw_ohm_per_phase: number;
  RLdRv_ohm_per_phase: number;
  ArgLd_deg: number;
};

export type RelayDirection = "forward" | "reverse";

export type Relay = {
  id: string;
  substation_id: string;
  segment_id: string;
  direction: RelayDirection;
  make: string;
  model: string;
  bay_name: string;
  setting_doc_no?: string;
  setting_doc_valid_from?: string;
  zones: [Zone, Zone, Zone];
  load_encroachment: LoadEncroachment;
  characteristic_angle_deg: number;
  is_synthetic?: boolean;
};

// Topology = collection of substations, segments, relays.
// A "corridor" is an ordered list of segment IDs forming a path through this graph.
export type Topology = {
  substations: Substation[];
  segments: LineSegment[];
  relays: Relay[];
};

export type Corridor = {
  id: string;
  label: string;
  ordered_segment_ids: string[];
  start_substation_id: string;
  axis_unit_label?: string;
};

// Diagnostic types
export type DiagnosticSeverity = "ok" | "info" | "warning" | "error";

export type Diagnostic = {
  id: string;
  severity: DiagnosticSeverity;
  code: string;
  title: string;
  detail: string;
  affected_relay_ids: string[];
  affected_zones?: ZoneId[];
};

// Comparison view types
export type MismatchSeverity = "match" | "cosmetic" | "functional";

export type ParameterRow = {
  fn: string;
  name: string;
  terpasang: string | number;
  tap: string | number;
  unit: string | null;
  mismatch_severity_override?: MismatchSeverity;
  note?: string;
};

export type ComparisonBay = {
  bay: {
    id: string;
    substation: string;
    name: string;
    voltage_kv: number;
  };
  relay: { make: string; model: string };
  parameters: ParameterRow[];
};

// TAP Setting Production & Approval Workflow
export type ApprovalLevel = "Engineer" | "Asisten Manajer" | "Manajer";

export type TapSettingRecord = {
  id: string;
  lineId: string;
  relayId: string;
  version: string;
  status: "draft" | "pending_approval" | "approved" | "rejected" | "superseded";
  createdAt: string;
  createdBy: string;
  approvedAt?: string;
  approvedBy?: ApprovalLevel;
  rejectionReason?: string;
  effectiveDate?: string;
  zones: [Zone, Zone, Zone];
  loadEncroachment: LoadEncroachment;
  ctRatio: number;
  vtRatio: number;
  notes?: string;
  sourceRef?: string; // Reference to calculation snapshot or PDF promotion
};

export type ApprovalAction = {
  id: string;
  tapSettingId: string;
  action: "submit" | "approve" | "reject" | "recall";
  actor: ApprovalLevel;
  at: string;
  comment?: string;
};
