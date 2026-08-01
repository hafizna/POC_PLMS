import type { RioImportResult } from "./rio-xrio-import";

export type VendorImportAdapterId =
  | "micom-courier-v1"
  | "tap-pdf-profile-v1"
  | "rio-xrio-v1";

export type VendorImportValue = number | string;

export type VendorImportParameter = {
  address?: string;
  rawName: string;
  canonicalKey?: string;
  functionGroup: string;
  value: VendorImportValue;
  unit?: string;
  rawValue: string;
  decodeStatus: "decoded" | "review";
  confidence: "high" | "review";
};

export type VendorImportDiagnostic = {
  level: "info" | "warning" | "error";
  message: string;
};

export type VendorImportResult = {
  schema: "plms.vendor-import.v1";
  adapterId: VendorImportAdapterId;
  sourceFileName: string;
  sourceFormat: string;
  vendor: string;
  family: string;
  model?: string;
  metadata: Record<string, string>;
  parameters: VendorImportParameter[];
  diagnostics: VendorImportDiagnostic[];
  coverage: {
    totalRecords: number;
    decodedRecords: number;
    canonicalRecords: number;
    reviewRecords: number;
  };
};

export type TapExtractedField = {
  field: string;
  value: string;
  unit?: string;
};

export type VendorImportHandoffDraft = {
  caseId?: string;
  sourceFileName: string;
  adapterId: VendorImportAdapterId;
  sourceFormat: string;
  vendor: string;
  model?: string;
  normalizedText: string;
  importedAt: string;
  evidenceAuthority: "actual_readback" | "derived_candidate";
  acquisitionManifest?: {
    deviceIdentity: string;
    activeGroup: string;
    toolName: string;
    toolVersion: string;
    readAt: string;
    checksumSha256: string;
  };
};

export const VENDOR_IMPORT_ADAPTERS = [
  {
    id: "rio-xrio-v1" as const,
    label: "RIO / XRIO distance",
    vendor: "Siemens, MiCOM, ABB, GE",
    coverage: "Distance zones, timer, K0, CT/VT dari export tervalidasi",
    status: "available" as const,
  },
  {
    id: "micom-courier-v1" as const,
    label: "MiCOM Courier .set",
    vendor: "MiCOM / Schneider",
    coverage: "P443 & P545 sample profile",
    status: "available" as const,
  },
  {
    id: "tap-pdf-profile-v1" as const,
    label: "TAP Setting PDF",
    vendor: "Document profile",
    coverage: "Text layer + scanned OCR",
    status: "available" as const,
  },
  {
    id: "siprotec-digsi-profile" as const,
    label: "SIPROTEC / DIGSI",
    vendor: "Siemens",
    coverage: "Menunggu sampel export tervalidasi",
    status: "planned" as const,
  },
  {
    id: "abb-pcm600-profile" as const,
    label: "ABB / PCM600",
    vendor: "ABB / Hitachi Energy",
    coverage: "Menunggu sampel export tervalidasi",
    status: "planned" as const,
  },
] as const;

export function adaptRioXrioResult(
  parsed: RioImportResult,
  sourceFileName: string,
  rawText = ""
): VendorImportResult {
  const model = rawText.match(/\b(P(?:44[2345]|54[345])\w*|7S(?:A|L|J|T)\d+\w*|RED\d+|REL\d+|D60)\b/i)?.[1];
  const vendor = /SIPROTEC|DIGSI|7S(?:A|L|J|T)/i.test(rawText)
    ? "Siemens / SIPROTEC"
    : /MiCOM|P(?:44[2345]|54[345])/i.test(rawText)
      ? "MiCOM / Schneider"
      : /ABB|RED\d+|REL\d+|ZMFPDIS/i.test(rawText)
        ? "ABB / Hitachi Energy"
        : /(?:GENERAL ELECTRIC|\bGE\b|D60)/i.test(rawText)
          ? "GE Vernova"
          : "Vendor belum terdeteksi";
  const parameters: VendorImportParameter[] = [];
  const push = (
    rawName: string,
    canonicalKey: string,
    value: number | undefined,
    unit?: string
  ) => {
    if (value === undefined || !Number.isFinite(value)) return;
    parameters.push({
      rawName,
      canonicalKey,
      functionGroup: "Distance",
      value,
      unit,
      rawValue: String(value),
      decodeStatus: "decoded",
      confidence: "high",
    });
  };
  parsed.zones.forEach((zone, index) => {
    const zoneNumber = Number(zone.label.match(/\d+/)?.[0]) || index + 1;
    push(`Z${zoneNumber} Ph. Reach`, `distance.zone${zoneNumber}.phase_reach`, zone.xReachOhm, "ohm");
    push(`Z${zoneNumber} Ph. Resistance`, `distance.zone${zoneNumber}.phase_resistance`, zone.rfppOhmPerLoop ?? zone.rReachOhm, "ohm");
    push(`Z${zoneNumber} Gnd. Resistance`, `distance.zone${zoneNumber}.ground_resistance`, zone.rfpeOhmPerLoop ?? zone.rReachOhm, "ohm");
    push(`tZ${zoneNumber} Ph. Delay`, `distance.zone${zoneNumber}.phase_delay`, zone.timeDelayPpS, "s");
    push(`tZ${zoneNumber} Gnd. Delay`, `distance.zone${zoneNumber}.ground_delay`, zone.timeDelayPeS, "s");
    push(`Z${zoneNumber} Ph. Angle`, `distance.zone${zoneNumber}.phase_angle`, zone.lineAngleDeg, "deg");
  });
  if (parsed.earthComp) {
    push("K0 magnitude", "distance.k0.magnitude", parsed.earthComp.k0);
    push("K0 angle", "distance.k0.angle", parsed.earthComp.angleDeg, "deg");
    const radians = (parsed.earthComp.angleDeg * Math.PI) / 180;
    push("K0 real", "distance.k0.real", parsed.earthComp.k0 * Math.cos(radians));
    push("K0 imag", "distance.k0.imag", parsed.earthComp.k0 * Math.sin(radians));
  }
  if (parsed.ctRatio !== undefined) {
    push("CT ratio", "instrument_transformer.ct_ratio", parsed.ctRatio);
  }
  if (parsed.vtRatio !== undefined) {
    push("VT ratio", "instrument_transformer.vt_ratio", parsed.vtRatio);
  }
  const diagnostics: VendorImportDiagnostic[] = [{
    level: "info",
    message: `${parsed.zones.length} distance zone dibaca dari ${parsed.kind.toUpperCase()}.`,
  }];
  if (parsed.zones.length === 0) diagnostics.push({
    level: "warning",
    message: "Struktur file dikenali, tetapi tidak ada distance zone yang dapat dipromosikan.",
  });
  return buildResult({
    adapterId: "rio-xrio-v1",
    sourceFileName,
    sourceFormat: parsed.kind === "xrio" ? "XRIO XML" : "RIO plaintext",
    vendor,
    family: model ?? "Distance protection",
    model,
    metadata: {
      zoneCount: String(parsed.zones.length),
      ...(parsed.ctRatio !== undefined ? { ctRatio: String(parsed.ctRatio) } : {}),
      ...(parsed.vtRatio !== undefined ? { vtRatio: String(parsed.vtRatio) } : {}),
    },
    parameters,
    diagnostics,
    totalRecords: parameters.length,
  });
}

const HEADER_KEYS = [
  "APP",
  "TYPE",
  "FORMAT",
  "MODEL",
  "S1_LANG",
  "Created by",
] as const;

const UNIT_BY_CODE: Record<number, string> = {
  0x00: "x In",
  0x02: "deg",
  0x03: "ohm",
  0x07: "m",
  0x08: "s",
};

const CANONICAL_RULES: Array<{
  pattern: RegExp;
  key: (match: RegExpMatchArray) => string;
  group: string;
}> = [
  {
    pattern: /^Z([1-6]) Ph\. Reach$/i,
    key: (match) => `distance.zone${match[1]}.phase_reach`,
    group: "Distance",
  },
  {
    pattern: /^Z([1-6]) Gnd\. Reach$/i,
    key: (match) => `distance.zone${match[1]}.ground_reach`,
    group: "Distance",
  },
  {
    pattern: /^tZ([1-6]) Ph\. Delay$/i,
    key: (match) => `distance.zone${match[1]}.phase_delay`,
    group: "Distance",
  },
  {
    pattern: /^tZ([1-6]) Gnd\. Delay$/i,
    key: (match) => `distance.zone${match[1]}.ground_delay`,
    group: "Distance",
  },
  {
    pattern: /^Z([1-6]) Ph\. Angle$/i,
    key: (match) => `distance.zone${match[1]}.phase_angle`,
    group: "Distance",
  },
  {
    pattern: /^Z([1-6]) Gnd\. Angle$/i,
    key: (match) => `distance.zone${match[1]}.ground_angle`,
    group: "Distance",
  },
  {
    pattern: /^Load Blinders$/i,
    key: () => "distance.load_blinder.enabled",
    group: "Load encroachment",
  },
  {
    pattern: /^Line Length$/i,
    key: () => "line.length",
    group: "Line data",
  },
  {
    pattern: /^Line Impedance$/i,
    key: () => "line.positive_sequence_impedance",
    group: "Line data",
  },
  {
    pattern: /^Line Angle$/i,
    key: () => "line.positive_sequence_angle",
    group: "Line data",
  },
  {
    pattern: /^Phase Is([12])$/i,
    key: (match) => `overcurrent.phase.stage${match[1]}.pickup`,
    group: "Overcurrent",
  },
  {
    pattern: /^(?:Earth|Gnd) Is([12])$/i,
    key: (match) => `overcurrent.earth.stage${match[1]}.pickup`,
    group: "Earth fault",
  },
  {
    pattern: /^PowerSwing Block$/i,
    key: () => "distance.power_swing_blocking",
    group: "Power swing",
  },
];

/**
 * Decode a MiCOM S1 Courier setting file locally.
 *
 * The format contains a readable Courier header followed by fixed-width
 * records. Numeric values are stored as signed mantissa + decimal exponent:
 * value = mantissa * 10^(exponentByte - 126).
 */
export function parseMicomCourierSet(
  bytes: Uint8Array,
  sourceFileName: string
): VendorImportResult {
  const headerText = decodeLatin1(bytes.subarray(0, Math.min(bytes.length, 2048)));
  const metadata = parseHeader(headerText);
  const diagnostics: VendorImportDiagnostic[] = [];

  if (!/APP:\s*Courier/i.test(headerText) || !/TYPE:\s*Setting/i.test(headerText)) {
    diagnostics.push({
      level: "error",
      message:
        "Signature APP: Courier / TYPE: Setting tidak ditemukan. File tidak diproses sebagai MiCOM Courier.",
    });
    return buildResult({
      adapterId: "micom-courier-v1",
      sourceFileName,
      sourceFormat: "Unknown binary",
      vendor: "Belum terdeteksi",
      family: "Unknown",
      model: metadata.MODEL,
      metadata,
      parameters: [],
      diagnostics,
      totalRecords: 0,
    });
  }

  const parameters: VendorImportParameter[] = [];
  let totalRecords = 0;

  for (let marker = 8; marker + 22 < bytes.length; marker += 1) {
    if (bytes[marker] !== 0x18 || bytes[marker + 1] !== 0x13) continue;
    const labelBytes = bytes.subarray(marker + 2, marker + 19);
    if (!isPrintableLabel(labelBytes)) continue;
    const rawName = decodeLatin1(labelBytes).trim();
    const formatOffset = marker + 19;
    if (bytes[formatOffset] !== 0x25) continue;

    totalRecords += 1;
    const address = decodeCourierAddress(bytes, marker);
    const format = String.fromCharCode(bytes[formatOffset + 1] ?? 0);
    const canonical = canonicalFor(rawName);

    if (
      format === "k" &&
      bytes[formatOffset + 2] === 0x2c &&
      bytes[formatOffset + 3] === 0x04
    ) {
      const mantissa = readInt16LE(bytes, formatOffset + 4);
      const exponentByte = bytes[formatOffset + 6];
      const unitCode = bytes[formatOffset + 7];
      const numeric = roundDecimal(
        mantissa * 10 ** (exponentByte - 126)
      );
      parameters.push({
        address,
        rawName,
        canonicalKey: canonical?.key,
        functionGroup: canonical?.group ?? inferFunctionGroup(rawName),
        value: numeric,
        unit: UNIT_BY_CODE[unitCode],
        rawValue: `${mantissa} × 10^${exponentByte - 126}`,
        decodeStatus: "decoded",
        confidence: canonical ? "high" : "review",
      });
      marker = formatOffset + 7;
      continue;
    }

    if (format === "s" && bytes[formatOffset + 2] === 0x50) {
      const selectedIndex = readUint16LE(bytes, formatOffset + 4);
      const choices = readEnumChoices(bytes, formatOffset + 3);
      const selected = choices[selectedIndex];
      parameters.push({
        address,
        rawName,
        canonicalKey: canonical?.key,
        functionGroup: canonical?.group ?? inferFunctionGroup(rawName),
        value: selected ?? `Enum ${selectedIndex}`,
        rawValue: `index=${selectedIndex}${
          choices.length ? `; choices=${choices.join(" | ")}` : ""
        }`,
        decodeStatus: selected ? "decoded" : "review",
        confidence: selected && canonical ? "high" : "review",
      });
      marker = formatOffset + 6;
    }
  }

  if (parameters.length === 0) {
    diagnostics.push({
      level: "error",
      message: "Header dikenali, tetapi belum ada record setting yang dapat didekode.",
    });
  } else {
    diagnostics.push({
      level: "info",
      message: `${parameters.length} record nilai berhasil dibaca dari struktur Courier.`,
    });
  }
  if (parameters.some((parameter) => parameter.confidence === "review")) {
    diagnostics.push({
      level: "warning",
      message:
        "Parameter tanpa canonical key tetap dipertahankan sebagai raw setting untuk review dan perluasan library.",
    });
  }

  return buildResult({
    adapterId: "micom-courier-v1",
    sourceFileName,
    sourceFormat: `MiCOM Courier ${metadata.FORMAT ?? "1.x"}`,
    vendor: "MiCOM / Schneider",
    family: inferMicomFamily(metadata.MODEL),
    model: metadata.MODEL,
    metadata,
    parameters,
    diagnostics,
    totalRecords,
  });
}

export function adaptTapPdfFields(
  fields: TapExtractedField[],
  sourceFileName: string,
  extractedText = ""
): VendorImportResult {
  const parameters = fields.map((field): VendorImportParameter => {
    const canonical = canonicalFor(field.field);
    const numeric = parseNumeric(field.value);
    return {
      rawName: field.field,
      canonicalKey: canonical?.key,
      functionGroup: canonical?.group ?? inferFunctionGroup(field.field),
      value: numeric ?? field.value,
      unit: field.unit,
      rawValue: field.value,
      decodeStatus: "decoded",
      confidence: canonical ? "high" : "review",
    };
  });
  const model = extractedText.match(/\b(P(?:44[2345]|54[345])\w*|7S[AJUT]\d+\w*)\b/i)?.[1];
  const vendor = /SIPROTEC|DIGSI|7S[AJUT]/i.test(extractedText)
    ? "Siemens / SIPROTEC"
    : /MiCOM|P(?:44[2345]|54[345])/i.test(extractedText)
      ? "MiCOM / Schneider"
      : "Document / belum terdeteksi";
  const diagnostics: VendorImportDiagnostic[] = [
    {
      level: "info",
      message: `${fields.length} field dikenali dari hasil ekstraksi TAP PDF.`,
    },
  ];
  if (fields.length === 0) {
    diagnostics.push({
      level: "warning",
      message:
        "Tidak ada field setting yang dikenali. Periksa kualitas scan atau tambahkan document profile.",
    });
  }

  return buildResult({
    adapterId: "tap-pdf-profile-v1",
    sourceFileName,
    sourceFormat: "TAP PDF normalized fields",
    vendor,
    family: model ?? "TAP document",
    model,
    metadata: {},
    parameters,
    diagnostics,
    totalRecords: fields.length,
  });
}

export function vendorImportToVerificationText(result: VendorImportResult) {
  const transferable = result.parameters.filter((parameter) =>
    /^(Z[1-3] (?:Ph\. Reach|Ph\. Delay)|tZ[1-3] Ph\. Delay|K0 (?:real|imag)|Ip>? (?:Pickup|Time Dial)|IEp>? (?:Pickup|Time Dial))$/i.test(
      parameter.rawName
    )
  );
  const parameters = transferable.length > 0 ? transferable : result.parameters;
  return [
    `# Imported by ${result.adapterId}`,
    `# Source=${result.sourceFileName}`,
    `# Model=${result.model ?? "unknown"}`,
    ...parameters.map(
      (parameter) =>
        `${parameter.rawName}=${parameter.value}${
          parameter.unit ? ` ${parameter.unit}` : ""
        }`
    ),
  ].join("\n");
}

function buildResult(input: {
  adapterId: VendorImportAdapterId;
  sourceFileName: string;
  sourceFormat: string;
  vendor: string;
  family: string;
  model?: string;
  metadata: Record<string, string>;
  parameters: VendorImportParameter[];
  diagnostics: VendorImportDiagnostic[];
  totalRecords: number;
}): VendorImportResult {
  return {
    schema: "plms.vendor-import.v1",
    adapterId: input.adapterId,
    sourceFileName: input.sourceFileName,
    sourceFormat: input.sourceFormat,
    vendor: input.vendor,
    family: input.family,
    model: input.model,
    metadata: input.metadata,
    parameters: input.parameters,
    diagnostics: input.diagnostics,
    coverage: {
      totalRecords: input.totalRecords,
      decodedRecords: input.parameters.filter(
        (parameter) => parameter.decodeStatus === "decoded"
      ).length,
      canonicalRecords: input.parameters.filter(
        (parameter) => parameter.canonicalKey
      ).length,
      reviewRecords: input.parameters.filter(
        (parameter) =>
          parameter.decodeStatus === "review" ||
          parameter.confidence === "review"
      ).length,
    },
  };
}

function parseHeader(text: string) {
  const metadata: Record<string, string> = {};
  HEADER_KEYS.forEach((key) => {
    const match = text.match(
      new RegExp(`^${escapeRegExp(key)}\\s*:\\s*([^\\r\\n]+)`, "im")
    );
    if (match) metadata[key] = match[1].trim();
  });
  return metadata;
}

function canonicalFor(rawName: string) {
  for (const rule of CANONICAL_RULES) {
    const match = rawName.match(rule.pattern);
    if (match) return { key: rule.key(match), group: rule.group };
  }
  return undefined;
}

function inferFunctionGroup(rawName: string) {
  if (/\b(?:Z[1-6]|distance|mho|quadrilateral)\b/i.test(rawName))
    return "Distance";
  if (/blind|load encroach/i.test(rawName)) return "Load encroachment";
  if (/power.?swing/i.test(rawName)) return "Power swing";
  if (/phase|overcurrent|I>|Is\d/i.test(rawName)) return "Overcurrent";
  if (/earth|ground|gnd|IE>/i.test(rawName)) return "Earth fault";
  if (/autoreclose|reclose|AR\b/i.test(rawName)) return "Autoreclose";
  if (/line length|line impedance|line angle/i.test(rawName)) return "Line data";
  if (/CT|VT|ratio/i.test(rawName)) return "Instrument transformer";
  if (/opt[o-]?|logic|DDB|PSL/i.test(rawName)) return "Logic";
  return "Other";
}

function decodeCourierAddress(bytes: Uint8Array, marker: number) {
  if (marker < 8) return undefined;
  const ordinal = bytes[marker - 8];
  const groupLow = bytes[marker - 7];
  const groupHigh = bytes[marker - 6];
  if (
    groupLow < 0x20 ||
    groupLow > 0x7e ||
    groupHigh < 0x20 ||
    groupHigh > 0x7e
  ) {
    return undefined;
  }
  return `${String.fromCharCode(groupHigh)}${String.fromCharCode(
    groupLow
  )}${ordinal.toString(16).padStart(2, "0").toUpperCase()}`;
}

function readEnumChoices(bytes: Uint8Array, start: number) {
  let cursor = start;
  let separators = 0;
  while (cursor + 1 < bytes.length && cursor - start < 96) {
    if (bytes[cursor] === 0xff && bytes[cursor + 1] === 0x00) {
      separators += 1;
      cursor += 2;
      if (separators === 3) break;
      continue;
    }
    cursor += 1;
  }
  if (separators !== 3) return [];

  const choices: string[] = [];
  while (cursor < bytes.length && choices.length < 128) {
    if (
      cursor + 9 < bytes.length &&
      bytes[cursor + 8] === 0x18 &&
      bytes[cursor + 9] === 0x13
    ) {
      break;
    }
    let end = cursor;
    while (end < bytes.length && bytes[end] !== 0x00 && end - cursor <= 64)
      end += 1;
    if (end - cursor > 0 && end - cursor <= 64) {
      const candidate = decodeLatin1(bytes.subarray(cursor, end)).trim();
      if (/^[\x20-\x7e]+$/.test(candidate)) choices.push(candidate);
    }
    cursor = end + 1;
    if (
      cursor + 8 < bytes.length &&
      bytes[cursor + 7] === 0x18 &&
      bytes[cursor + 8] === 0x13
    ) {
      break;
    }
  }
  return choices;
}

function inferMicomFamily(model?: string) {
  const match = model?.match(/^(P\d{3})/i);
  return match?.[1]?.toUpperCase() ?? "MiCOM";
}

function isPrintableLabel(bytes: Uint8Array) {
  if (bytes.length !== 17) return false;
  let nonSpace = 0;
  for (const byte of bytes) {
    if (byte < 0x20 || byte > 0x7e) return false;
    if (byte !== 0x20) nonSpace += 1;
  }
  return nonSpace >= 2;
}

function readInt16LE(bytes: Uint8Array, offset: number) {
  const value = readUint16LE(bytes, offset);
  return value > 0x7fff ? value - 0x10000 : value;
}

function readUint16LE(bytes: Uint8Array, offset: number) {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function roundDecimal(value: number) {
  if (!Number.isFinite(value)) return value;
  return Number(value.toPrecision(12));
}

function parseNumeric(value: string) {
  const match = value.replace(",", ".").match(/[-+]?\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function decodeLatin1(bytes: Uint8Array) {
  return new TextDecoder("latin1").decode(bytes);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
