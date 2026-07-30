import type { CrosscheckWorkbookRegistry } from "../domain/crosscheck-workbook-registry";

type LegacySelectedLine = {
  slot: string;
  name: string;
  r1Ohm?: number | null;
  x1Ohm?: number | null;
  zOhm?: number | null;
};

type LegacyDistanceCase = {
  cccA?: number | null;
  ctPrimaryA?: number | null;
  ctSecondaryA?: number | null;
  ptPrimaryV?: number | null;
  ptSecondaryV?: number | null;
  selectedLines?: LegacySelectedLine[];
  outputs?: Record<string, number | string | null>;
};

type LegacyOcrGfrCase = {
  cccOrTsaA?: number | null;
  ctPrimaryA?: number | null;
  ctSecondaryA?: number | null;
  outputs?: Record<string, number | string | null>;
};

type Complex = {
  re: number;
  im: number;
};

export type LegacyBenchmarkRow = {
  key: string;
  label: string;
  unit?: string;
  plms: number | null;
  excel: number | null;
  delta: number | null;
  deltaPct: number | null;
  status: "match" | "warn" | "gap" | "missing";
};

export type LegacyCrosscheckBenchmark = {
  distanceRows: LegacyBenchmarkRow[];
  ocrGfrRows: LegacyBenchmarkRow[];
  formulas: Array<{ label: string; expression: string }>;
  summary: {
    rowCount: number;
    matchCount: number;
    warnCount: number;
    gapCount: number;
    missingCount: number;
    maxAbsDeltaPct: number | null;
  };
};

const TRANSFORMER_MVA_FALLBACK = 12.5;
const TRANSFORMER_VOLTAGE_KV_FALLBACK = 150;
const TRANSFORMER_PERCENT_Z_FALLBACK = 60;

export function calculateLegacyCrosscheckBenchmark(
  registry: CrosscheckWorkbookRegistry
): LegacyCrosscheckBenchmark {
  const distance = registry.legacyCases.distance as LegacyDistanceCase;
  const ocrGfr = registry.legacyCases.ocrGfr as LegacyOcrGfrCase;
  const lines = distance.selectedLines ?? [];
  const l1 = lineComplex(lines.find((line) => line.slot === "L1"));
  const l2 = lineComplex(lines.find((line) => line.slot === "L2"));
  const l3 = lineComplex(lines.find((line) => line.slot === "L3"));
  const l4 = lineComplex(lines.find((line) => line.slot === "L4"));
  const transformer = transformerLimit(distance);
  const secondaryFactor = calcSecondaryFactor(distance);

  const z1 = scale(l1, 0.8);
  const z2Min = scale(l1, 1.2);
  const z2Max1 = scale(add(l1, scale(l2, 0.8)), 0.8);
  const z2Transformer = scale(add(l1, scale(transformer, 0.5)), 0.8);
  const z2 = chooseByAbs(chooseByAbs(z2Min, z2Max1, "max"), z2Transformer, "min");

  const z3Min = scale(add(l1, l3), 1.2);
  const z3Max1 = scale(add(l1, scale(l3, 1.2)), 0.8);
  const z3Max2 = scale(add(l1, scale(add(l3, scale(l4, 0.8)), 0.8)), 0.8);
  const z3Transformer = scale(add(l1, scale(transformer, 0.8)), 0.8);
  const z3 = chooseByAbs(
    chooseByAbs(chooseByAbs(z3Max1, z3Max2, "max"), z3Min, "max"),
    z3Transformer,
    "min"
  );

  const ocrPrimary = maybeNumber(ocrGfr.cccOrTsaA) * 1.2;
  const gfrPrimary = maybeNumber(ocrGfr.cccOrTsaA) * 0.2;
  const ocrCtRatio = safeRatio(ocrGfr.ctPrimaryA, ocrGfr.ctSecondaryA);

  const distanceRows: LegacyBenchmarkRow[] = [
    row("z1Primary", "Z1 primary", abs(z1), excelNumber(distance.outputs?.z1PrimaryOhm), "ohm"),
    row("z1Secondary", "Z1 secondary", abs(z1) * secondaryFactor, excelNumber(distance.outputs?.z1SecondaryOhm), "ohm"),
    row("x1Primary", "X1 primary", z1.im, excelNumber(distance.outputs?.x1PrimaryOhm), "ohm"),
    row("x1Secondary", "X1 secondary", z1.im * secondaryFactor, excelNumber(distance.outputs?.x1SecondaryOhm), "ohm"),
    row("z2Primary", "Z2 primary", abs(z2), excelNumber(distance.outputs?.z2PrimaryOhm), "ohm"),
    row("z2Secondary", "Z2 secondary", abs(z2) * secondaryFactor, excelNumber(distance.outputs?.z2SecondaryOhm), "ohm"),
    row("x2Primary", "X2 primary", z2.im, excelNumber(distance.outputs?.x2PrimaryOhm), "ohm"),
    row("x2Secondary", "X2 secondary", z2.im * secondaryFactor, excelNumber(distance.outputs?.x2SecondaryOhm), "ohm"),
    row("z3Primary", "Z3 primary", abs(z3), excelNumber(distance.outputs?.z3PrimaryOhm), "ohm"),
    row("z3Secondary", "Z3 secondary", abs(z3) * secondaryFactor, excelNumber(distance.outputs?.z3SecondaryOhm), "ohm"),
    row("x3Primary", "X3 primary", z3.im, excelNumber(distance.outputs?.x3PrimaryOhm), "ohm"),
    row("x3Secondary", "X3 secondary", z3.im * secondaryFactor, excelNumber(distance.outputs?.x3SecondaryOhm), "ohm"),
    row("tZ1", "tZ1", 0, excelNumber(distance.outputs?.tZ1S), "s"),
    row("tZ2", "tZ2", 0.4, excelNumber(distance.outputs?.tZ2S), "s"),
    row("tZ3", "tZ3", 1.6, excelNumber(distance.outputs?.tZ3S), "s"),
  ];

  const ocrGfrRows: LegacyBenchmarkRow[] = [
    row("ocrPrimary", "OCR pickup primary", ocrPrimary, excelNumber(ocrGfr.outputs?.ocrPickupPrimaryA), "A"),
    row(
      "ocrSecondary",
      "OCR pickup secondary",
      ocrCtRatio > 0 ? ocrPrimary / ocrCtRatio : null,
      excelNumber(ocrGfr.outputs?.ocrPickupSecondaryA),
      "A"
    ),
    row("gfrPrimary", "GFR pickup primary", gfrPrimary, excelNumber(ocrGfr.outputs?.gfrPickupPrimaryA), "A"),
    row(
      "gfrSecondary",
      "GFR pickup secondary",
      ocrCtRatio > 0 ? gfrPrimary / ocrCtRatio : null,
      excelNumber(ocrGfr.outputs?.gfrPickupSecondaryA),
      "A"
    ),
  ];

  const allRows = [...distanceRows, ...ocrGfrRows];
  return {
    distanceRows,
    ocrGfrRows,
    formulas: [
      { label: "Z1", expression: "0.8 x L1" },
      { label: "Z2", expression: "min(max(1.2 x L1, 0.8 x (L1 + 0.8 x L2)), ZTrafo)" },
      { label: "Z3", expression: "min(max(1.2 x (L1 + L3), 0.8 x (L1 + 1.2 x L3), 0.8 x (L1 + 0.8 x (L3 + 0.8 x L4))), ZTrafo)" },
      { label: "Secondary", expression: "(CCC / CTsec) / (PTpri / PTsec)" },
      { label: "OCR/GFR", expression: "OCR = 1.2 x CCC/TSA, GFR = 0.2 x CCC/TSA" },
    ],
    summary: summarize(allRows),
  };
}

function lineComplex(line: LegacySelectedLine | undefined): Complex {
  return {
    re: maybeNumber(line?.r1Ohm),
    im: maybeNumber(line?.x1Ohm),
  };
}

function transformerLimit(distance: LegacyDistanceCase): Complex {
  const voltageKv = maybeNumber(distance.ptPrimaryV) > 0
    ? maybeNumber(distance.ptPrimaryV) / 1000
    : TRANSFORMER_VOLTAGE_KV_FALLBACK;
  const xOhm =
    (TRANSFORMER_MVA_FALLBACK * voltageKv * voltageKv) /
    TRANSFORMER_PERCENT_Z_FALLBACK /
    100;
  return { re: 0, im: xOhm };
}

function calcSecondaryFactor(distance: LegacyDistanceCase): number {
  const ccc = maybeNumber(distance.cccA);
  const ctSecondary = maybeNumber(distance.ctSecondaryA);
  const ptPrimary = maybeNumber(distance.ptPrimaryV);
  const ptSecondary = maybeNumber(distance.ptSecondaryV);
  if (ccc > 0 && ctSecondary > 0 && ptPrimary > 0 && ptSecondary > 0) {
    return (ccc / ctSecondary) / (ptPrimary / ptSecondary);
  }
  return safeRatio(distance.ctPrimaryA, distance.ctSecondaryA) /
    safeRatio(distance.ptPrimaryV, distance.ptSecondaryV);
}

function row(
  key: string,
  label: string,
  plms: number | null,
  excel: number | null,
  unit?: string
): LegacyBenchmarkRow {
  const roundedPlms = roundOrNull(plms);
  const roundedExcel = roundOrNull(excel);
  const delta = roundedPlms === null || roundedExcel === null ? null : round(roundedPlms - roundedExcel);
  const deltaPct =
    delta === null || roundedExcel === null || Math.abs(roundedExcel) < 1e-9
      ? null
      : round((delta / roundedExcel) * 100, 3);
  return {
    key,
    label,
    unit,
    plms: roundedPlms,
    excel: roundedExcel,
    delta,
    deltaPct,
    status: rowStatus(deltaPct, delta, roundedPlms, roundedExcel),
  };
}

function rowStatus(
  deltaPct: number | null,
  delta: number | null,
  plms: number | null,
  excel: number | null
): LegacyBenchmarkRow["status"] {
  if (plms === null || excel === null || delta === null) return "missing";
  if (Math.abs(delta) <= 0.005 || Math.abs(deltaPct ?? 0) <= 0.1) return "match";
  if (Math.abs(deltaPct ?? 0) <= 1) return "warn";
  return "gap";
}

function summarize(rows: LegacyBenchmarkRow[]): LegacyCrosscheckBenchmark["summary"] {
  const withDelta = rows.filter((item) => item.deltaPct !== null);
  return {
    rowCount: rows.length,
    matchCount: rows.filter((item) => item.status === "match").length,
    warnCount: rows.filter((item) => item.status === "warn").length,
    gapCount: rows.filter((item) => item.status === "gap").length,
    missingCount: rows.filter((item) => item.status === "missing").length,
    maxAbsDeltaPct:
      withDelta.length === 0
        ? null
        : round(Math.max(...withDelta.map((item) => Math.abs(item.deltaPct ?? 0))), 3),
  };
}

function excelNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.replace(",", ".").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function maybeNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeRatio(a: number | null | undefined, b: number | null | undefined): number {
  const numerator = maybeNumber(a);
  const denominator = maybeNumber(b);
  return denominator > 0 ? numerator / denominator : 0;
}

function add(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

function scale(a: Complex, factor: number): Complex {
  return { re: a.re * factor, im: a.im * factor };
}

function abs(a: Complex): number {
  return Math.hypot(a.re, a.im);
}

function chooseByAbs(a: Complex, b: Complex, mode: "min" | "max"): Complex {
  const aAbs = abs(a);
  const bAbs = abs(b);
  return mode === "min" ? (aAbs <= bAbs ? a : b) : aAbs >= bAbs ? a : b;
}

function roundOrNull(value: number | null | undefined, digits = 3): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return round(value, digits);
}

function round(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}
