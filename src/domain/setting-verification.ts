import type { ReferenceMetric, ReferenceResult } from "./reference-setting";

export type ReferenceKind = "ocr-gfr" | "transformer" | "distance";
export type VerificationSourceKind =
  | "csv"
  | "tap-pdf"
  | "manual"
  | "vendor-import";
export type ToleranceProfile = "strict" | "engineering" | "commissioning";
export type ValueBasis = "primary" | "secondary";

export type VerificationReferenceDraft = {
  kind: ReferenceKind;
  contextLabel: string;
  result: ReferenceResult;
  stagedAt: string;
};

export type NormalizedActualParameter = {
  id: string;
  value: number | string;
  unit?: string;
  rawName: string;
  rawValue: string;
  sourceLine: number;
  confidence: "high" | "review";
};

export type UnmappedActualParameter = {
  rawName: string;
  rawValue: string;
  sourceLine: number;
  reason: string;
};

export type ActualParseResult = {
  vendor: string;
  format: string;
  parameters: NormalizedActualParameter[];
  unmapped: UnmappedActualParameter[];
  warnings: string[];
  sourceLineCount: number;
};

export type VerificationRowStatus =
  | "match"
  | "within-tolerance"
  | "mismatch"
  | "missing-actual";

export type VerificationRow = {
  id: string;
  group: string;
  label: string;
  referenceValue: number | string | null;
  actualValue: number | string | null;
  unit?: string;
  delta: number | null;
  deltaPercent: number | null;
  toleranceLabel: string;
  status: VerificationRowStatus;
  sourceName?: string;
  confidence?: NormalizedActualParameter["confidence"];
};

export type VerificationReport = {
  rows: VerificationRow[];
  summary: Record<VerificationRowStatus, number>;
  coveragePercent: number;
  decision: "PASS" | "REVIEW" | "FAIL";
};

type ParseOptions = {
  referenceKind: ReferenceKind;
  currentBasis: ValueBasis;
  impedanceBasis: ValueBasis;
};

type CompareOptions = {
  kind: ReferenceKind;
  profile: ToleranceProfile;
  currentBasis: ValueBasis;
  impedanceBasis: ValueBasis;
};

type ParameterDefinition = {
  id: string;
  label: string;
  group: string;
};

const VERIFIABLE_KEYS: Record<ReferenceKind, string[]> = {
  "ocr-gfr": [
    "ocr-primary",
    "ocr-secondary",
    "ocr-pu",
    "ocr-delay",
    "gfr-primary",
    "gfr-secondary",
    "gfr-pu",
    "gfr-delay",
  ],
  transformer: [
    "diff",
    "ref-hv-is1",
    "ref-hv-is2",
    "ref-lv-is1",
    "ref-lv-is2",
    "ocr-hv",
    "ocr-hv-tms",
    "ocr-hv-moment",
    "gfr-hv",
    "gfr-hv-tms",
    "ocr-lv",
    "ocr-lv-tms",
    "ocr-lv-m1",
    "ocr-lv-m1-t",
    "ocr-lv-m2",
    "ocr-lv-m2-t",
    "gfr-lv",
    "gfr-lv-tms",
    "sbef",
    "sbef-lti",
    "sbef-vi",
  ],
  distance: [
    "Z1-z-primary",
    "Z1-z-secondary",
    "Z1-delay",
    "Z2-z-primary",
    "Z2-z-secondary",
    "Z2-delay",
    "Z3-z-primary",
    "Z3-z-secondary",
    "Z3-delay",
    "k0-real",
    "k0-imag",
  ],
};

export function parameterDefinitions(
  result: ReferenceResult,
  kind: ReferenceKind,
  options?: Pick<CompareOptions, "currentBasis" | "impedanceBasis">
): ParameterDefinition[] {
  return comparableMetrics(result, kind, options).map((metric) => ({
    id: metric.key,
    label: metric.label,
    group: metric.group,
  }));
}

export function parseActualSettingText(
  text: string,
  options: ParseOptions
): ActualParseResult {
  const vendor = detectVendor(text);
  const format = detectFormat(text);
  const parameters: NormalizedActualParameter[] = [];
  const unmapped: UnmappedActualParameter[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, number>();
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  lines.forEach((source, index) => {
    const lineNumber = index + 1;
    const trimmed = source.trim();
    if (!trimmed || /^(#|\/\/|\*)/.test(trimmed)) return;

    const pair = parsePair(trimmed);
    if (!pair) return;

    const mapped = mapParameterName(pair.name, options);
    if (!mapped) {
      if (looksLikeSetting(pair.name, pair.value)) {
        unmapped.push({
          rawName: pair.name,
          rawValue: pair.value,
          sourceLine: lineNumber,
          reason: "Alias parameter belum dikenal atau basis primary/secondary ambigu.",
        });
      }
      return;
    }

    const parsedValue = parseSettingValue(pair.value);
    if (parsedValue === null) {
      unmapped.push({
        rawName: pair.name,
        rawValue: pair.value,
        sourceLine: lineNumber,
        reason: "Nilai tidak dapat dinormalisasi.",
      });
      return;
    }

    if (seen.has(mapped.id)) {
      warnings.push(
        `${mapped.id} muncul lebih dari sekali; nilai dari baris ${lineNumber} dipakai.`
      );
      const previousIndex = parameters.findIndex(
        (parameter) => parameter.id === mapped.id
      );
      if (previousIndex >= 0) parameters.splice(previousIndex, 1);
    }
    seen.set(mapped.id, lineNumber);
    parameters.push({
      id: mapped.id,
      value: parsedValue,
      unit: extractUnit(pair.value),
      rawName: pair.name,
      rawValue: pair.value,
      sourceLine: lineNumber,
      confidence: mapped.confidence,
    });
  });

  if (parameters.length === 0) {
    warnings.push(
      "Belum ada parameter yang berhasil dipetakan. Gunakan review mapping atau paste export berbentuk key=value."
    );
  }
  if (format === "binary-like") {
    warnings.push(
      "File terlihat seperti format biner/proprietary. Export ulang dari software relay ke text/CSV bila hasil parsing minim."
    );
  }

  return {
    vendor,
    format,
    parameters,
    unmapped,
    warnings,
    sourceLineCount: lines.length,
  };
}

export function compareReferenceToActual(
  reference: ReferenceResult,
  actual: NormalizedActualParameter[],
  options: CompareOptions
): VerificationReport {
  const comparable = comparableMetrics(reference, options.kind, options);
  const actualById = new Map(actual.map((parameter) => [parameter.id, parameter]));

  const rows = comparable.map((metric): VerificationRow => {
    const installed = actualById.get(metric.key);
    if (!installed) {
      return {
        id: metric.key,
        group: metric.group,
        label: metric.label,
        referenceValue: metric.value,
        actualValue: null,
        unit: metric.unit,
        delta: null,
        deltaPercent: null,
        toleranceLabel: toleranceFor(metric.key, options.profile).label,
        status: "missing-actual",
      };
    }

    const referenceNumber = numericValue(metric.value);
    const actualNumber = numericValue(installed.value);
    const tolerance = toleranceFor(metric.key, options.profile);
    if (referenceNumber !== null && actualNumber !== null) {
      const delta = actualNumber - referenceNumber;
      const deltaPercent =
        Math.abs(referenceNumber) > 1e-12
          ? (delta / referenceNumber) * 100
          : null;
      const allowed = Math.max(
        tolerance.absolute,
        Math.abs(referenceNumber) * (tolerance.relativePercent / 100)
      );
      const exact = Math.abs(delta) <= 1e-9;
      return {
        id: metric.key,
        group: metric.group,
        label: metric.label,
        referenceValue: metric.value,
        actualValue: installed.value,
        unit: metric.unit ?? installed.unit,
        delta,
        deltaPercent,
        toleranceLabel: tolerance.label,
        status: exact
          ? "match"
          : Math.abs(delta) <= allowed
            ? "within-tolerance"
            : "mismatch",
        sourceName: installed.rawName,
        confidence: installed.confidence,
      };
    }

    const equal =
      normalizeDiscrete(metric.value) === normalizeDiscrete(installed.value);
    return {
      id: metric.key,
      group: metric.group,
      label: metric.label,
      referenceValue: metric.value,
      actualValue: installed.value,
      unit: metric.unit ?? installed.unit,
      delta: null,
      deltaPercent: null,
      toleranceLabel: "exact semantic",
      status: equal ? "match" : "mismatch",
      sourceName: installed.rawName,
      confidence: installed.confidence,
    };
  });

  const summary: VerificationReport["summary"] = {
    match: rows.filter((row) => row.status === "match").length,
    "within-tolerance": rows.filter(
      (row) => row.status === "within-tolerance"
    ).length,
    mismatch: rows.filter((row) => row.status === "mismatch").length,
    "missing-actual": rows.filter(
      (row) => row.status === "missing-actual"
    ).length,
  };
  const covered = rows.length - summary["missing-actual"];
  const coveragePercent = rows.length > 0 ? (covered / rows.length) * 100 : 0;
  const decision =
    summary.mismatch > 0
      ? "FAIL"
      : summary["missing-actual"] > 0 ||
          summary["within-tolerance"] > 0 ||
          actual.some((parameter) => parameter.confidence === "review")
        ? "REVIEW"
        : "PASS";

  return { rows, summary, coveragePercent, decision };
}

export function mapManualParameter(
  raw: UnmappedActualParameter,
  id: string
): NormalizedActualParameter | null {
  const parsed = parseSettingValue(raw.rawValue);
  if (!id || parsed === null) return null;
  return {
    id,
    value: parsed,
    unit: extractUnit(raw.rawValue),
    rawName: raw.rawName,
    rawValue: raw.rawValue,
    sourceLine: raw.sourceLine,
    confidence: "review",
  };
}

export function demoActualText(
  kind: ReferenceKind,
  reference: ReferenceResult
) {
  const lines = [
    "VENDOR=PLMS GENERIC EXPORT",
    `REFERENCE_RULE=${reference.ruleId}`,
  ];
  const metrics = comparableMetrics(reference, kind, {
    currentBasis: "secondary",
    impedanceBasis: "secondary",
  });
  metrics.forEach((metric, index) => {
    let value: number | string | null = metric.value;
    const numeric = numericValue(value);
    if (numeric !== null && index === Math.min(2, metrics.length - 1)) {
      value = numeric * 1.035;
    }
    lines.push(`${metric.key}=${displayValue(value)}${metric.unit ? ` ${metric.unit}` : ""}`);
  });
  lines.push("UNMAPPED_VENDOR_FLAG=ENABLED");
  return lines.join("\n");
}

function comparableMetrics(
  result: ReferenceResult,
  kind: ReferenceKind,
  options?: Pick<CompareOptions, "currentBasis" | "impedanceBasis">
) {
  let keys = VERIFIABLE_KEYS[kind];
  if (kind === "ocr-gfr" && options?.currentBasis) {
    const suffix = options.currentBasis === "primary" ? "-primary" : "-secondary";
    keys = keys.filter(
      (key) =>
        !key.startsWith("ocr-") ||
        (!key.endsWith("-primary") && !key.endsWith("-secondary")) ||
        key.endsWith(suffix)
    );
    keys = keys.filter(
      (key) =>
        !key.startsWith("gfr-") ||
        (!key.endsWith("-primary") && !key.endsWith("-secondary")) ||
        key.endsWith(suffix)
    );
  }
  if (kind === "distance" && options?.impedanceBasis) {
    const suffix =
      options.impedanceBasis === "primary" ? "-primary" : "-secondary";
    keys = keys.filter(
      (key) =>
        !/-z-(primary|secondary)$/.test(key) || key.endsWith(suffix)
    );
  }
  return result.metrics.filter((metric) => keys.includes(metric.key));
}

function parsePair(line: string): { name: string; value: string } | null {
  const xml = line.match(
    /<(?:setting|parameter)[^>]*\bname=["']([^"']+)["'][^>]*\bvalue=["']([^"']+)["']/i
  );
  if (xml) return { name: xml[1].trim(), value: xml[2].trim() };

  const separator = line.match(/^(.{1,100}?)[\t=:;](.+)$/);
  if (separator) {
    return { name: separator[1].trim(), value: separator[2].trim() };
  }

  const csv = line.match(/^"?([^",]{2,100})"?\s*,\s*"?([^",]+)"?/);
  if (csv) return { name: csv[1].trim(), value: csv[2].trim() };
  return null;
}

function mapParameterName(
  name: string,
  options: ParseOptions
): { id: string; confidence: NormalizedActualParameter["confidence"] } | null {
  const raw = normalizeName(name);
  const exact = VERIFIABLE_KEYS[options.referenceKind].find(
    (key) => normalizeName(key) === raw
  );
  if (exact) return { id: exact, confidence: "high" };

  if (options.referenceKind === "distance") {
    const zone = raw.match(/\bz\s*([123])\b/)?.[1];
    if (zone && /(reach|impedance|ohm|z ph|phase reach)/.test(raw)) {
      return {
        id: `Z${zone}-z-${options.impedanceBasis}`,
        confidence: "high",
      };
    }
    const delayZone = raw.match(/(?:tz|t z|zone|z)\s*([123]).*(?:delay|time|timer)|(?:delay|time|timer).*(?:z|zone)\s*([123])/);
    const delayIndex = delayZone?.[1] ?? delayZone?.[2];
    if (delayIndex) {
      return { id: `Z${delayIndex}-delay`, confidence: "high" };
    }
    if (/k0.*(?:real|resistive)|(?:real|resistive).*k0/.test(raw)) {
      return { id: "k0-real", confidence: "high" };
    }
    if (/k0.*(?:imag|reactive)|(?:imag|reactive).*k0/.test(raw)) {
      return { id: "k0-imag", confidence: "high" };
    }
  }

  if (options.referenceKind === "ocr-gfr") {
    const basis = options.currentBasis;
    if (/(oc|ocr|51p|i >|i>|ip >|ip>)/.test(raw) && /(pickup|start|setting|i >|i>|ip >|ip>)/.test(raw)) {
      return { id: `ocr-${basis}`, confidence: "high" };
    }
    if (/(oc|ocr|51p|ip).*(tms|time multiplier|time dial)|(tms|time multiplier|time dial).*(oc|ocr|51p|ip)/.test(raw)) {
      return { id: "ocr-delay", confidence: "high" };
    }
    if (/(gf|gfr|earth|51n|51g|ie >|ie>|iep >|iep>)/.test(raw) && /(pickup|start|setting|ie >|ie>|iep >|iep>)/.test(raw)) {
      return { id: `gfr-${basis}`, confidence: "high" };
    }
    if (/(gf|gfr|earth|51n|51g|iep?).*(tms|time multiplier|time dial)|(tms|time multiplier|time dial).*(gf|gfr|earth|51n|51g|iep?)/.test(raw)) {
      return { id: "gfr-delay", confidence: "high" };
    }
  }

  if (options.referenceKind === "transformer") {
    const aliases: Array<[RegExp, string]> = [
      [/(diff|differential).*(pickup|start|is1)/, "diff"],
      [/ref.*hv.*is1|hv.*ref.*is1/, "ref-hv-is1"],
      [/ref.*hv.*is2|hv.*ref.*is2/, "ref-hv-is2"],
      [/ref.*lv.*is1|lv.*ref.*is1/, "ref-lv-is1"],
      [/ref.*lv.*is2|lv.*ref.*is2/, "ref-lv-is2"],
      [/ocr.*hv.*(?:pickup|setting)/, "ocr-hv"],
      [/ocr.*hv.*tms|tms.*ocr.*hv/, "ocr-hv-tms"],
      [/ocr.*hv.*(?:moment|instant|high set)/, "ocr-hv-moment"],
      [/gfr.*hv.*(?:pickup|setting)/, "gfr-hv"],
      [/gfr.*hv.*tms|tms.*gfr.*hv/, "gfr-hv-tms"],
      [/ocr.*lv.*(?:pickup|setting)/, "ocr-lv"],
      [/ocr.*lv.*tms|tms.*ocr.*lv/, "ocr-lv-tms"],
      [/ocr.*lv.*(?:moment|instant).*(?:1|stage 1)/, "ocr-lv-m1"],
      [/ocr.*lv.*(?:moment|instant).*(?:2|stage 2)/, "ocr-lv-m2"],
      [/gfr.*lv.*(?:pickup|setting)/, "gfr-lv"],
      [/gfr.*lv.*tms|tms.*gfr.*lv/, "gfr-lv-tms"],
      [/sbef.*(?:pickup|setting)/, "sbef"],
      [/sbef.*(?:lti|tms)/, "sbef-lti"],
    ];
    const alias = aliases.find(([pattern]) => pattern.test(raw));
    if (alias) return { id: alias[1], confidence: "high" };
  }
  return null;
}

function toleranceFor(id: string, profile: ToleranceProfile) {
  if (profile === "strict") {
    return { absolute: 0, relativePercent: 0, label: "exact" };
  }
  const multiplier = profile === "commissioning" ? 2 : 1;
  if (/tms|delay|lti|vi/.test(id)) {
    const absolute = (id.includes("delay") ? 0.01 : 0.005) * multiplier;
    return {
      absolute,
      relativePercent: 0,
      label: `±${absolute} ${id.includes("delay") ? "s" : ""}`.trim(),
    };
  }
  if (/Z[123]-z-|k0/.test(id)) {
    return {
      absolute: 0.01 * multiplier,
      relativePercent: 1 * multiplier,
      label: `±${1 * multiplier}% atau ±${0.01 * multiplier} Ω`,
    };
  }
  if (/secondary/.test(id)) {
    return {
      absolute: 0.005 * multiplier,
      relativePercent: 1 * multiplier,
      label: `±${1 * multiplier}% atau ±${0.005 * multiplier}`,
    };
  }
  if (/primary|ocr-|gfr-|ref-|sbef/.test(id)) {
    return {
      absolute: 1 * multiplier,
      relativePercent: 1 * multiplier,
      label: `±${1 * multiplier}% atau ±${1 * multiplier} A`,
    };
  }
  return {
    absolute: 0.01 * multiplier,
    relativePercent: 1 * multiplier,
    label: `±${1 * multiplier}%`,
  };
}

function parseSettingValue(value: string): number | string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const numberMatch = normalized
    .replace(",", ".")
    .match(/[-+]?\d+(?:\.\d+)?/);
  if (numberMatch) {
    const parsed = Number(numberMatch[0]);
    if (Number.isFinite(parsed)) return parsed;
  }
  const discrete = normalizeDiscrete(normalized);
  return discrete || null;
}

function numericValue(value: number | string | null): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const match = value.replace(",", ".").match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDiscrete(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\bENABLED\b/, "ON")
    .replace(/\bDISABLED\b/, "OFF")
    .replace(/\bSTANDARD INVERSE\b/, "SI")
    .replace(/\bIEC\s+SI\b/, "SI")
    .replace(/\s+/g, " ");
}

function normalizeName(value: string) {
  return value
    .toLowerCase()
    .replace(/[()[\]{}_.:/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractUnit(value: string) {
  const match = value.match(
    /\b(A primary|A secondary|A prim|A sec|ohm|Ω|pu|s|ms|SI|LTI|VI)\b/i
  );
  return match?.[1];
}

function detectVendor(text: string) {
  if (/SIPROTEC|DIGSI|7SA|7SJ|7UT/i.test(text)) return "Siemens / SIPROTEC";
  if (/MiCOM|P44[2345]|P54[345]|ALSTOM|SCHNEIDER/i.test(text))
    return "MiCOM / Schneider";
  if (/ABB|HITACHI|REL\s*6|RET\s*6/i.test(text)) return "ABB / Hitachi Energy";
  if (/MULTILIN|UR SERIES|GE GRID/i.test(text)) return "GE / Multilin";
  if (/\bSEL[- ]?\d{3}/i.test(text)) return "SEL";
  return "Generic / belum terdeteksi";
}

function detectFormat(text: string) {
  const controlCharacters = Array.from(text).filter((character) => {
    const code = character.charCodeAt(0);
    return code < 9 || (code > 13 && code < 32);
  }).length;
  if (text.length > 0 && controlCharacters / text.length > 0.03)
    return "binary-like";
  if (/<(?:setting|parameter)\b/i.test(text)) return "XML setting export";
  if (/^[^,\n]+,[^,\n]+/m.test(text)) return "CSV";
  if (/^[^=\n]+=/m.test(text)) return "key=value text";
  return "plain text";
}

function looksLikeSetting(name: string, value: string) {
  return (
    /pickup|reach|delay|timer|tms|curve|setting|zone|ocr|gfr|diff|ref|sbef|k0|i>|ie>/i.test(
      name
    ) || /[-+]?\d+(?:[.,]\d+)?\s*(A|ohm|Ω|pu|s|ms)\b/i.test(value)
  );
}

function displayValue(value: number | string | null) {
  if (typeof value === "number") return Number(value.toFixed(6));
  return value ?? "";
}
