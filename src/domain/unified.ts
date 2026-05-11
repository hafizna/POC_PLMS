// Unified domain model for PLMS POC.
//
// All imported and manual data is meant to land in this graph:
//   Substation -> Bay -> LineRelation -> RelayIED -> ProtectionFunction -> SettingRecord
//
// The legacy `NETWORK_*` arrays remain as compatibility adapters for older UI
// modules. New work should target this unified graph so imported Excel rows,
// SLD endpoint promotions, manual mini-NMM edits, and future PST records can
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

// Lifecycle status applied to candidate mappings, derived line relations, and
// setting records. Starts at "imported" when an importer produces a row, moves
// to "reviewed" once a human confirms the mapping/value, "rejected" when the
// mapping is known to need correction, "approved" when the engineering review
// is complete, and "issued" when the result is published. Expandable later to
// installed/mismatch_found/obsolete.
export type LifecycleStatus =
  | "imported"
  | "reviewed"
  | "rejected"
  | "approved"
  | "issued";

export type LineRelation = {
  id: string;
  fromBayId: string;
  toBayId: string;
  fromSubstationId: string;
  toSubstationId: string;
  circuit: string;
  voltageKv: number;
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

export type UnifiedNetwork = {
  caseId: string;
  substations: UnifiedSubstation[];
  busbars: Busbar[];
  bays: Bay[];
  terminals: Terminal[];
  lineRelations: LineRelation[];
  relayIeds: RelayIED[];
  protectionFunctions: ProtectionFunction[];
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
// from seed-network-registry, which in turn imports from mini-nmm, which
// imports types from this module. The value-level cycle blanks the app
// at runtime in dev mode. Callers that want a unified view should call
// `buildUnifiedNetwork(activeCase)` themselves.
