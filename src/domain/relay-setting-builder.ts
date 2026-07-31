// Builds RelaySetting entries (unified.ts) from LCD/DIST-imported distance
// data, so a UnifiedNetwork's `relaySettings` field can be populated from
// real data instead of staying empty.
//
// This is a separate module from unified.ts (rather than a function inside
// it) to avoid a value-level import cycle: lcd-dist-import.ts already
// imports `LifecycleStatus` as a type from unified.ts, and unified.ts's own
// comment documents why importing NETWORK_CASES-adjacent value exports back
// into it blanks the app in dev mode. Keeping this as its own module sidesteps
// that entirely.
//
// Deliberately does NOT fabricate a relay setting when no matching LCD/DIST
// record exists for a RelayIED — unlike the legacy seed-corridor.ts, which
// falls back to synthetic Z1=10/Z2=20/Z3=30 defaults. A relay with no real
// distance data simply gets no RelaySetting here; consumers (CoverageView)
// are expected to show that explicitly as missing data rather than display
// a plausible-looking fabricated number.

import type { NetworkLine, NetworkNode } from "./seed-network-registry";
import {
  LCD_DIST_REGISTRY,
  promoteMatchedLcdDistCandidates,
  type LcdDistRecord,
  type PromotedLcdDistLine,
} from "./lcd-dist-import";
import { normalizeStationName } from "./normalization";
import type { RelaySetting, UnifiedNetwork } from "./unified";

const DEFAULT_RFPP_MULTIPLIER = 2.1;
const DEFAULT_RFPE_MULTIPLIER = 3.9;
const DEFAULT_CHARACTERISTIC_ANGLE_DEG = 81.3;

function zoneFromPromoted(
  id: "Z1" | "Z2" | "Z3",
  reachOhm: number,
  delayS: number
): RelaySetting["zones"][number] {
  return {
    id,
    xReachOhm: reachOhm,
    rReachOhm: Number((reachOhm * 0.15).toFixed(3)),
    rfppOhmPerLoop: Number((reachOhm * DEFAULT_RFPP_MULTIPLIER).toFixed(3)),
    rfpeOhmPerLoop: Number((reachOhm * DEFAULT_RFPE_MULTIPLIER).toFixed(3)),
    timeDelayPpS: delayS,
    timeDelayPeS: delayS,
    operatePp: true,
    operatePe: true,
  };
}

// A promoted LCD/DIST record must have at least Z1 to be usable — Z2/Z3
// fall back to typical multiples of Z1 only when genuinely absent (mirrors
// seed-corridor.ts's `?? 20`/`?? 30` fallback), but the record itself must
// exist and match this relay's line; there is no fallback for "no record at
// all".
function relaySettingFromPromoted(
  id: string,
  relayIedId: string,
  direction: "forward" | "reverse",
  promoted: PromotedLcdDistLine
): RelaySetting | null {
  if (promoted.zones.z1 === null) return null;
  const z1 = promoted.zones.z1;
  const z2 = promoted.zones.z2 ?? z1 * 2;
  const z3 = promoted.zones.z3 ?? z1 * 3;
  const t2 = promoted.zones.t2 ?? 0.4;
  const t3 = promoted.zones.t3 ?? 1.6;

  return {
    id,
    relayIedId,
    direction,
    zones: [
      zoneFromPromoted("Z1", z1, 0),
      zoneFromPromoted("Z2", z2, t2),
      zoneFromPromoted("Z3", z3, t3),
    ],
    loadEncroachment: {
      enabled: true,
      rLdFwOhmPerPhase: 40,
      rLdRvOhmPerPhase: 40,
      argLdDeg: 30,
    },
    characteristicAngleDeg: DEFAULT_CHARACTERISTIC_ANGLE_DEG,
    // promoted.confidence is always the literal "reviewed_candidate" (see
    // PromotedLcdDistLine) — matched by the importer but not yet manually
    // reviewed as an issued setting, hence "medium" rather than "high".
    source: "lcd-dist-import",
    sourceRef: promoted.tapDocument || promoted.id,
    confidence: "medium",
    status: "reviewed",
  };
}

// Resolves, for each RelayIED in the network, which promoted LCD/DIST
// record (if any) applies to its line and bay side, then builds a
// RelaySetting for it. Direction is inferred the same way
// resolveRelayLineContext (graph-coordination.ts) reads it: a relay is
// "forward" when its bay is the line's fromBayId.
export function buildRelaySettingsForNetwork(
  network: UnifiedNetwork,
  nodes: NetworkNode[],
  lines: NetworkLine[]
): RelaySetting[] {
  const promoted = promoteMatchedLcdDistCandidates(
    LCD_DIST_REGISTRY.records,
    nodes,
    lines
  );
  const settings: RelaySetting[] = [];

  for (const relay of network.relayIeds) {
    const line = network.lineRelations.find(
      (l) => l.fromBayId === relay.bayId || l.toBayId === relay.bayId
    );
    if (!line) continue;
    const direction: "forward" | "reverse" =
      line.fromBayId === relay.bayId ? "forward" : "reverse";
    const substationId =
      direction === "forward" ? line.fromSubstationId : line.toSubstationId;
    // Match against `nodes` (the same NetworkNode[] passed into
    // promoteMatchedLcdDistCandidates below), not `network.substations` —
    // UnifiedNetwork's substation names can differ in format/casing from the
    // NetworkNode registry that LCD/DIST substation strings are matched
    // against. Compare via normalizeStationName (strips GI/GIS/voltage
    // tokens and word order noise, e.g. "DAAN MOGOT GIS" vs
    // "GIS 150kV DAAN MOGOT") rather than raw substring — a naive
    // `.includes()` fails whenever the LCD/DIST string reorders the
    // GI/GIS/voltage token relative to the registry's node name.
    const node = nodes.find((n) => n.id === substationId);
    if (!node) continue;
    const normalizedNodeName = normalizeStationName(node.name);

    const candidates = promoted.filter((p) => p.matchedLineId === line.id);
    const match = candidates.find(
      (p) => normalizeStationName(p.substation) === normalizedNodeName
    );
    if (!match) continue;

    const setting = relaySettingFromPromoted(
      `relset_${relay.id}`,
      relay.id,
      direction,
      match
    );
    if (setting) settings.push(setting);
  }

  return settings;
}

function relaySettingFromLcdDistRecord(
  id: string,
  relayIedId: string,
  direction: "forward" | "reverse",
  record: LcdDistRecord
): RelaySetting | null {
  const z1 = record.distance.z1PhPh ?? record.tap.z1PhPh;
  if (z1 === null || z1 === undefined) return null;
  const z2 = record.distance.z2PhPh ?? record.tap.z2PhPh ?? z1 * 2;
  const z3 = record.distance.z3PhPh ?? record.tap.z3PhPh ?? z1 * 3;
  const t2 = record.distance.t2S ?? record.tap.t2S ?? 0.4;
  const t3 = record.distance.t3S ?? record.tap.t3S ?? 1.6;

  return {
    id,
    relayIedId,
    direction,
    zones: [
      zoneFromPromoted("Z1", z1, 0),
      zoneFromPromoted("Z2", z2, t2),
      zoneFromPromoted("Z3", z3, t3),
    ],
    loadEncroachment: {
      enabled: true,
      rLdFwOhmPerPhase: 40,
      rLdRvOhmPerPhase: 40,
      argLdDeg: 30,
    },
    characteristicAngleDeg: DEFAULT_CHARACTERISTIC_ANGLE_DEG,
    source: "lcd-dist-import",
    sourceRef: record.tap.document || record.id,
    confidence: "medium",
    status: "reviewed",
  };
}

// Builds RelaySetting entries directly from graph-builder.ts's
// overlaySettingDocs() output — the OverlayRecord[] that already matched
// LCD/DIST rows to anchor bays (matchedBayId) without needing the legacy
// NetworkNode/NetworkLine model buildRelaySettingsForNetwork above requires.
// This is the path used by buildCaseFromGraphGroups/buildGraphForUltg, where
// only UnifiedNetwork + ScopedStation exist, not NetworkCase-shaped data.
//
// Each RelayIED is matched to an OverlayRecord by matchedBayId === bayId AND
// sourceKind === "lcd-dist-import" (OCR records don't carry distance zones).
// A RelayIED with no matching overlay simply gets no RelaySetting — same
// no-fabrication principle as buildRelaySettingsForNetwork.
export function buildRelaySettingsFromOverlays(
  network: UnifiedNetwork,
  overlays: Array<{ sourceKind: string; sourceId: string; matchedBayId?: string }>
): RelaySetting[] {
  const settings: RelaySetting[] = [];
  const recordsById = new Map(LCD_DIST_REGISTRY.records.map((r) => [r.id, r]));

  for (const relay of network.relayIeds) {
    const line = network.lineRelations.find(
      (l) => l.fromBayId === relay.bayId || l.toBayId === relay.bayId
    );
    if (!line) continue;
    const direction: "forward" | "reverse" =
      line.fromBayId === relay.bayId ? "forward" : "reverse";

    const overlay = overlays.find(
      (o) => o.matchedBayId === relay.bayId && o.sourceKind === "lcd-dist-import"
    );
    if (!overlay) continue;
    const record = recordsById.get(overlay.sourceId);
    if (!record) continue;

    const setting = relaySettingFromLcdDistRecord(
      `relset_${relay.id}`,
      relay.id,
      direction,
      record
    );
    if (setting) settings.push(setting);
  }

  return settings;
}
