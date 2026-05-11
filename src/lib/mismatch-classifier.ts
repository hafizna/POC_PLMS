import { ParameterRow, MismatchSeverity } from "../domain/types";

const COSMETIC_TOLERANCE_PCT = 1.0;

function tryParseNumber(v: string | number): number | null {
  if (typeof v === "number") return v;
  const cleaned = v.replace(/,/g, ".").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function classifyMismatch(row: ParameterRow): MismatchSeverity {
  if (row.mismatch_severity_override) {
    return row.mismatch_severity_override;
  }
  const a = tryParseNumber(row.terpasang);
  const b = tryParseNumber(row.tap);
  if (a !== null && b !== null) {
    if (a === b) return "match";
    if (b === 0) return Math.abs(a) < 1e-9 ? "match" : "functional";
    const pct = Math.abs((a - b) / b) * 100;
    if (pct <= COSMETIC_TOLERANCE_PCT) return "cosmetic";
    return "functional";
  }
  // Both string or one of each: exact string compare
  return String(row.terpasang).trim() === String(row.tap).trim() ? "match" : "functional";
}

export function summarizeBay(rows: ParameterRow[]) {
  const out = { match: 0, cosmetic: 0, functional: 0 };
  for (const row of rows) {
    out[classifyMismatch(row)]++;
  }
  return out;
}
