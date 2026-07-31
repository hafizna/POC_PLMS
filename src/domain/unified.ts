// Unified domain model for PLMS POC.
//
// All imported and manual data is meant to land in this graph:
//   Substation -> Bay -> LineRelation -> RelayIED -> ProtectionFunction -> SettingRecord
//
// The legacy `NETWORK_*` arrays remain as compatibility adapters for older UI
// modules. New work should target this unified graph so imported Excel rows,
// SLD endpoint promotions, manual network graph edits, and future PST records can
// land in one shape regardless of where the data originated.

import type {
  NetworkCase,
  NetworkLine,
  NetworkNode,
  RegistryConfidence,
  RelayAsset,
} from "./seed-network-registry";
import {
  inferRemoteEndpoint,
  normalizeBayName,
  normalizeCircuit,
  normalizeStationName,
} from "./normalization";
import { parseCtRatio, parseVtRatio, type CtSpec, type VtSpec } from "./instrument-transformers";

export type SubstationKind = "GI" | "GIS" | "GISTET";

export type UnifiedSubstation = {
  id: string;
  name: string;
  shortCode: string;
  voltageKv: number;
  kind: SubstationKind;
  normalizedName: string;
};

export type BusbarKind = "main" | "transfer" | "reserve" | "single" | "tie";

export type Busbar = {
  id: string;
  substationId: string;
  label: string;
  voltageKv: number;
  kind: BusbarKind;
};

export type BayKind = "line" | "transformer" | "busCoupler" | "busSection" | "incomer" | "feeder";

export type Bay = {
  id: string;
  substationId: string;
  rawName: string;
  normalizedName: string;
  remoteEndpointHint: string;
  circuit: string;
  kind?: BayKind;
};

export type Terminal = {
  id: string;
  bayId: string;
  busbarId: string;
  position: "line-side" | "bus-side";
};

// A power transformer bay. Modeled as its own entity (not just a Bay with
// kind "transformer") because distance protection reach calculations need
// its positive-sequence impedance: per IEEE/SEL zone-3 setting practice, a
// tapped/adjacent transformer with high impedance can be the element that
// actually determines safe backup reach at a remote bus — reach is set past
// the transformer's HV winding but must not encroach into its LV side.
export type Transformer = {
  id: string;
  substationId: string;
  bayId: string;
  label: string;
  hvVoltageKv: number;
  lvVoltageKv: number;
  xOhm?: number;
  rOhm?: number;
};

// One candidate element seen "behind" the remote bus of a LineRelation, i.e.
// what a Z2/Z3 backup zone from the local relay would actually reach if it
// overreaches past the remote bus. Per zone-3 setting practice, reach must
// be set to cover whichever branch at the remote bus has the *greater*
// impedance (the branch most likely to be under-covered), not just "the
// next line" by default — a short continuing line and a comparatively
// high-impedance transformer tap both need to be known and compared. A
// LineRelation can have zero (dead-end/no further branch data), one, or
// several of these; the coverage engine picks the governing candidate.
export type ReachTargetKind = "line" | "transformer" | "busbar";

export type RemoteBusBranch = {
  id: string;
  lineRelationId: string;
  targetKind: ReachTargetKind;
  // Exactly one of these should resolve depending on targetKind.
  targetLineRelationId?: string;
  targetTransformerId?: string;
  targetBusbarId?: string;
  // Positive-sequence X impedance of this branch as seen from the remote
  // bus, in ohms referred to the relay's voltage base. For a continuing
  // line this is its lineXOhm; for a transformer, its HV-referred xOhm.
  xOhm?: number;
  notes?: string;
};

// Lifecycle status applied to candidate mappings, derived line relations, and
// setting records. Starts at "imported" when an importer produces a row, moves
// to "reviewed" once a human confirms the mapping/value, "rejected" when the
// mapping is known to need correction, "approved" when the engineering review
// is complete, and "issued" when the result is published. "superseded" is
// distinct from "rejected": it marks a LineRelation that was correct but no
// longer physically exists — e.g. a GI insertion project cuts an existing
// line into two new segments (Grogol Baru cutting DKSBI-GROGOL). The old
// relation isn't wrong data, it's retired data; keeping it (rather than
// deleting) preserves audit trail for why the new segments exist. Expandable
// later to installed/mismatch_found/obsolete.
export type LifecycleStatus =
  | "imported"
  | "reviewed"
  | "rejected"
  | "approved"
  | "issued"
  | "superseded";

export type LineRelation = {
  id: string;
  fromBayId: string;
  toBayId: string;
  fromSubstationId: string;
  toSubstationId: string;
  circuit: string;
  voltageKv: number;
  r1Ohm?: number;
  x1Ohm?: number;
  r0Ohm?: number;
  x0Ohm?: number;
  currentRatingKa?: number;
  // Legacy positive-sequence X alias retained for existing coverage code.
  lineXOhm?: number;
  physicalLengthKm?: number;
  protectionFunctionIds: ProtectionFunctionId[];
  sourceIds: string[];
  confidence: RegistryConfidence;
  status: LifecycleStatus;
};

export type ProtectionFunctionId =
  | "DIST"
  | "LCD"
  | "OCR"
  | "GFR"
  | "AR"
  | "SYNC"
  | "DEF"
  | "PSB"
  | "CBF"
  | "TELE";

export type RelayIED = {
  id: string;
  bayId: string;
  make: string;
  model: string;
  serial?: string;
  ctRatio?: string;
  vtRatio?: string;
  ct?: CtSpec;
  vt?: VtSpec;
  functionGroup: string;
  confidence: RegistryConfidence;
};

export type ProtectionFunction = {
  id: string;
  relayIedId: string;
  function: ProtectionFunctionId;
};

export type SettingSourceKind =
  | "lcd-dist-import"
  | "ocr-import"
  | "tap-pdf"
  | "actual-set"
  | "manual";

export type SettingRecord = {
  id: string;
  protectionFunctionId: string;
  source: SettingSourceKind;
  sourceRef: string;
  values: Record<string, number | string | null>;
  tapDocument?: string;
  tapDate?: string;
  actualDate?: string;
  confidence: RegistryConfidence;
  status: LifecycleStatus;
};

export type DistanceZoneId = "Z1" | "Z2" | "Z3";

// One distance zone's reach and timer, in primary ohms/seconds. Field names
// and semantics mirror the legacy `Zone` type (src/domain/types.ts) used by
// src/lib/corridor-math.ts and coordination-checks.ts, so a future graph-aware
// port of that math can read the same values from RelaySetting instead of the
// old linear-chain Relay type — this is the typed home that model has
// intentionally lacked so far (RelayIED carries no zone/reach fields, and
// SettingRecord.values is an untyped bag not suited to zone-reach math).
export type DistanceZoneSetting = {
  id: DistanceZoneId;
  xReachOhm: number;
  rReachOhm: number;
  rfppOhmPerLoop: number;
  rfpeOhmPerLoop: number;
  timeDelayPpS: number;
  timeDelayPeS: number;
  operatePp: boolean;
  operatePe: boolean;
};

export type LoadEncroachmentSetting = {
  enabled: boolean;
  rLdFwOhmPerPhase: number;
  rLdRvOhmPerPhase: number;
  argLdDeg: number;
};

// Distance-protection zone settings for one RelayIED. Kept separate from
// RelayIED itself (rather than adding these fields directly) because not
// every relay carries a distance function (ProtectionFunctionId "DIST") —
// this only exists for relays where that function applies, mirroring how
// ProtectionFunction is already a separate join rather than flags on
// RelayIED. A relay has at most one RelaySetting per direction (a relay can
// have forward and reverse elements looking at different line ends).
export type RelaySetting = {
  id: string;
  relayIedId: string;
  direction: "forward" | "reverse";
  zones: [DistanceZoneSetting, DistanceZoneSetting, DistanceZoneSetting];
  loadEncroachment: LoadEncroachmentSetting;
  characteristicAngleDeg: number;
  source: SettingSourceKind;
  sourceRef: string;
  confidence: RegistryConfidence;
  status: LifecycleStatus;
};

export type UnifiedNetwork = {
  caseId: string;
  substations: UnifiedSubstation[];
  busbars: Busbar[];
  bays: Bay[];
  terminals: Terminal[];
  lineRelations: LineRelation[];
  relayIeds: RelayIED[];
  protectionFunctions: ProtectionFunction[];
  // Optional: absent/empty for networks that haven't been modeled to
  // bay/reach-branch granularity yet (e.g. the legacy line-to-line seed).
  // Populated once a case's remote-bus branching (line vs transformer) has
  // been captured, so the coverage engine can look up governing reach
  // candidates instead of assuming "next line" by default.
  transformers?: Transformer[];
  remoteBusBranches?: RemoteBusBranch[];
  // Optional: absent/empty until a graph-aware coordination engine is wired
  // up (see corridor-math.ts / coordination-checks.ts, currently ported only
  // against the legacy linear Relay/Corridor types). This is the future
  // typed home for Z1/Z2/Z3 reach and timer settings on this graph.
  relaySettings?: RelaySetting[];
};

const KNOWN_FUNCTION_TOKENS: Record<string, ProtectionFunctionId> = {
  distance: "DIST",
  dist: "DIST",
  lcd: "LCD",
  diff: "LCD",
  differential: "LCD",
  ocr: "OCR",
  oc: "OCR",
  gfr: "GFR",
  gf: "GFR",
  def: "DEF",
  ar: "AR",
  autoreclose: "AR",
  sync: "SYNC",
  synchro: "SYNC",
  synchrocheck: "SYNC",
  cbf: "CBF",
  psb: "PSB",
  teleprotection: "TELE",
  tele: "TELE",
};

export function classifyProtectionFunction(label: string | null | undefined): ProtectionFunctionId | null {
  if (!label) return null;
  const token = label.toLowerCase().trim();
  return KNOWN_FUNCTION_TOKENS[token] ?? null;
}

function buildSubstation(node: NetworkNode): UnifiedSubstation {
  return {
    id: node.id,
    name: node.name,
    shortCode: node.shortCode,
    voltageKv: node.voltageKv,
    kind: node.type,
    normalizedName: normalizeStationName(node.name),
  };
}

function buildBay(line: NetworkLine, side: "from" | "to"): Bay {
  const substationId = side === "from" ? line.fromNodeId : line.toNodeId;
  const rawName = side === "from" ? line.fromBay : line.toBay;
  const remote = inferRemoteEndpoint(rawName);
  return {
    id: `bay_${substationId}_${line.id}_${side}`,
    substationId,
    rawName,
    normalizedName: normalizeBayName(rawName),
    remoteEndpointHint: remote.endpoint,
    circuit: remote.circuit || normalizeCircuit(line.circuit),
  };
}

function buildRelation(
  line: NetworkLine,
  fromBay: Bay,
  toBay: Bay,
  voltageKv: number
): LineRelation {
  const protectionFunctionIds = line.protectionFunctions
    .map(classifyProtectionFunction)
    .filter((id): id is ProtectionFunctionId => id !== null);
  return {
    id: line.id,
    fromBayId: fromBay.id,
    toBayId: toBay.id,
    fromSubstationId: line.fromNodeId,
    toSubstationId: line.toNodeId,
    circuit: normalizeCircuit(line.circuit),
    voltageKv,
    r1Ohm: line.r1Ohm,
    x1Ohm: line.x1Ohm ?? line.lineXOhm,
    r0Ohm: line.r0Ohm,
    x0Ohm: line.x0Ohm,
    currentRatingKa: line.currentRatingKa,
    lineXOhm: line.lineXOhm,
    physicalLengthKm: line.physicalLengthKm,
    protectionFunctionIds,
    sourceIds: line.sourceIds,
    confidence: line.confidence,
    status: "reviewed",
  };
}

function buildRelayIed(relay: RelayAsset, bays: Bay[]): RelayIED | null {
  const candidate = bays.find(
    (bay) =>
      bay.substationId === relay.nodeId &&
      bay.rawName === relay.bay &&
      (!relay.circuit || bay.circuit === normalizeCircuit(relay.circuit))
  );
  if (!candidate) return null;
  return {
    id: relay.id,
    bayId: candidate.id,
    make: relay.make,
    model: relay.model,
    serial: relay.serial,
    ctRatio: relay.ctRatio,
    vtRatio: relay.vtRatio,
    ct: parseCtRatio(relay.ctRatio, relay.id) ?? undefined,
    vt: parseVtRatio(relay.vtRatio, relay.id) ?? undefined,
    functionGroup: relay.functionGroup,
    confidence: relay.confidence,
  };
}

function buildFunctionsForRelay(
  relay: RelayIED,
  protectionLabels: string[]
): ProtectionFunction[] {
  const seen = new Set<ProtectionFunctionId>();
  const result: ProtectionFunction[] = [];
  for (const label of protectionLabels) {
    const fn = classifyProtectionFunction(label);
    if (!fn || seen.has(fn)) continue;
    seen.add(fn);
    result.push({
      id: `${relay.id}_${fn.toLowerCase()}`,
      relayIedId: relay.id,
      function: fn,
    });
  }
  return result;
}

export function buildUnifiedNetwork(networkCase: NetworkCase): UnifiedNetwork {
  const substations = networkCase.nodes.map(buildSubstation);
  const bays: Bay[] = [];
  const lineRelations: LineRelation[] = [];

  for (const line of networkCase.lines) {
    const fromBay = buildBay(line, "from");
    const toBay = buildBay(line, "to");
    bays.push(fromBay, toBay);
    const voltage =
      networkCase.nodes.find((n) => n.id === line.fromNodeId)?.voltageKv ?? 150;
    lineRelations.push(buildRelation(line, fromBay, toBay, voltage));
  }

  const relayIeds: RelayIED[] = [];
  const protectionFunctions: ProtectionFunction[] = [];
  for (const relay of networkCase.relays) {
    const ied = buildRelayIed(relay, bays);
    if (!ied) continue;
    relayIeds.push(ied);
    const relation = lineRelations.find(
      (r) => r.fromBayId === ied.bayId || r.toBayId === ied.bayId
    );
    const labels = relation
      ? networkCase.lines.find((l) => l.id === relation.id)?.protectionFunctions ?? []
      : [];
    protectionFunctions.push(...buildFunctionsForRelay(ied, labels));
  }

  return {
    caseId: networkCase.id,
    substations,
    busbars: [],
    bays,
    terminals: [],
    lineRelations,
    relayIeds,
    protectionFunctions,
  };
}

// `buildUnifiedNetwork(case)` derives a unified view on demand for any
// NetworkCase. We intentionally do NOT pre-build a registry indexed by
// case id at module load — that would import `NETWORK_CASES` as a value
// from seed-network-registry, which in turn imports from network graph, which
// imports types from this module. The value-level cycle blanks the app
// at runtime in dev mode. Callers that want a unified view should call
// `buildUnifiedNetwork(activeCase)` themselves.
