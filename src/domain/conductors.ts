import { ConductorSpec } from "./types";

// GTACSR-410: Gap-type Aluminum Conductor Steel Reinforced, 410 mm² nominal cross-section.
// Used on Durikosambi - Daan Mogot Sirkit 1 per PDF TJBB/01/04/2019/155.
// Per-km values derived from PDF Z1 reach assumption (Z1 = 0.8 x line, line angle 81.3 deg).
// Z0 typical for OHL ~ 3x Z1.
export const GTACSR_410: ConductorSpec = {
  type: "GTACSR-410",
  is_underground: false,
  Z1_R_per_km: 0.089,
  Z1_X_per_km: 0.563,
  Z0_R_per_km: 0.27,
  Z0_X_per_km: 1.69,
};

// ACSR-240: older Aluminum Conductor Steel Reinforced, 240 mm² cross-section.
// Synthetic for the alternative branch in the POC topology.
// Higher per-km impedance than GTACSR-410 due to smaller cross-section.
export const ACSR_240: ConductorSpec = {
  type: "ACSR-240",
  is_underground: false,
  Z1_R_per_km: 0.13,
  Z1_X_per_km: 0.4,
  Z0_R_per_km: 0.4,
  Z0_X_per_km: 1.2,
};
