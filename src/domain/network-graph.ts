import {
  Bay,
  Busbar,
  LineRelation,
  ProtectionFunction,
  RelayIED,
  RemoteBusBranch,
  Terminal,
  Transformer,
  UnifiedNetwork,
  UnifiedSubstation,
  classifyProtectionFunction,
} from "./unified";
import type { NetworkLine, NetworkNode, RelayAsset } from "./seed-network-registry";
import { normalizeSubstationIdentity } from "./normalization";
import demoCorridorSeed from "./generated/demo-corridor-seed.json";

export const INVENTORY_MASTER_CASE_ID = "case_ultg_dks_inventory";

// Seed corridor for the demo Studies (DKSBI-DNMGT and DNMGT-PINKA — see
// DEFAULT_STUDIES in useProsetStore.ts): precomputed by
// scripts/generate-demo-corridor-seed.ts from the same anchor pipeline as
// the Inbox graph builder (digsilentLineDb + SLD scope), not a
// hand-maintained generator, so its substation ids/shortCodes (DKSBI, DNMGT,
// PINKA, ...) are the real DIgSILENT-convention codes rather than invented
// ones. Precomputed (rather than calling buildGraphForUltg() here directly)
// because graph-builder.ts pulls in crosscheck-workbook-registry.json
// (1.2 MB) — this module is imported almost everywhere in the app, so doing
// that at module scope nearly doubled the main bundle. Re-run
// `npm run generate:demo-seed` if the demo corridor's station selection
// changes or digsilentLineDb is re-indexed.
export const NETWORK_GRAPH_DKS_PIK: UnifiedNetwork = demoCorridorSeed as UnifiedNetwork;

export const NETWORK_GRAPH_BY_CASE: Record<string, UnifiedNetwork> = {
  [NETWORK_GRAPH_DKS_PIK.caseId]: NETWORK_GRAPH_DKS_PIK,
};

export function getNetworkGraph(caseId: string): UnifiedNetwork | undefined {
  return NETWORK_GRAPH_BY_CASE[caseId];
}

// Overrides a base entity by id rather than appending alongside it — needed
// for cases where an override must supersede a seed/anchor entity (e.g. a
// LineRelation retired to status "superseded" after a GI insertion project
// physically cuts it into two new segments). A plain concat would leave both
// the old and new entity in the array under the same id, since nothing else
// in the effective-graph pipeline dedupes by id downstream.
function upsertById<T extends { id: string }>(base: T[], overrides: T[]): T[] {
  const next = [...base];
  for (const item of overrides) {
    const index = next.findIndex((existing) => existing.id === item.id);
    if (index >= 0) next[index] = item;
    else next.push(item);
  }
  return next;
}

export type NetworkGraphOverrideShape = {
  substations: UnifiedSubstation[];
  busbars?: Busbar[];
  bays: Bay[];
  terminals?: Terminal[];
  relations: LineRelation[];
  ieds: RelayIED[];
  transformers?: Transformer[];
  remoteBusBranches?: RemoteBusBranch[];
};

// Merge user-added entities (from store) on top of the seeded network graph.
// Returns a new UnifiedNetwork or undefined if no seed exists for the case
// AND no overrides are provided.
export function getEffectiveNetworkGraph(
  caseId: string,
  override?: NetworkGraphOverrideShape,
  fallbackBase?: UnifiedNetwork
): UnifiedNetwork | undefined {
  const seed = NETWORK_GRAPH_BY_CASE[caseId] ?? fallbackBase;
  const ov = override ?? {
    substations: [],
    busbars: [],
    bays: [],
    terminals: [],
    relations: [],
    ieds: [],
  };
  const hasOverride =
    ov.substations.length +
      (ov.busbars?.length ?? 0) +
      ov.bays.length +
      (ov.terminals?.length ?? 0) +
      ov.relations.length +
      ov.ieds.length >
    0;
  if (!seed && !hasOverride) return undefined;

  const base: UnifiedNetwork = seed ?? {
    caseId,
    substations: [],
    busbars: [],
    bays: [],
    terminals: [],
    lineRelations: [],
    relayIeds: [],
    protectionFunctions: [],
  };

  const protectionFunctions: ProtectionFunction[] = [...base.protectionFunctions];
  // For each user-added IED, derive a default ProtectionFunction list from
  // the IED's functionGroup (e.g. "LCD+DIST", "OCR/GFR"). Naive split on
  // common delimiters.
  for (const ied of ov.ieds) {
    const tokens: string[] = ied.functionGroup
      .split(/[\s+/,]/)
      .map((t: string) => t.trim().toLowerCase())
      .filter(Boolean);
    const seen = new Set<string>();
    for (const token of tokens) {
      const fn = classifyProtectionFunction(token);
      if (!fn || seen.has(fn)) continue;
      seen.add(fn);
      protectionFunctions.push({
        id: `${ied.id}_${fn.toLowerCase()}`,
        relayIedId: ied.id,
        function: fn,
      });
    }
  }

  return {
    caseId,
    substations: upsertById(base.substations, ov.substations),
    busbars: upsertById(base.busbars, ov.busbars ?? []),
    bays: upsertById(base.bays, ov.bays),
    terminals: upsertById(base.terminals, ov.terminals ?? []),
    lineRelations: upsertById(base.lineRelations, ov.relations),
    relayIeds: upsertById(base.relayIeds, ov.ieds),
    protectionFunctions,
    transformers: upsertById(base.transformers ?? [], ov.transformers ?? []),
    remoteBusBranches: upsertById(base.remoteBusBranches ?? [], ov.remoteBusBranches ?? []),
  };
}

// =============================================================================
// Adapters: derive legacy NetworkNode/NetworkLine/RelayAsset shape from the
// unified network graph.
// =============================================================================

export function networkNodesFromGraph(network: UnifiedNetwork): NetworkNode[] {
  return network.substations.map((sub) => ({
    id: sub.id,
    name: sub.name,
    shortCode: sub.shortCode,
    type: sub.kind,
    voltageKv: sub.voltageKv,
    sldSourceId: "src_sld_folder",
  }));
}

export function networkLinesFromGraph(network: UnifiedNetwork): NetworkLine[] {
  return network.lineRelations.map((relation) => {
    const fromBay = network.bays.find((b) => b.id === relation.fromBayId);
    const toBay = network.bays.find((b) => b.id === relation.toBayId);
    const fromIed = network.relayIeds.find((r) => r.bayId === relation.fromBayId);
    const toIed = network.relayIeds.find((r) => r.bayId === relation.toBayId);

    const fromSub = network.substations.find((s) => s.id === relation.fromSubstationId);
    const toSub = network.substations.find((s) => s.id === relation.toSubstationId);

    let ctRatio = "";
    if (fromIed?.ctRatio && toIed?.ctRatio && fromIed.ctRatio !== toIed.ctRatio) {
      ctRatio = `${fromIed.ctRatio} at ${fromSub?.shortCode ?? "from"}, ${toIed.ctRatio} at ${toSub?.shortCode ?? "to"}`;
    } else {
      ctRatio = fromIed?.ctRatio ?? toIed?.ctRatio ?? "";
    }

    const vtRatio = fromIed?.vtRatio ?? toIed?.vtRatio ?? "";
    const relayMain = fromIed
      ? `${fromIed.make} ${fromIed.model}`.trim()
      : toIed
        ? `${toIed.make} ${toIed.model}`.trim()
        : "";

    const pfs = network.protectionFunctions
      .filter((pf) => pf.relayIedId === fromIed?.id || pf.relayIedId === toIed?.id)
      .map((pf) => pf.function);
    const uniquePfs = Array.from(new Set([...pfs, ...relation.protectionFunctionIds]));
    const isSldDraft = relation.sourceIds.includes("sld-endpoint-candidate");

    return {
      id: relation.id,
      fromNodeId: relation.fromSubstationId,
      toNodeId: relation.toSubstationId,
      circuit: relation.circuit ? `#${relation.circuit}` : "",
      fromBay: fromBay?.rawName ?? "Draft bay",
      toBay: toBay?.rawName ?? "Draft bay",
      ctRatio,
      vtRatio,
      relayMain,
      protectionFunctions: uniquePfs.length > 0 ? uniquePfs : ["Network"],
      r1Ohm: relation.r1Ohm,
      x1Ohm: relation.x1Ohm ?? relation.lineXOhm,
      r0Ohm: relation.r0Ohm,
      x0Ohm: relation.x0Ohm,
      currentRatingKa: relation.currentRatingKa,
      lineXOhm: relation.lineXOhm,
      physicalLengthKm: relation.physicalLengthKm,
      sourceIds: relation.sourceIds,
      lifecycleStatus: relation.status,
      completeness: isSldDraft ? 35 : 80,
      confidence: relation.confidence,
      notes: isSldDraft
        ? "Draft relation promoted from SLD endpoint candidate; bay, IED, CT/PT, and line data still need validation."
        : "Dynamically generated from network graph registry records.",
    };
  });
}

export function relayAssetsFromGraph(network: UnifiedNetwork): RelayAsset[] {
  return network.relayIeds.flatMap((ied) => {
    const bay = network.bays.find((b) => b.id === ied.bayId);
    if (!bay) return [];
    return {
      id: ied.id,
      nodeId: bay.substationId,
      bay: bay.rawName,
      circuit: bay.circuit ? `#${bay.circuit}` : "",
      make: ied.make,
      model: ied.model,
      serial: ied.serial,
      functionGroup: ied.functionGroup,
      ctRatio: ied.ctRatio,
      vtRatio: ied.vtRatio,
      tapDocument: "",
      actualSource: "",
      confidence: ied.confidence,
    };
  });
}

export function mergeMasterRelationsIntoCase(
  caseNetwork: UnifiedNetwork | undefined,
  masterNetwork: UnifiedNetwork | undefined
): UnifiedNetwork | undefined {
  if (!caseNetwork || !masterNetwork || caseNetwork.caseId === masterNetwork.caseId) {
    return caseNetwork;
  }

  const nextBays = [...caseNetwork.bays];
  const nextRelations = [...caseNetwork.lineRelations];
  const existingEndpointKeys = new Set(nextRelations.map((relation) => relationEndpointKey(caseNetwork, relation)));

  for (const masterRelation of masterNetwork.lineRelations) {
    const masterFrom = masterNetwork.substations.find((s) => s.id === masterRelation.fromSubstationId);
    const masterTo = masterNetwork.substations.find((s) => s.id === masterRelation.toSubstationId);
    if (!masterFrom || !masterTo) continue;

    const caseFrom = findCaseSubstation(caseNetwork, masterFrom.name);
    const caseTo = findCaseSubstation(caseNetwork, masterTo.name);
    if (!caseFrom || !caseTo) continue;

    const candidateKey = normalizedEndpointKey(
      caseFrom.normalizedName,
      caseTo.normalizedName,
      masterRelation.circuit
    );
    if (existingEndpointKeys.has(candidateKey)) continue;

    const masterFromBay = masterNetwork.bays.find((b) => b.id === masterRelation.fromBayId);
    const masterToBay = masterNetwork.bays.find((b) => b.id === masterRelation.toBayId);
    const fromBay: Bay = {
      ...(masterFromBay ?? fallbackBay(caseFrom, caseTo, masterRelation.circuit)),
      id: `bay_master_${caseNetwork.caseId}_${masterRelation.id}_from`,
      substationId: caseFrom.id,
    };
    const toBay: Bay = {
      ...(masterToBay ?? fallbackBay(caseTo, caseFrom, masterRelation.circuit)),
      id: `bay_master_${caseNetwork.caseId}_${masterRelation.id}_to`,
      substationId: caseTo.id,
    };
    const relation: LineRelation = {
      ...masterRelation,
      id: `master_${caseNetwork.caseId}_${masterRelation.id}`,
      fromBayId: fromBay.id,
      toBayId: toBay.id,
      fromSubstationId: caseFrom.id,
      toSubstationId: caseTo.id,
      sourceIds: Array.from(new Set(["master-inventory", ...masterRelation.sourceIds])),
    };

    nextBays.push(fromBay, toBay);
    nextRelations.push(relation);
    existingEndpointKeys.add(candidateKey);
  }

  return {
    ...caseNetwork,
    bays: nextBays,
    lineRelations: nextRelations,
  };
}

function relationEndpointKey(network: UnifiedNetwork, relation: LineRelation) {
  const from = network.substations.find((s) => s.id === relation.fromSubstationId);
  const to = network.substations.find((s) => s.id === relation.toSubstationId);
  return normalizedEndpointKey(
    from?.normalizedName ?? relation.fromSubstationId,
    to?.normalizedName ?? relation.toSubstationId,
    relation.circuit
  );
}

function normalizedEndpointKey(from: string, to: string, circuit: string) {
  return [[from, to].sort().join("__"), circuit || "1"].join("__ckt_");
}

function findCaseSubstation(network: UnifiedNetwork, rawName: string) {
  const identity = normalizeSubstationIdentity(rawName);
  return network.substations.find((sub) => normalizeSubstationIdentity(sub.name) === identity);
}

function fallbackBay(from: UnifiedSubstation, to: UnifiedSubstation, circuit: string): Bay {
  return {
    id: `bay_fallback_${from.id}_${to.id}_${circuit || "1"}`,
    substationId: from.id,
    rawName: `PHT ${from.voltageKv}kV ${to.name.toUpperCase()}#${circuit || "1"}`,
    normalizedName: to.normalizedName,
    remoteEndpointHint: to.normalizedName,
    circuit: circuit || "1",
    kind: "line",
  };
}

export const NETWORK_GRAPH_NODES: NetworkNode[] = networkNodesFromGraph(NETWORK_GRAPH_DKS_PIK);

export const NETWORK_GRAPH_LINES: NetworkLine[] = networkLinesFromGraph(NETWORK_GRAPH_DKS_PIK);

export const NETWORK_GRAPH_RELAY_ASSETS: RelayAsset[] = relayAssetsFromGraph(NETWORK_GRAPH_DKS_PIK);
