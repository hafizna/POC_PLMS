// Imports HEL_PHT_TAP — the per-bay sheet that is far deeper than DIST/AR/
// OCR_PHT (Current Diff, Distance Z1-Z3 with PP/PE split, Scheme Logic
// incl. POTT/PUTT selection, SOTF/TOR, Autoreclose, System Checks/Sync,
// VTS/CTS supervision, OCR/GFR backup) — see the HEL_PHT_TAP
// data-completeness audit. This module mirrors lcd-dist-import.ts's
// candidate/promote shape so it slots into the same overlay/graph-builder
// pipeline, rather than inventing a parallel import path.
//
// All 13 penghantar relay models in the sheet now have a column map
// (scripts/extract-hel-pht-tap.mjs), but they collapse into 7 distinct
// record shapes, not 1 — each relay family reports genuinely different
// fields (P545's PP/PE-split distance vs 7SL87's flat Z1/R(Ph-g)/R(Ph-ph)
// vs PCS-931's IEC-61850-style ZG/ZP naming vs GRL 200's separate
// phase-Mho/ground-Quad blocks). `PromotedHelPhtTapBay` therefore only
// promotes the fields common to every shape (identity, matching, CT/VT,
// confidence) and keeps the full original `HelPhtTapRecord` alongside it —
// consumers that need model-specific fields (e.g. a future RelaySetting
// builder) read `raw` and switch on `model`, the same way
// rio-xrio-import.ts's callers switch on `kind`/vendor rather than one
// flattened universal shape.

import helPhtTapRegistry from "./generated/hel-pht-tap-registry.json";
import type { NetworkLine, NetworkNode } from "./seed-network-registry";
import { matchAnySide } from "./matcher";
import { normalizeStationName } from "./normalization";
import type { LifecycleStatus, RelaySetting, SettingRecord, UnifiedNetwork } from "./unified";

export type HelPhtTapRegistry = typeof helPhtTapRegistry;
export type HelPhtTapRecord = HelPhtTapRegistry["records"][number];

export type HelPhtTapLineCandidate = {
  id: string;
  recordId: string;
  sourceRow: number;
  substation: string;
  remoteBay: string;
  model: string;
  matchStatus:
    | "matched"
    | "ambiguous"
    | "needs_relation"
    | "needs_substation"
    | "unmatched";
  matchedLineId?: string;
  candidateLineIds: string[];
  reason: string;
  lifecycleStatus: LifecycleStatus;
  remoteStationHint?: string;
  localStationHint?: string;
};

// Matched-bay view of one HEL_PHT_TAP row. Only fields present on every one
// of the sheet's 7 record shapes are promoted to top level (identity,
// matching, CT/VT ratio); `raw` carries the full model-specific record
// (distance zones, scheme, AR, OCR backup, etc.) for consumers that already
// know which model they're dealing with — see the file header for why this
// isn't flattened further.
export type PromotedHelPhtTapBay = {
  id: string;
  source: "hel-pht-tap-import";
  matchedLineId: string;
  sourceRow: number;
  substation: string;
  remoteBay: string;
  model: string;
  ctRatio: string;
  vtRatio: string;
  raw: HelPhtTapRecord;
  confidence: "reviewed_candidate";
};

export const HEL_PHT_TAP_REGISTRY = helPhtTapRegistry;

export function findHelPhtTapRecordsByBay(pattern: RegExp): HelPhtTapRecord[] {
  return HEL_PHT_TAP_REGISTRY.records.filter((record) =>
    pattern.test(`${record.substation} ${record.remoteBay}`)
  );
}

export function mapHelPhtTapCandidatesToLines(
  records: HelPhtTapRecord[],
  nodes: NetworkNode[],
  lines: NetworkLine[],
  overrides: Record<string, string> = {}
): HelPhtTapLineCandidate[] {
  return records.map((record) => {
    // HEL_PHT_TAP carries no circuit column (unlike DIST/OCR_PHT) — the
    // sheet only distinguishes bays by remote substation name, so circuit
    // is left blank and matchAnySide/inferRemoteEndpoint resolve it from
    // the bay label the same way they do for a "-1"-less LCD/DIST row.
    const match = matchAnySide(
      { substation: record.substation, bay: record.remoteBay, circuit: "" },
      nodes,
      lines
    );

    const overrideLineId = overrides[record.id];
    const overrideAccepted = overrideLineId && match.candidateLineIds.includes(overrideLineId);
    return {
      id: `candidate_${record.id}`,
      recordId: record.id,
      sourceRow: record.sourceRow,
      substation: record.substation,
      remoteBay: record.remoteBay,
      model: record.model,
      matchStatus: overrideAccepted ? "matched" : match.status,
      matchedLineId: overrideAccepted ? overrideLineId : match.matchedLineId,
      candidateLineIds: match.candidateLineIds,
      reason: overrideAccepted ? "Engineer-selected line mapping." : match.reason,
      lifecycleStatus: "imported",
      remoteStationHint: match.remoteStationHint,
      localStationHint: match.localStationHint,
    };
  });
}

export function promoteMatchedHelPhtTapCandidates(
  records: HelPhtTapRecord[],
  nodes: NetworkNode[],
  lines: NetworkLine[],
  overrides: Record<string, string> = {}
): PromotedHelPhtTapBay[] {
  return mapHelPhtTapCandidatesToLines(records, nodes, lines, overrides)
    .filter((candidate) => candidate.matchStatus === "matched" && candidate.matchedLineId)
    .map((candidate) => {
      const record = records.find((item) => item.id === candidate.recordId)!;
      return {
        id: `promoted_${candidate.recordId}`,
        source: "hel-pht-tap-import",
        matchedLineId: candidate.matchedLineId!,
        sourceRow: record.sourceRow,
        substation: record.substation,
        remoteBay: record.remoteBay,
        model: record.model,
        ctRatio: record.ctRatio,
        vtRatio: record.vtRatio,
        raw: record,
        confidence: "reviewed_candidate",
      };
    });
}

export function buildHelPhtTapArtifacts(
  network: UnifiedNetwork,
  overrides: Record<string, string> = {}
): { settingRecords: SettingRecord[]; relaySettings: RelaySetting[] } {
  const nodes: NetworkNode[] = network.substations.map((station) => ({
    id: station.id,
    name: station.name,
    shortCode: station.shortCode,
    type: station.kind,
    voltageKv: station.voltageKv,
    sourceIds: [],
  }));
  const lines: NetworkLine[] = network.lineRelations.map((relation) => {
    const fromBay = network.bays.find((bay) => bay.id === relation.fromBayId);
    const toBay = network.bays.find((bay) => bay.id === relation.toBayId);
    return {
      id: relation.id,
      fromNodeId: relation.fromSubstationId,
      toNodeId: relation.toSubstationId,
      fromBay: fromBay?.rawName ?? relation.fromBayId,
      toBay: toBay?.rawName ?? relation.toBayId,
      circuit: relation.circuit,
      protectionFunctions: relation.protectionFunctionIds,
      sourceIds: relation.sourceIds,
      confidence: relation.confidence,
      completeness: 100,
      lineXOhm: relation.lineXOhm,
      physicalLengthKm: relation.physicalLengthKm,
      r1Ohm: relation.r1Ohm,
      x1Ohm: relation.x1Ohm,
      r0Ohm: relation.r0Ohm,
      x0Ohm: relation.x0Ohm,
      currentRatingKa: relation.currentRatingKa,
    };
  });
  const promoted = promoteMatchedHelPhtTapCandidates(
    HEL_PHT_TAP_REGISTRY.records,
    nodes,
    lines,
    overrides
  );
  const settingRecords: SettingRecord[] = [];
  const relaySettings: RelaySetting[] = [];

  for (const item of promoted) {
    const relation = network.lineRelations.find((line) => line.id === item.matchedLineId);
    if (!relation) continue;
    const local = network.substations.find(
      (station) => normalizeStationName(station.name) === normalizeStationName(item.substation)
    );
    const bayId = local?.id === relation.toSubstationId ? relation.toBayId : relation.fromBayId;
    const relay = network.relayIeds.find(
      (ied) => ied.bayId === bayId && normalizeStationName(ied.model) === normalizeStationName(item.model)
    ) ?? network.relayIeds.find((ied) => ied.bayId === bayId);
    if (!relay) continue;
    const functionId = network.protectionFunctions.find(
      (fn) => fn.relayIedId === relay.id && fn.function === "DIST"
    )?.id;
    // A SettingRecord must never point at an invented/dangling protection
    // function. The mapped HEL row remains visible as a candidate until the
    // relay catalog supplies a concrete DIST function for this bay.
    if (!functionId) continue;
    settingRecords.push({
      id: `setting_${item.raw.id}`,
      protectionFunctionId: functionId,
      source: "hel-pht-tap-import",
      sourceRef: `HEL_PHT_TAP row ${item.sourceRow}`,
      values: flattenSettingValues(item.raw),
      confidence: "medium",
      status: "imported",
    });
    const setting = relaySettingFromHel(item.raw, relay.id, relation.fromBayId === bayId ? "forward" : "reverse");
    if (setting) relaySettings.push(setting);
  }
  return { settingRecords, relaySettings };
}

function flattenSettingValues(record: HelPhtTapRecord): Record<string, number | string | null> {
  const output: Record<string, number | string | null> = {};
  const walk = (value: unknown, path: string) => {
    if (value === null || typeof value === "number" || typeof value === "string") {
      if (path) output[path] = value;
      return;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    for (const [key, child] of Object.entries(value)) {
      if (["id", "sourceRow", "bayId", "substation", "remoteBay", "model"].includes(key)) continue;
      walk(child, path ? `${path}.${key}` : key);
    }
  };
  walk(record, "");
  return output;
}

function relaySettingFromHel(
  record: HelPhtTapRecord,
  relayIedId: string,
  direction: "forward" | "reverse"
): RelaySetting | null {
  const raw = record as unknown as Record<string, any>;
  const distance = raw.distance ?? raw.distSetting ?? raw.phaseDistance;
  const zones = [1, 2, 3].map((zone) => {
    const reach = firstNumber(
      distance?.[`z${zone}PhReachOhm`], distance?.[`z${zone}Ohm`],
      distance?.[`z${zone}XReachOhm`], distance?.[`z${zone}ReachOhm`],
      distance?.[`z${zone}pZSetOhm`], raw[`zone${zone}`]?.[`x${zone}ppOhm`]
    );
    if (reach === null) return null;
    const resistance = firstNumber(
      distance?.[`r${zone}PhResistiveOhm`], distance?.[`r${zone}phOhm`],
      distance?.[`z${zone}RphphOhm`], raw[`zone${zone}`]?.[`r${zone}ppOhm`]
    ) ?? reach * 0.15;
    const delay = firstNumber(
      distance?.[`tZ${zone}PhDelayS`], distance?.[`tZ${zone}S`],
      distance?.[`z${zone}OperateDelayS`], distance?.[`z${zone}DelayS`],
      distance?.[`z${zone}pTOpS`], raw[`zone${zone}`]?.tppS
    ) ?? (zone === 1 ? 0 : zone === 2 ? 0.4 : 1.6);
    return {
      id: `Z${zone}` as "Z1" | "Z2" | "Z3",
      xReachOhm: reach,
      rReachOhm: resistance,
      rfppOhmPerLoop: resistance,
      rfpeOhmPerLoop: resistance,
      timeDelayPpS: delay,
      timeDelayPeS: delay,
      operatePp: true,
      operatePe: true,
    };
  });
  if (zones.some((zone) => zone === null)) return null;
  return {
    id: `relset_hel_${record.id}`,
    relayIedId,
    direction,
    zones: zones as RelaySetting["zones"],
    loadEncroachment: { enabled: false, rLdFwOhmPerPhase: 0, rLdRvOhmPerPhase: 0, argLdDeg: 0 },
    characteristicAngleDeg: firstNumber(distance?.characteristicAngleDeg, raw.lineAngleDeg) ?? 0,
    source: "hel-pht-tap-import",
    sourceRef: `HEL_PHT_TAP row ${record.sourceRow}`,
    confidence: "medium",
    status: "imported",
  };
}

function firstNumber(...values: unknown[]): number | null {
  const value = values.find((item) => typeof item === "number" && Number.isFinite(item));
  return typeof value === "number" ? value : null;
}
