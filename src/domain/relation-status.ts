// Aggregate the lifecycle status of a LineRelation across the multiple
// sources that feed it (network graph hand-curated seed, LCD+DIST imports,
// OCR/GFR imports, .set parser later). Each source carries its own
// status and the user can promote them via the Inbox.

import type { LifecycleStatus, ProtectionFunctionId } from "./unified";
import type { NetworkLine, NetworkNode } from "./seed-network-registry";

// Decoupled shape of the store's candidateDecisions slice (avoids importing
// the store from this domain module).
export type CandidateDecisionLike = {
  status: LifecycleStatus;
  decidedAt?: string;
  note?: string;
  overrideLineId?: string;
};
import {
  LCD_DIST_REGISTRY,
  mapLcdDistCandidatesToLines,
} from "./lcd-dist-import";
import { OCR_REGISTRY, mapOcrCandidatesToLines } from "./ocr-import";

export type SourceKey = "seed" | "lcd-dist" | "ocr-gfr" | "pdf-tap" | "calculation";

export type PdfTapPromotionLike = {
  id: string;
  caseId: string;
  lineId: string;
  fileName: string;
  status: LifecycleStatus;
  promotedAt?: string;
  fields: Array<{ field: string; value: string; unit?: string }>;
  note?: string;
};

export type CalculationSnapshotLike = {
  id: string;
  caseId: string;
  lineId: string;
  templateId: string;
  templateName: string;
  functionIds: ProtectionFunctionId[];
  status: LifecycleStatus;
  createdAt?: string;
  sourceRef: string;
  outputValues: Record<string, number | string | null>;
  warnings: string[];
};

export type SourceStatusEntry = {
  source: SourceKey;
  status: LifecycleStatus;
  candidateId?: string;
  note?: string;
};

export type FunctionPromotion = {
  function: ProtectionFunctionId;
  status: LifecycleStatus;
  source: SourceKey;
  sourceRef: string;        // e.g. "LCD+DIST row 23"
  candidateId: string;
  values: Record<string, number | string | null>;
  decidedAt?: string;
};

export type RelationStatus = {
  lineId: string;
  perSource: SourceStatusEntry[];
  rollup: LifecycleStatus;
  // Per-protection-function setting promotions: which function on this
  // relation has an import-backed setting at which lifecycle status.
  // Driven by user's Inbox decisions on candidates.
  functionPromotions: FunctionPromotion[];
};

// Mirror of classifyExtractedField from lib/ocr.ts but kept here to avoid
// pulling the OCR runtime into the domain layer.
function classifyForRelationStatus(fieldName: string): ProtectionFunctionId | null {
  const f = fieldName.toLowerCase();
  if (/(z1|z2|z3|line\s*impedance|tz\d|t[123]\s*delay)/i.test(f)) return "DIST";
  if (/(ie\s*>|^gf|ground.?fault)/i.test(f)) return "GFR";
  if (/(i\s*>|^oc\b|tms|curve)/i.test(f)) return "OCR";
  if (/(autoreclose|^ar\b|reclose)/i.test(f)) return "AR";
  if (/(sync|synchro)/i.test(f)) return "SYNC";
  if (/(line\s*diff|differential|^lcd\b)/i.test(f)) return "LCD";
  return null;
}

function rollupStatus(values: LifecycleStatus[]): LifecycleStatus {
  if (values.length === 0) return "imported";
  if (values.includes("rejected")) return "rejected";
  if (values.includes("imported")) return "imported";
  if (values.includes("reviewed")) return "reviewed";
  if (values.every((value) => value === "issued")) return "issued";
  return "approved";
}

// Build a per-line status object from all data sources visible for a case.
// Network Graph seeded relations contribute the "seed" source. Each matched
// LCD+DIST or OCR candidate contributes a per-source row; the user's
// inbox decision overrides the default `imported`.
export function buildRelationStatuses(
  nodes: NetworkNode[],
  lines: NetworkLine[],
  decisions: Record<string, CandidateDecisionLike>,
  pdfTapPromotions: PdfTapPromotionLike[] = [],
  calculationSnapshots: CalculationSnapshotLike[] = []
): Map<string, RelationStatus> {
  const lcd = mapLcdDistCandidatesToLines(LCD_DIST_REGISTRY.records, nodes, lines);
  const ocr = mapOcrCandidatesToLines(OCR_REGISTRY.records, nodes, lines);
  const map = new Map<string, RelationStatus>();

  for (const line of lines) {
    const seedStatus = line.lifecycleStatus ?? "approved";
    map.set(line.id, {
      lineId: line.id,
      perSource: [{ source: "seed", status: seedStatus }],
      rollup: seedStatus,
      functionPromotions: [],
    });
  }

  for (const c of lcd) {
    const candidateId = `lcd:${c.recordId}`;
    const decision = decisions[candidateId];
    // Manual mapping override beats auto-matcher result so engineers can
    // resolve ambiguous/needs_validation rows from the Inbox.
    const effectiveLineId = decision?.overrideLineId ?? c.matchedLineId;
    if (!effectiveLineId) continue;
    const entry = map.get(effectiveLineId);
    if (!entry) continue;
    const status = decision?.status ?? c.lifecycleStatus;
    entry.perSource.push({
      source: "lcd-dist",
      status,
      candidateId,
      note: decision?.note,
    });
    const promotedValues: Record<string, number | string | null> = {
      lineImpedanceOhm: c.lineImpedanceOhm,
      z1: c.z1PhPh,
      z2: c.z2PhPh,
      z3: c.z3PhPh,
      tapDocument: c.tapDocument,
    };
    const sourceRef = `LCD+DIST row ${c.sourceRow}`;
    // LCD+DIST drives both DIST and LCD function settings on the relation.
    for (const fn of ["DIST", "LCD"] as const) {
      entry.functionPromotions.push({
        function: fn,
        status,
        source: "lcd-dist",
        sourceRef,
        candidateId,
        values: promotedValues,
        decidedAt: decision?.decidedAt,
      });
    }
  }

  for (const c of ocr) {
    const candidateId = `ocr:${c.recordId}`;
    const decision = decisions[candidateId];
    const effectiveLineId = decision?.overrideLineId ?? c.matchedLineId;
    if (!effectiveLineId) continue;
    const entry = map.get(effectiveLineId);
    if (!entry) continue;
    const status = decision?.status ?? c.lifecycleStatus;
    entry.perSource.push({
      source: "ocr-gfr",
      status,
      candidateId,
      note: decision?.note,
    });
    const ocrRecord = OCR_REGISTRY.records.find((r) => r.id === c.recordId);
    const promotedValues: Record<string, number | string | null> = ocrRecord
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
      entry.functionPromotions.push({
        function: fn,
        status,
        source: "ocr-gfr",
        sourceRef,
        candidateId,
        values: promotedValues,
        decidedAt: decision?.decidedAt,
      });
    }
  }

  // PDF TAP promotions: each promotion targets one specific lineId (engineer
  // picked at promote time, no fuzzy matching). Fields are bucketed by
  // protection function via classifyExtractedField semantics.
  for (const promotion of pdfTapPromotions) {
    const entry = map.get(promotion.lineId);
    if (!entry) continue;
    entry.perSource.push({
      source: "pdf-tap",
      status: promotion.status,
      candidateId: promotion.id,
      note: promotion.note ?? `Promoted from ${promotion.fileName}`,
    });
    // Group fields by classified function; one FunctionPromotion per function
    // even if multiple fields belong to it (values consolidated).
    const byFunction: Record<string, Array<{ field: string; value: string; unit?: string }>> = {};
    for (const f of promotion.fields) {
      const fn = classifyForRelationStatus(f.field);
      if (!fn) continue;
      if (!byFunction[fn]) byFunction[fn] = [];
      byFunction[fn].push(f);
    }
    for (const [fn, fields] of Object.entries(byFunction)) {
      const values: Record<string, number | string | null> = {};
      for (const f of fields) {
        values[f.field] = f.value + (f.unit ? ` ${f.unit}` : "");
      }
      entry.functionPromotions.push({
        function: fn as ProtectionFunctionId,
        status: promotion.status,
        source: "pdf-tap",
        sourceRef: promotion.fileName,
        candidateId: promotion.id,
        values,
        decidedAt: promotion.promotedAt,
      });
    }
  }

  // Calculation snapshots are engineer-generated workbook outputs. They
  // become draft TAP/setting-register evidence on the target LineRelation,
  // separate from official TAP PDF imports and field actual-setting checks.
  for (const snapshot of calculationSnapshots) {
    const entry = map.get(snapshot.lineId);
    if (!entry) continue;
    entry.perSource.push({
      source: "calculation",
      status: snapshot.status,
      candidateId: snapshot.id,
      note: `${snapshot.templateName} | ${snapshot.warnings.length} warning(s)`,
    });
    for (const fn of snapshot.functionIds) {
      entry.functionPromotions.push({
        function: fn,
        status: snapshot.status,
        source: "calculation",
        sourceRef: snapshot.sourceRef,
        candidateId: snapshot.id,
        values: snapshot.outputValues,
        decidedAt: snapshot.createdAt,
      });
    }
  }

  for (const entry of map.values()) {
    entry.rollup = rollupStatus(entry.perSource.map((s) => s.status));
  }
  return map;
}
