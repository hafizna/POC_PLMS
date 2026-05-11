import { ComparisonBay } from "./types";
import { OCR_REGISTRY, OcrRecord } from "./ocr-import";
import { NETWORK_CASES } from "./seed-network-registry";
import { matchAnySide } from "./matcher";
import { normalizeBayName, normalizeStationName } from "./normalization";

// Real mismatches from screening Excel: PIK_DAAN_MOGOT_1.xlsx
// MiCOM P545 line differential + Siemens 7SJ63 backup OCR/GFR.
export const PIK_DAANMOGOT_1: ComparisonBay = {
  bay: {
    id: "bay_pik_dm_1",
    substation: "Pantai Indah Kapuk",
    name: "PIK - Daan Mogot Sirkit 1",
    voltage_kv: 150,
  },
  relay: { make: "Alstom MiCOM", model: "P545" },
  parameters: [
    // Configuration block
    { fn: "Config", name: "Distance",          terpasang: "Enabled",    tap: "Enabled",    unit: null },
    { fn: "Config", name: "Current Diff",      terpasang: "Enabled",    tap: "Enabled",    unit: null },
    { fn: "Config", name: "Power Swing Block", terpasang: "Enabled",    tap: "Enabled",    unit: null },
    { fn: "Config", name: "DEF Aided",         terpasang: "Enabled",    tap: "Enabled",    unit: null },

    // CT/VT and Line
    { fn: "Line",   name: "CT Ratio",          terpasang: "4000/1",     tap: "4000/1",     unit: "A" },
    { fn: "Line",   name: "VT Ratio",          terpasang: "150kV/100V", tap: "150kV/100V", unit: null },
    { fn: "Line",   name: "Line Length",       terpasang: "4.6",        tap: "4.6",        unit: "km" },
    { fn: "Line",   name: "Line Impedance",    terpasang: "15.31",      tap: "15.312",     unit: "ohm" },
    { fn: "Line",   name: "Line Angle",        terpasang: "81",         tap: "81.3",       unit: "deg" },

    // Distance zones (cosmetic differences only)
    { fn: "Distance", name: "Z1 Ph Reach",     terpasang: "12.25",      tap: "12.249",     unit: "ohm" },
    { fn: "Distance", name: "Z2 Ph Reach",     terpasang: "18.37",      tap: "18.374",     unit: "ohm" },
    { fn: "Distance", name: "Z3 Ph Reach",     terpasang: "26.76",      tap: "26.762",     unit: "ohm" },
    { fn: "Distance", name: "tZ2 Ph Delay",    terpasang: "0.4",        tap: "0.4",        unit: "s" },
    { fn: "Distance", name: "tZ3 Ph Delay",    terpasang: "1.6",        tap: "1.6",        unit: "s" },

    // Scheme Logic - REAL FUNCTIONAL MISMATCHES
    { fn: "Scheme", name: "Aid 1 Selection",   terpasang: "POR",        tap: "Blocking",   unit: null,
      mismatch_severity_override: "functional",
      note: "Teleprotection scheme type difference. POR (Permissive Over-Reach) and Blocking schemes are not interchangeable: they require different signaling logic and different reverse-zone setups. This needs engineering review before next outage." },

    { fn: "Scheme", name: "tRev Guard",        terpasang: "0.1",        tap: "0",          unit: "s",
      mismatch_severity_override: "functional",
      note: "Reverse guard timer mismatch consistent with the scheme type difference above. The 100 ms reverse guard suggests the relay is configured for blocking scheme operation but the approved tap is for POR." },

    // Backup OCR (Siemens 7SJ63) - borderline cosmetic
    { fn: "OCR", name: "I>",                   terpasang: "0.75",       tap: "0.754",      unit: "A (sec)",
      note: "0.5% difference, rounding-level. Cosmetic." },
    { fn: "OCR", name: "TMS",                  terpasang: "0.33",       tap: "0.33",       unit: "(SI)" },
    { fn: "OCR", name: "Curve",                terpasang: "IEC SI",     tap: "IEC SI",     unit: null },

    // GFR
    { fn: "GFR", name: "Ie>",                  terpasang: "0.13",       tap: "0.126",      unit: "A (sec)",
      note: "Cosmetic, ~3% difference within CT class accuracy." },
    { fn: "GFR", name: "TMS",                  terpasang: "0.63",       tap: "0.626",      unit: "(SI)" },
    { fn: "GFR", name: "Curve",                terpasang: "IEC SI",     tap: "IEC SI",     unit: null },
  ],
};

// Records eligible to surface as a comparison bay: have TAP+actual data and
// the substation appears in at least one active network case. Among those,
// the generalized matcher decides which can deep-link to a LineRelation.
type OcrComparisonRow = { bay: ComparisonBay; matchedLineId?: string };

function buildOcrComparisonRows(): OcrComparisonRow[] {
  const stationsInCases = new Set(
    NETWORK_CASES.flatMap((c) => c.nodes.map((n) => normalizeStationName(n.name)))
  );
  return OCR_REGISTRY.records
    .filter((record) => record.dataQuality.hasTap && record.dataQuality.hasActual)
    .filter((record) => {
      const station = normalizeStationName(record.substation);
      return Array.from(stationsInCases).some(
        (s) => s && (station.includes(s) || s.includes(station))
      );
    })
    .map((record) => ({
      bay: createOcrComparisonBay(record),
      matchedLineId: findLineIdForOcrRecord(record),
    }));
}

const OCR_COMPARISON_ROWS = buildOcrComparisonRows();

export const OCR_COMPARISON_BAYS: ComparisonBay[] = OCR_COMPARISON_ROWS.map(
  (row) => row.bay
);

const LINE_TO_OCR_BAY: Record<string, string> = OCR_COMPARISON_ROWS.reduce(
  (acc, row) => {
    if (row.matchedLineId) acc[row.matchedLineId] = row.bay.bay.id;
    return acc;
  },
  {} as Record<string, string>
);

export const COMPARISON_BAYS: ComparisonBay[] = [
  PIK_DAANMOGOT_1,
  ...OCR_COMPARISON_BAYS,
];

export function findComparisonBayIdForLine(lineId: string): string | null {
  if (lineId === "line_dm_pik_1") return PIK_DAANMOGOT_1.bay.id;
  return LINE_TO_OCR_BAY[lineId] ?? null;
}

function findLineIdForOcrRecord(record: OcrRecord): string | undefined {
  for (const networkCase of NETWORK_CASES) {
    if (networkCase.lines.length === 0) continue;
    const match = matchAnySide(
      { substation: record.substation, bay: record.bay, circuit: record.circuit },
      networkCase.nodes,
      networkCase.lines
    );
    if (match.status === "matched" && match.matchedLineId) {
      return match.matchedLineId;
    }
  }
  return undefined;
}

function createOcrComparisonBay(record: OcrRecord): ComparisonBay {
  return {
    bay: {
      id: `ocr_${record.id}`,
      substation: prettyStation(record.substation),
      name: `${prettyBay(record.bay)} ${record.circuit}`.trim(),
      voltage_kv: 150,
    },
    relay: {
      make: record.relay.make || "Relay",
      model: record.relay.model || "unknown",
    },
    parameters: [
      {
        fn: "Line",
        name: "CT Ratio",
        terpasang: record.ctRatio || "-",
        tap: record.ctRatio || "-",
        unit: "A",
      },
      {
        fn: "OCR",
        name: "I>",
        terpasang: valueOrDash(record.actual.ocPickupA),
        tap: valueOrDash(record.tap.ocPickupA),
        unit: "A (sec)",
        note: sourceNote(record),
      },
      {
        fn: "OCR",
        name: "TMS",
        terpasang: valueOrDash(record.actual.ocTms),
        tap: valueOrDash(record.tap.ocTms),
        unit: record.tap.ocCurve || record.actual.ocCurve || null,
      },
      {
        fn: "OCR",
        name: "Curve",
        terpasang: record.actual.ocCurve || "-",
        tap: record.tap.ocCurve || "-",
        unit: null,
      },
      {
        fn: "GFR",
        name: "Ie>",
        terpasang: valueOrDash(record.actual.gfPickupA),
        tap: valueOrDash(record.tap.gfPickupA),
        unit: "A (sec)",
      },
      {
        fn: "GFR",
        name: "TMS",
        terpasang: valueOrDash(record.actual.gfTms),
        tap: valueOrDash(record.tap.gfTms),
        unit: record.tap.gfCurve || record.actual.gfCurve || null,
      },
      {
        fn: "GFR",
        name: "Curve",
        terpasang: record.actual.gfCurve || "-",
        tap: record.tap.gfCurve || "-",
        unit: null,
      },
    ],
  };
}

function valueOrDash(value: number | null) {
  return value ?? "-";
}

function prettyStation(value: string) {
  const normalized = normalizeStationName(value);
  return titleCase(normalized);
}

function prettyBay(value: string) {
  const normalized = normalizeBayName(value);
  return titleCase(normalized);
}

function titleCase(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1))
    .join(" ");
}

function sourceNote(record: OcrRecord) {
  return `OCR/GFR import row ${record.sourceRow}. TAP: ${
    record.tap.document || "no document"
  }. Actual date: ${record.actual.date || "unknown"}.`;
}
