import type { RelayIED } from "./unified";

export type InstrumentStatus = "imported" | "reviewed" | "approved" | "issued";

export type CtSpec = {
  kind: "CT";
  primaryA: number;
  secondaryA: number;
  ratioText: string;
  sourceRef?: string;
  status?: InstrumentStatus;
  accuracyClass?: string;
  location?: string;
};

export type VtSpec = {
  kind: "VT";
  primaryKv: number;
  secondaryV: number;
  ratioText: string;
  sourceRef?: string;
  status?: InstrumentStatus;
  accuracyClass?: string;
  location?: string;
};

export type CtVtOverrideLike = {
  ct?: CtSpec;
  vt?: VtSpec;
};

export function parseCtRatio(value?: string | null, sourceRef?: string): CtSpec | null {
  if (!value) return null;
  const match = value.match(/(\d+(?:\.\d+)?)\s*(?:A)?\s*[\/:]\s*(\d+(?:\.\d+)?)\s*(?:A)?/i);
  if (!match) return null;
  const primaryA = Number(match[1]);
  const secondaryA = Number(match[2]);
  if (!Number.isFinite(primaryA) || !Number.isFinite(secondaryA) || primaryA <= 0 || secondaryA <= 0) {
    return null;
  }
  return {
    kind: "CT",
    primaryA,
    secondaryA,
    ratioText: formatCtRatio(primaryA, secondaryA),
    sourceRef,
    status: "imported",
  };
}

export function parseVtRatio(value?: string | null, sourceRef?: string): VtSpec | null {
  if (!value) return null;
  const match = value.match(/(\d+(?:\.\d+)?)\s*(kV|V)?\s*[\/:]\s*(\d+(?:\.\d+)?)\s*(kV|V)?/i);
  if (!match) return null;
  let primary = Number(match[1]);
  let secondary = Number(match[3]);
  const primaryUnit = (match[2] ?? "").toLowerCase();
  const secondaryUnit = (match[4] ?? "").toLowerCase();
  if (!Number.isFinite(primary) || !Number.isFinite(secondary) || primary <= 0 || secondary <= 0) {
    return null;
  }
  const primaryKv = primaryUnit === "v" ? primary / 1000 : primary;
  const secondaryV = secondaryUnit === "kv" ? secondary * 1000 : secondary;
  return {
    kind: "VT",
    primaryKv,
    secondaryV,
    ratioText: formatVtRatio(primaryKv, secondaryV),
    sourceRef,
    status: "imported",
  };
}

export function makeCtSpec(primaryA: number, secondaryA: number, sourceRef?: string): CtSpec | null {
  if (!Number.isFinite(primaryA) || !Number.isFinite(secondaryA) || primaryA <= 0 || secondaryA <= 0) {
    return null;
  }
  return {
    kind: "CT",
    primaryA,
    secondaryA,
    ratioText: formatCtRatio(primaryA, secondaryA),
    sourceRef,
    status: "reviewed",
  };
}

export function makeVtSpec(primaryKv: number, secondaryV: number, sourceRef?: string): VtSpec | null {
  if (!Number.isFinite(primaryKv) || !Number.isFinite(secondaryV) || primaryKv <= 0 || secondaryV <= 0) {
    return null;
  }
  return {
    kind: "VT",
    primaryKv,
    secondaryV,
    ratioText: formatVtRatio(primaryKv, secondaryV),
    sourceRef,
    status: "reviewed",
  };
}

export function getEffectiveCtVt(
  ied: RelayIED | undefined,
  overrides?: Record<string, CtVtOverrideLike>
): { ct: CtSpec | null; vt: VtSpec | null; source: "override" | "ied" | "missing" } {
  if (!ied) return { ct: null, vt: null, source: "missing" };
  const override = overrides?.[ied.id];
  const ct = override?.ct ?? ied.ct ?? parseCtRatio(ied.ctRatio);
  const vt = override?.vt ?? ied.vt ?? parseVtRatio(ied.vtRatio);
  if (override?.ct || override?.vt) return { ct: ct ?? null, vt: vt ?? null, source: "override" };
  if (ct || vt) return { ct: ct ?? null, vt: vt ?? null, source: "ied" };
  return { ct: null, vt: null, source: "missing" };
}

export function ctRatioText(ct?: CtSpec | null, fallback?: string): string {
  return ct?.ratioText || fallback || "-";
}

export function vtRatioText(vt?: VtSpec | null, fallback?: string): string {
  return vt?.ratioText || fallback || "-";
}

export function findFieldValue(
  fields: Array<{ field: string; value: string; unit?: string }> | undefined,
  pattern: RegExp
) {
  return fields?.find((item) => pattern.test(item.field))?.value;
}

function formatCtRatio(primaryA: number, secondaryA: number) {
  return `${formatNumber(primaryA)}/${formatNumber(secondaryA)}`;
}

function formatVtRatio(primaryKv: number, secondaryV: number) {
  return `${formatNumber(primaryKv)} kV/${formatNumber(secondaryV)} V`;
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}
