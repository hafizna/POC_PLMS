// PLMS → NMM bridge export.
//
// Generates structured JSON that the NMM project (`pln_nmm_coba`) consumes
// to fill CGMES placeholder data. Spec: docs/08_PLMS_CGMES_BRIDGE.md in the
// NMM project.
//
// Each exported field carries a confidence flag per doc 08 guidance:
//   - high: ready to auto-fill into CIM target
//   - medium: candidate; needs engineering review
//   - low: inferred draft only; don't auto-fill without explicit review
//
// Source attribution preserved so NMM can show provenance per field.

import type {
  Bay,
  Busbar,
  LifecycleStatus,
  LineRelation,
  ProtectionFunctionId,
  RelayIED,
  UnifiedNetwork,
  UnifiedSubstation,
} from "./unified";
import type {
  CandidateDecision,
  PdfTapPromotion,
} from "../store/useProsetStore";
import { LCD_DIST_REGISTRY, mapLcdDistCandidatesToLines } from "./lcd-dist-import";
import { OCR_REGISTRY, mapOcrCandidatesToLines } from "./ocr-import";
import { networkLinesFromGraph, networkNodesFromGraph } from "./network-graph";

export type BridgeConfidence = "high" | "medium" | "low";

export type BridgeSourceProvenance = {
  sourceId: string;       // e.g. "lcd-dist-row-33", "pdf-tap-promotion-abc"
  sourceKind:
    | "network-graph-seed"
    | "lcd-dist-import"
    | "ocr-gfr-import"
    | "pdf-tap-promotion"
    | "user-added"
    | "registry-source";
  fileName?: string;
  rowNumber?: number;
  note?: string;
};

export type BridgeSubstation = {
  id: string;
  name: string;
  shortCode: string;
  voltageKv: number;
  kind: "GI" | "GIS" | "GISTET";
  // CGMES target hints
  cimSubstationName: string;
  cimVoltageLevelName: string;
  baseVoltageNominalKv: number;
  // Provenance
  confidence: BridgeConfidence;
  sourceIds: string[];
};

export type BridgeBusbar = {
  id: string;
  substationId: string;
  label: string;
  voltageKv: number;
  kind: "main" | "transfer" | "reserve" | "single" | "tie";
  // CGMES target: cim:BusbarSection
  cimBusbarSectionName: string;
  confidence: BridgeConfidence;       // currently always "medium" — see doc 08
  sourceIds: string[];
};

export type BridgeBay = {
  id: string;
  substationId: string;
  rawName: string;
  remoteEndpointHint: string;
  circuit: string;
  // CGMES target: cim:Bay (when used)
  cimBayName: string;
  // nhftui:info sirkit hint
  sirkitInfo: string | null;
  confidence: BridgeConfidence;
  sourceIds: string[];
};

export type BridgeTerminal = {
  id: string;
  bayId: string;
  busbarId: string;
  position: "line-side" | "bus-side";
  // CGMES target: cim:Terminal + cim:ConnectivityNode pair
  cimTerminalName: string;
  cimConnectivityNodeName: string;
  confidence: BridgeConfidence;
};

export type BridgeLineRelation = {
  id: string;
  fromSubstationId: string;
  toSubstationId: string;
  fromBayId: string;
  toBayId: string;
  circuit: string;
  voltageKv: number;
  // Physical line params (medium confidence per doc 08; some PLMS values are
  // reach/setting values, not necessarily physical line reactance)
  lineXOhm?: number;
  lineXOhmConfidence: BridgeConfidence;
  physicalLengthKm?: number;
  physicalLengthKmConfidence: BridgeConfidence;
  conductorType?: string;
  // CGMES target: cim:ACLineSegment with 2 cim:Terminal, 2 cim:ConnectivityNode
  cimAcLineSegmentName: string;
  protectionFunctionIds: ProtectionFunctionId[];
  sourceIds: string[];
};

export type BridgeRelayIED = {
  id: string;
  bayId: string;
  make: string;
  model: string;
  serial?: string;
  ctRatio?: string;
  vtRatio?: string;
  functionGroup: string;
  // CGMES target: non-standard extension; NMM bridge metadata
  tapDocument?: string;
  actualSource?: string;
  confidence: BridgeConfidence;
  sourceIds: string[];
};

export type BridgeProtectionSetting = {
  id: string;
  lineRelationId: string;
  relayIedId?: string;
  function: ProtectionFunctionId;
  values: Record<string, number | string | null>;
  source: "lcd-dist-import" | "ocr-gfr-import" | "pdf-tap-promotion" | "network-graph-seed";
  sourceRef: string;
  status: LifecycleStatus;
  decidedAt?: string;
  confidence: BridgeConfidence;
};

export type BridgeExport = {
  meta: {
    generatedAt: string;
    schemaVersion: string;
    plmsCaseId: string;
    plmsCaseTitle: string;
    sourceArtifactCounts: {
      substations: number;
      busbars: number;
      bays: number;
      terminals: number;
      lineRelations: number;
      relayIeds: number;
      protectionSettings: number;
      lcdDistRecords: number;
      ocrRecords: number;
      pdfTapPromotions: number;
    };
    confidenceMix: Record<BridgeConfidence, number>;
    notes: string[];
  };
  substations: BridgeSubstation[];
  busbars: BridgeBusbar[];
  bays: BridgeBay[];
  terminals: BridgeTerminal[];
  lineRelations: BridgeLineRelation[];
  relays: BridgeRelayIED[];
  protectionSettings: BridgeProtectionSetting[];
  sources: BridgeSourceProvenance[];
};

// =============================================================================
// Builder
// =============================================================================

export type BuildBridgeExportArgs = {
  caseId: string;
  caseTitle: string;
  networkGraph: UnifiedNetwork;
  decisions: Record<string, CandidateDecision>;
  pdfTapPromotions: PdfTapPromotion[];
};

const SCHEMA_VERSION = "0.1.0";

export function buildBridgeExport(args: BuildBridgeExportArgs): BridgeExport {
  const { caseId, caseTitle, networkGraph, decisions, pdfTapPromotions } = args;

  // Use derived NetworkNode/NetworkLine shape for cross-referencing
  // candidates back to their LineRelations.
  const networkNodes = networkNodesFromGraph(networkGraph);
  const networkLines = networkLinesFromGraph(networkGraph);

  // Filter case-scoped promotions
  const casePromotions = pdfTapPromotions.filter((p) => p.caseId === caseId);

  // Pre-compute candidate maps for source attribution
  const lcdCandidates = mapLcdDistCandidatesToLines(
    LCD_DIST_REGISTRY.records,
    networkNodes,
    networkLines
  );
  const ocrCandidates = mapOcrCandidatesToLines(
    OCR_REGISTRY.records,
    networkNodes,
    networkLines
  );

  // ── Substations ──────────────────────────────────────────────
  const substations: BridgeSubstation[] = networkGraph.substations.map((sub) =>
    convertSubstation(sub)
  );

  // ── Busbars ──────────────────────────────────────────────────
  const busbars: BridgeBusbar[] = networkGraph.busbars.map((bus) =>
    convertBusbar(bus, networkGraph)
  );

  // ── Bays ─────────────────────────────────────────────────────
  const bays: BridgeBay[] = networkGraph.bays.map((bay) => convertBay(bay, networkGraph));

  // ── Terminals ────────────────────────────────────────────────
  const terminals: BridgeTerminal[] = networkGraph.terminals.map((term) =>
    convertTerminal(term, networkGraph)
  );

  // ── Line relations ───────────────────────────────────────────
  const lineRelations: BridgeLineRelation[] = networkGraph.lineRelations.map(
    (rel) => convertLineRelation(rel, networkGraph)
  );

  // ── Relays ───────────────────────────────────────────────────
  const relays: BridgeRelayIED[] = networkGraph.relayIeds.map((ied) =>
    convertRelay(ied, networkGraph)
  );

  // ── Protection settings ──────────────────────────────────────
  const protectionSettings: BridgeProtectionSetting[] = [];

  // LCD+DIST candidates → DIST + LCD function promotions per line
  for (const cand of lcdCandidates) {
    if (!cand.matchedLineId) continue;
    const decision = decisions[`lcd:${cand.recordId}`];
    if (!decision || decision.status === "imported") continue; // require user action
    const targetLineId = decision.overrideLineId ?? cand.matchedLineId;
    const status = decision.status;
    const values = {
      lineImpedanceOhm: cand.lineImpedanceOhm,
      z1: cand.z1PhPh,
      z2: cand.z2PhPh,
      z3: cand.z3PhPh,
      tapDocument: cand.tapDocument,
    };
    const sourceRef = `LCD+DIST row ${cand.sourceRow}`;
    for (const fn of ["DIST", "LCD"] as const) {
      protectionSettings.push({
        id: `${cand.recordId}_${fn}`,
        lineRelationId: targetLineId,
        function: fn,
        values,
        source: "lcd-dist-import",
        sourceRef,
        status,
        decidedAt: decision.decidedAt,
        confidence: status === "approved" || status === "issued" ? "high" : "medium",
      });
    }
  }

  // OCR/GFR candidates → OCR + GFR function promotions
  for (const cand of ocrCandidates) {
    if (!cand.matchedLineId) continue;
    const decision = decisions[`ocr:${cand.recordId}`];
    if (!decision || decision.status === "imported") continue;
    const targetLineId = decision.overrideLineId ?? cand.matchedLineId;
    const status = decision.status;
    const ocrRecord = OCR_REGISTRY.records.find((r) => r.id === cand.recordId);
    const values: Record<string, number | string | null> = ocrRecord
      ? {
          ocPickupA: ocrRecord.tap.ocPickupA,
          ocTms: ocrRecord.tap.ocTms,
          ocCurve: ocrRecord.tap.ocCurve,
          gfPickupA: ocrRecord.tap.gfPickupA,
          gfTms: ocrRecord.tap.gfTms,
          gfCurve: ocrRecord.tap.gfCurve,
          tapDocument: ocrRecord.tap.document,
        }
      : {};
    const sourceRef = ocrRecord ? `OCR row ${ocrRecord.sourceRow}` : "OCR import";
    for (const fn of ["OCR", "GFR"] as const) {
      protectionSettings.push({
        id: `${cand.recordId}_${fn}`,
        lineRelationId: targetLineId,
        function: fn,
        values,
        source: "ocr-gfr-import",
        sourceRef,
        status,
        decidedAt: decision.decidedAt,
        confidence: status === "approved" || status === "issued" ? "high" : "medium",
      });
    }
  }

  // PDF TAP promotions → multi-function (classifier already applied earlier)
  for (const promotion of casePromotions) {
    const grouped: Record<string, typeof promotion.fields> = {};
    for (const f of promotion.fields) {
      const fn = classifyForBridge(f.field);
      if (!fn) continue;
      if (!grouped[fn]) grouped[fn] = [];
      grouped[fn].push(f);
    }
    for (const [fn, fields] of Object.entries(grouped)) {
      const values: Record<string, number | string | null> = {};
      for (const f of fields) {
        values[f.field] = f.unit ? `${f.value} ${f.unit}` : f.value;
      }
      protectionSettings.push({
        id: `${promotion.id}_${fn}`,
        lineRelationId: promotion.lineId,
        function: fn as ProtectionFunctionId,
        values,
        source: "pdf-tap-promotion",
        sourceRef: promotion.fileName,
        status: promotion.status,
        decidedAt: promotion.promotedAt,
        confidence: promotion.status === "approved" || promotion.status === "issued" ? "high" : "medium",
      });
    }
  }

  // ── Source provenance ────────────────────────────────────────
  const sources: BridgeSourceProvenance[] = [];
  for (const cand of lcdCandidates) {
    if (cand.matchedLineId) {
      sources.push({
        sourceId: `lcd:${cand.recordId}`,
        sourceKind: "lcd-dist-import",
        rowNumber: cand.sourceRow,
        note: `Matched line: ${cand.matchedLineId}`,
      });
    }
  }
  for (const cand of ocrCandidates) {
    if (cand.matchedLineId) {
      const rec = OCR_REGISTRY.records.find((r) => r.id === cand.recordId);
      sources.push({
        sourceId: `ocr:${cand.recordId}`,
        sourceKind: "ocr-gfr-import",
        rowNumber: rec?.sourceRow,
        note: `Matched line: ${cand.matchedLineId}`,
      });
    }
  }
  for (const promotion of casePromotions) {
    sources.push({
      sourceId: promotion.id,
      sourceKind: "pdf-tap-promotion",
      fileName: promotion.fileName,
      note: `Promoted to line: ${promotion.lineId}`,
    });
  }

  // ── Confidence mix tally ─────────────────────────────────────
  const confidenceMix: Record<BridgeConfidence, number> = { high: 0, medium: 0, low: 0 };
  for (const item of substations) confidenceMix[item.confidence]++;
  for (const item of bays) confidenceMix[item.confidence]++;
  for (const item of busbars) confidenceMix[item.confidence]++;
  for (const item of terminals) confidenceMix[item.confidence]++;
  for (const item of relays) confidenceMix[item.confidence]++;
  for (const item of lineRelations) {
    confidenceMix[item.lineXOhmConfidence]++;
  }
  for (const item of protectionSettings) confidenceMix[item.confidence]++;

  // ── Notes (what NMM should be aware of) ──────────────────────
  const notes: string[] = [];
  if (busbars.length > 0) {
    notes.push(
      "Busbar entries are PLMS draft (Bus A/B per substation). Validate against SLD before treating as approved asset registry."
    );
  }
  const linesWithoutLength = lineRelations.filter((r) => !r.physicalLengthKm).length;
  if (linesWithoutLength > 0) {
    notes.push(
      `${linesWithoutLength} line relation(s) missing physical length. NMM should treat lineXOhm as reach value, not necessarily physical reactance.`
    );
  }
  notes.push(
    "Switching state (open/closed) and switchgear topology are not represented. Use SLD/VSD for switchgear details."
  );
  notes.push(
    "Diagram coordinates (plnicp:DiagramProperty.x/y) are NOT included. PLMS does not have reliable coordinates yet."
  );

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      schemaVersion: SCHEMA_VERSION,
      plmsCaseId: caseId,
      plmsCaseTitle: caseTitle,
      sourceArtifactCounts: {
        substations: substations.length,
        busbars: busbars.length,
        bays: bays.length,
        terminals: terminals.length,
        lineRelations: lineRelations.length,
        relayIeds: relays.length,
        protectionSettings: protectionSettings.length,
        lcdDistRecords: lcdCandidates.filter((c) => c.matchedLineId).length,
        ocrRecords: ocrCandidates.filter((c) => c.matchedLineId).length,
        pdfTapPromotions: casePromotions.length,
      },
      confidenceMix,
      notes,
    },
    substations,
    busbars,
    bays,
    terminals,
    lineRelations,
    relays,
    protectionSettings,
    sources,
  };
}

// =============================================================================
// Per-entity converters
// =============================================================================

function convertSubstation(sub: UnifiedSubstation): BridgeSubstation {
  return {
    id: sub.id,
    name: sub.name,
    shortCode: sub.shortCode,
    voltageKv: sub.voltageKv,
    kind: sub.kind,
    cimSubstationName: sub.name,
    cimVoltageLevelName: `${sub.name} ${sub.voltageKv}kV`,
    baseVoltageNominalKv: sub.voltageKv,
    confidence: "high", // per doc 08: substation name/voltage/kind already normalized
    sourceIds: [`network-graph-substation-${sub.id}`],
  };
}

function convertBusbar(bus: Busbar, networkGraph: UnifiedNetwork): BridgeBusbar {
  const sub = networkGraph.substations.find((s) => s.id === bus.substationId);
  const subName = sub?.shortCode ?? bus.substationId;
  return {
    id: bus.id,
    substationId: bus.substationId,
    label: bus.label,
    voltageKv: bus.voltageKv,
    kind: bus.kind,
    cimBusbarSectionName: `${subName} ${bus.label}`,
    confidence: "medium", // doc 08: PLMS can create draft busbars but exact section needs SLD review
    sourceIds: [`network-graph-busbar-${bus.id}`],
  };
}

function convertBay(bay: Bay, networkGraph: UnifiedNetwork): BridgeBay {
  const sub = networkGraph.substations.find((s) => s.id === bay.substationId);
  const subName = sub?.shortCode ?? bay.substationId;
  const sirkit = bay.circuit ? `Sirkit ${bay.circuit}` : null;
  return {
    id: bay.id,
    substationId: bay.substationId,
    rawName: bay.rawName,
    remoteEndpointHint: bay.remoteEndpointHint,
    circuit: bay.circuit,
    cimBayName: `${subName} ${bay.rawName}`,
    sirkitInfo: sirkit,
    confidence: "medium", // bay names good but bay container hierarchy may need SLD/VSD confirmation
    sourceIds: [`network-graph-bay-${bay.id}`],
  };
}

function convertTerminal(
  term: { id: string; bayId: string; busbarId: string; position: "line-side" | "bus-side" },
  networkGraph: UnifiedNetwork
): BridgeTerminal {
  const bay = networkGraph.bays.find((b) => b.id === term.bayId);
  const bus = networkGraph.busbars.find((b) => b.id === term.busbarId);
  return {
    id: term.id,
    bayId: term.bayId,
    busbarId: term.busbarId,
    position: term.position,
    cimTerminalName: `${bay?.rawName ?? term.bayId} ${term.position}`,
    cimConnectivityNodeName: `cn_${bay?.rawName ?? term.bayId}_${term.position}`,
    confidence: "medium",
  };
}

function convertLineRelation(
  rel: LineRelation,
  networkGraph: UnifiedNetwork
): BridgeLineRelation {
  const fromSub = networkGraph.substations.find((s) => s.id === rel.fromSubstationId);
  const toSub = networkGraph.substations.find((s) => s.id === rel.toSubstationId);
  const label = `${fromSub?.shortCode ?? rel.fromSubstationId}-${toSub?.shortCode ?? rel.toSubstationId} #${rel.circuit}`;
  // lineXOhm is medium confidence per doc 08 (could be reach value, not physical X)
  const xConfidence: BridgeConfidence = rel.physicalLengthKm ? "high" : "medium";
  const lengthConfidence: BridgeConfidence = rel.physicalLengthKm ? "high" : "low";
  return {
    id: rel.id,
    fromSubstationId: rel.fromSubstationId,
    toSubstationId: rel.toSubstationId,
    fromBayId: rel.fromBayId,
    toBayId: rel.toBayId,
    circuit: rel.circuit,
    voltageKv: rel.voltageKv,
    lineXOhm: rel.lineXOhm,
    lineXOhmConfidence: xConfidence,
    physicalLengthKm: rel.physicalLengthKm,
    physicalLengthKmConfidence: lengthConfidence,
    cimAcLineSegmentName: label,
    protectionFunctionIds: rel.protectionFunctionIds,
    sourceIds: rel.sourceIds,
  };
}

function convertRelay(ied: RelayIED, networkGraph: UnifiedNetwork): BridgeRelayIED {
  const bay = networkGraph.bays.find((b) => b.id === ied.bayId);
  return {
    id: ied.id,
    bayId: ied.bayId,
    make: ied.make,
    model: ied.model,
    serial: ied.serial,
    ctRatio: ied.ctRatio,
    vtRatio: ied.vtRatio,
    functionGroup: ied.functionGroup,
    confidence: ied.confidence === "high" ? "high" : ied.confidence === "medium" ? "medium" : "low",
    sourceIds: [`network-graph-ied-${ied.id}`, bay ? `bay-${bay.id}` : ""].filter(Boolean),
  };
}

// =============================================================================
// Field classifier (mirror of lib/ocr.ts but kept here to avoid pulling OCR
// runtime into domain layer; same regex semantics)
// =============================================================================

function classifyForBridge(fieldName: string): ProtectionFunctionId | null {
  const f = fieldName.toLowerCase();
  if (/(z1|z2|z3|line\s*impedance|tz\d|t[123]\s*delay)/i.test(f)) return "DIST";
  if (/(ie\s*>|^gf|ground.?fault)/i.test(f)) return "GFR";
  if (/(i\s*>|^oc\b|tms|curve)/i.test(f)) return "OCR";
  if (/(autoreclose|^ar\b|reclose)/i.test(f)) return "AR";
  if (/(sync|synchro)/i.test(f)) return "SYNC";
  if (/(line\s*diff|differential|^lcd\b)/i.test(f)) return "LCD";
  return null;
}
