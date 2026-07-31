// Bulk cross-validation of distance-protection Z1/Z2/Z3 reach + timer values
// across every LCD/DIST record in one UPT, without requiring per-bay manual
// review first (the current Setting Case flow forces one Working Network
// confirmation per GI before any calculation/crosscheck can proceed, which
// blocks even simple "is our data internally consistent" questions).
//
// Each LCD/DIST record already carries three independent value sources for
// the same relay (see lcd-dist-registry.json / LcdDistRecord):
//   - distance: engineering reference value (recalculated from line data)
//   - tap: value on the approved/issued TAP document
//   - actual: value read back from the installed relay
// This module compares all three pairwise per zone/timer, using the same
// tolerance bands already used for interactive per-bay verification
// (setting-verification.ts's "engineering" profile: ±1% or ±0.01 ohm for
// zone reach, ±0.01s for timers) — so the bulk audit and the interactive
// crosscheck agree on what counts as a real discrepancy.
//
// This does NOT replace engineering review — it only tells you WHERE the
// three sources already disagree, so review effort goes to the bays that
// actually need it instead of every bay in the UPT uniformly.

import { LCD_DIST_REGISTRY, type LcdDistRecord } from "./lcd-dist-import";

export type ZoneAuditMetricId = "z1" | "z2" | "z3" | "t1" | "t2" | "t3";

const ZONE_METRICS: Array<{ id: ZoneAuditMetricId; label: string; unit: string; field: "z1PhPh" | "z2PhPh" | "z3PhPh" | "t1S" | "t2S" | "t3S" }> = [
  { id: "z1", label: "Z1 reach", unit: "ohm", field: "z1PhPh" },
  { id: "z2", label: "Z2 reach", unit: "ohm", field: "z2PhPh" },
  { id: "z3", label: "Z3 reach", unit: "ohm", field: "z3PhPh" },
  { id: "t1", label: "t1 delay", unit: "s", field: "t1S" },
  { id: "t2", label: "t2 delay", unit: "s", field: "t2S" },
  { id: "t3", label: "t3 delay", unit: "s", field: "t3S" },
];

function toleranceFor(metricId: ZoneAuditMetricId): { absolute: number; relativePercent: number } {
  if (metricId.startsWith("t")) return { absolute: 0.01, relativePercent: 0 };
  return { absolute: 0.01, relativePercent: 1 };
}

export type ZoneAuditPairKind = "distance_vs_tap" | "tap_vs_actual" | "distance_vs_actual";

export type ZoneAuditStatus = "match" | "within-tolerance" | "mismatch" | "missing";

export type ZoneAuditFinding = {
  recordId: string;
  ultg: string;
  substation: string;
  bay: string;
  circuit: string;
  relayMake: string;
  relayModel: string;
  metricId: ZoneAuditMetricId;
  metricLabel: string;
  unit: string;
  pairKind: ZoneAuditPairKind;
  leftValue: number | null;
  rightValue: number | null;
  delta: number | null;
  deltaPercent: number | null;
  status: ZoneAuditStatus;
};

function compareValues(
  left: number | null,
  right: number | null,
  leftSourceEmpty: boolean,
  rightSourceEmpty: boolean,
  metricId: ZoneAuditMetricId
): { delta: number | null; deltaPercent: number | null; status: ZoneAuditStatus } {
  if (left === null || right === null || leftSourceEmpty || rightSourceEmpty) {
    return { delta: null, deltaPercent: null, status: "missing" };
  }
  const delta = right - left;
  const deltaPercent = Math.abs(left) > 1e-12 ? (delta / left) * 100 : null;
  if (Math.abs(delta) <= 1e-9) return { delta, deltaPercent, status: "match" };
  const tol = toleranceFor(metricId);
  const allowed = Math.max(tol.absolute, Math.abs(left) * (tol.relativePercent / 100));
  return {
    delta,
    deltaPercent,
    status: Math.abs(delta) <= allowed ? "within-tolerance" : "mismatch",
  };
}

type ZoneValueSource = LcdDistRecord["distance"] | LcdDistRecord["tap"] | LcdDistRecord["actual"];
type ZoneSourceKind = "distance" | "tap" | "actual";

// A source's Z1 reach of exactly 0 ohm is not a physically meaningful
// distance setting on its own (it would mean instantaneous trip for a
// zero-impedance fault at the relay terminals) — empirically, whenever
// z1PhPh is 0 for a source, every other field on that same source (Z2, Z3,
// t2, t3) is 0 too: the whole side was never entered, not just one field.
// So emptiness is judged once per source (via z1PhPh), and applied to ALL
// six metrics for that source — checking each metric independently would
// wrongly call a genuinely-empty source's t1S=0 a "match" against a real
// t1S=0 on the other side (a coincidence, not agreement), and wrongly flag
// its t2S=0/t3S=0 as "mismatch" against the other side's real timer values.
function isSourceEmpty(source: ZoneValueSource): boolean {
  return source.z1PhPh === 0 || source.z1PhPh === null;
}

// The same physical bay/circuit can be split across two LcdDistRecord rows
// (see buildDistanceCapabilityIndex's comment) with the real reading landing
// on only one of them — e.g. Angke's own row has actual.z1PhPh=0 while
// Muarakarang Lama's row for the identical UGC circuit has actual.z1PhPh=2.5.
// Comparing a record against only ITS OWN source would report that real
// reading as "missing" for the row that happens not to carry it. Instead,
// for a given group (paired by tap.document), the effective source for a
// given kind (distance/tap/actual) is whichever group member's source is
// non-empty — preferring the record's own source first, falling back to a
// sibling's only when the record's own is empty.
function effectiveSource(
  record: LcdDistRecord,
  group: LcdDistRecord[],
  kind: ZoneSourceKind
): ZoneValueSource {
  const own = record[kind];
  if (!isSourceEmpty(own)) return own;
  const sibling = group.find((r) => r !== record && !isSourceEmpty(r[kind]));
  return sibling ? sibling[kind] : own;
}

function auditRecordPair(
  record: LcdDistRecord,
  group: LcdDistRecord[],
  pairKind: ZoneAuditPairKind,
  leftKind: ZoneSourceKind,
  rightKind: ZoneSourceKind
): ZoneAuditFinding[] {
  const leftSource = effectiveSource(record, group, leftKind);
  const rightSource = effectiveSource(record, group, rightKind);
  const leftEmpty = isSourceEmpty(leftSource);
  const rightEmpty = isSourceEmpty(rightSource);
  return ZONE_METRICS.map((metric) => {
    const left = (leftSource as Record<string, number | string | null>)[metric.field];
    const right = (rightSource as Record<string, number | string | null>)[metric.field];
    const leftValue = typeof left === "number" ? left : null;
    const rightValue = typeof right === "number" ? right : null;
    const { delta, deltaPercent, status } = compareValues(leftValue, rightValue, leftEmpty, rightEmpty, metric.id);
    return {
      recordId: record.id,
      ultg: record.ultg,
      substation: record.substation,
      bay: record.bay,
      circuit: record.circuit,
      relayMake: record.relay.make,
      relayModel: record.relay.model,
      metricId: metric.id,
      metricLabel: metric.label,
      unit: metric.unit,
      pairKind,
      leftValue,
      rightValue,
      delta,
      deltaPercent,
      status,
    };
  });
}

export type ZoneAuditSummary = {
  recordCount: number;
  findingCount: number;
  byStatus: Record<ZoneAuditStatus, number>;
  byPairKind: Record<ZoneAuditPairKind, Record<ZoneAuditStatus, number>>;
};

export type ZoneAuditResult = {
  findings: ZoneAuditFinding[];
  summary: ZoneAuditSummary;
};

function emptyStatusRecord(): Record<ZoneAuditStatus, number> {
  return { match: 0, "within-tolerance": 0, mismatch: 0, missing: 0 };
}

// Only bays whose relay actually has a distance protection element carry
// meaningful Z1/Z2/Z3 reach values. LCD-only bays (line current
// differential without a distance element — this shows up in practice for
// SKTT/underground-cable bays, which sometimes aren't given a distance
// function at all) legitimately have no Z1/Z2/Z3 setting; a 0 there is
// "not applicable", not a data gap. Auditing those bays' zone reach anyway
// would misreport a correct absence of data as noise, drowning out the
// bays that DO have a distance function but are still missing an
// actual/tap reading.
//
// `relay.functionGroup` alone is not reliable for this, though: the same
// physical bay/circuit is recorded as TWO rows in the source spreadsheet
// (once from each substation's perspective — e.g. "GI Angke -> PHT UGC
// Muarakarang Lama#1" and "GI Muarakarang Lama -> PHT UGC Angke#1" describe
// the SAME 7SL87 relay pair on the same cable), and a data-entry gap on
// just one side can leave its functionGroup as "LCD" while the other side
// correctly says "DIST+LCD" for the identical relay — confirmed against
// real UPT Durikosambi data (2 of 59 paired TAP documents disagree this
// way). Trusting functionGroup per-row would then wrongly classify one of
// the two rows as not distance-capable, hiding a real actual reading (e.g.
// Z1=2.5 ohm) that exists on the "wrong" row.
//
// Records pair up via their shared tap.document (both sides of a real bay
// normally cite the same issued TAP PDF) — a group is distance-capable if
// ANY member has "dist" in functionGroup, or any member's actual reach is a
// genuine non-zero reading (direct evidence a distance element exists and
// is reporting real values, regardless of what functionGroup claims).
function groupByTapDocument(records: LcdDistRecord[]): Map<string, LcdDistRecord[]> {
  const byDoc = new Map<string, LcdDistRecord[]>();
  for (const record of records) {
    const doc = record.tap.document.trim();
    if (!doc) continue;
    const group = byDoc.get(doc) ?? [];
    group.push(record);
    byDoc.set(doc, group);
  }
  return byDoc;
}

// Every record's comparison group: itself plus any records sharing its
// tap.document (both physical sides of the same bay/circuit). A record with
// no tap.document (or one unique to it) forms a group of just itself.
function groupForRecord(record: LcdDistRecord, byDoc: Map<string, LcdDistRecord[]>): LcdDistRecord[] {
  const doc = record.tap.document.trim();
  return doc ? (byDoc.get(doc) ?? [record]) : [record];
}

function buildDistanceCapabilityIndex(
  records: LcdDistRecord[],
  byDoc: Map<string, LcdDistRecord[]>
): Set<string> {
  const capableIds = new Set<string>();
  for (const record of records) {
    const group = groupForRecord(record, byDoc);
    const capable = group.some(
      (r) => /dist/i.test(r.relay.functionGroup) || (r.actual.z1PhPh ?? 0) > 0
    );
    if (capable) capableIds.add(record.id);
  }
  return capableIds;
}

// Runs the full three-way cross-validation (distance-vs-tap, tap-vs-actual,
// distance-vs-actual) for Z1/Z2/Z3 + t1/t2/t3 across every distance-capable
// LCD/DIST record for the given UPT (defaults to every record in the
// registry — the registry is UPT-scoped already, per its own generation
// from "Data Setting Penghantar UPT DKSBI (1).xlsx").
export function auditUptZoneSettings(
  allRecords: LcdDistRecord[] = LCD_DIST_REGISTRY.records
): ZoneAuditResult {
  const byDoc = groupByTapDocument(allRecords);
  const capableIds = buildDistanceCapabilityIndex(allRecords, byDoc);
  const records = allRecords.filter((r) => capableIds.has(r.id));
  const findings: ZoneAuditFinding[] = [];
  for (const record of records) {
    const group = groupForRecord(record, byDoc);
    findings.push(...auditRecordPair(record, group, "distance_vs_tap", "distance", "tap"));
    findings.push(...auditRecordPair(record, group, "tap_vs_actual", "tap", "actual"));
    findings.push(...auditRecordPair(record, group, "distance_vs_actual", "distance", "actual"));
  }

  const byStatus = emptyStatusRecord();
  const byPairKind: ZoneAuditSummary["byPairKind"] = {
    distance_vs_tap: emptyStatusRecord(),
    tap_vs_actual: emptyStatusRecord(),
    distance_vs_actual: emptyStatusRecord(),
  };
  for (const finding of findings) {
    byStatus[finding.status] += 1;
    byPairKind[finding.pairKind][finding.status] += 1;
  }

  return {
    findings,
    summary: {
      recordCount: records.length,
      findingCount: findings.length,
      byStatus,
      byPairKind,
    },
  };
}

// Convenience filter: only findings that need engineering attention (not
// simple missing-data gaps, which are a data-completeness concern, not a
// value-disagreement one).
export function mismatchFindings(result: ZoneAuditResult): ZoneAuditFinding[] {
  return result.findings.filter((f) => f.status === "mismatch");
}

// ---------------------------------------------------------------------------
// Per-bay readiness — answers "can I screen/change this bay's setting right
// now, or does something need attention first?" so a case-creation flow can
// gate on it directly instead of silently letting the user proceed into a
// dead end further downstream (Setting Case -> Data Quality Queue -> Working
// Network -> Reference Setting, discovered only after the case already
// exists).
// ---------------------------------------------------------------------------

export type BayReadinessStatus =
  | "ready" // has a distance function and reference/tap/actual agree (or are within tolerance)
  | "mismatch" // has a distance function, but reference/tap/actual disagree beyond tolerance
  | "missing-data" // has a distance function, but reference/tap/actual data is incomplete
  | "no-distance-function"; // this bay's relay doesn't have a distance element at all (e.g. LCD-only/SKTT) — Z1-Z3 audit doesn't apply

export type BayReadiness = {
  status: BayReadinessStatus;
  mismatchCount: number;
  missingCount: number;
  findings: ZoneAuditFinding[];
};

// Maps LcdDistRecord.id -> BayReadiness for every record the audit covers
// (distance-capable records only, per buildDistanceCapabilityIndex above —
// see auditUptZoneSettings). Callers combine this with an overlay's
// matchedBayId (graph-builder.ts's OverlayRecord) to resolve a specific
// UnifiedNetwork bayId's readiness.
export function bayReadinessByRecordId(
  allRecords: LcdDistRecord[] = LCD_DIST_REGISTRY.records
): Map<string, BayReadiness> {
  const byDoc = groupByTapDocument(allRecords);
  const distanceCapableIds = buildDistanceCapabilityIndex(allRecords, byDoc);
  const result = auditUptZoneSettings(allRecords);
  const byRecord = new Map<string, ZoneAuditFinding[]>();
  for (const finding of result.findings) {
    const list = byRecord.get(finding.recordId) ?? [];
    list.push(finding);
    byRecord.set(finding.recordId, list);
  }

  const readiness = new Map<string, BayReadiness>();
  for (const recordId of distanceCapableIds) {
    const findings = byRecord.get(recordId) ?? [];
    const mismatchCount = findings.filter((f) => f.status === "mismatch").length;
    const missingCount = findings.filter((f) => f.status === "missing").length;
    const status: BayReadinessStatus =
      mismatchCount > 0 ? "mismatch" : missingCount > 0 ? "missing-data" : "ready";
    readiness.set(recordId, { status, mismatchCount, missingCount, findings });
  }
  return readiness;
}

