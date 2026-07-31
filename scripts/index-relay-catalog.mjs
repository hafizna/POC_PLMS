import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const inputPath =
  process.argv[2] ??
  "C:/Users/hafizna.fadhli/Downloads/Data Setting Penghantar UPT DKSBI (1).xlsx";
const outputPath = path.resolve(
  "src/domain/generated/relay-catalog.json"
);

const SHEET_PROFILES = [
  {
    sheet: "LCD",
    startRow: 8,
    columns: {
      id: 0, ultg: 2, station: 3, bay: 4, circuit: 5, role: 8,
      brand: 11, model: 12, serial: 13, technology: 14, year: 15,
    },
    functions: ["line-current-differential"],
  },
  {
    sheet: "DIST",
    startRow: 9,
    columns: {
      id: 0, ultg: 2, station: 3, bay: 4, circuit: 5, role: 8,
      brand: 11, model: 12, serial: 13, technology: 14, year: 15,
    },
    functions: ["distance"],
  },
  {
    sheet: "OCR_PHT",
    startRow: 7,
    columns: {
      id: 0, ultg: 2, station: 3, bay: 4, circuit: 5,
      brand: 9, model: 10, serial: 11, technology: 12, year: 13,
    },
    fixedRole: "BPU",
    functions: ["overcurrent", "earth-fault"],
  },
  {
    sheet: "AR",
    startRow: 7,
    columns: {
      id: 0, ultg: 2, station: 3, bay: 4, circuit: 5, role: 6,
      brand: 9, model: 10, serial: 11, technology: 12, year: 13,
    },
    functions: ["autoreclose"],
  },
  {
    sheet: "SYNCHRO",
    startRow: 6,
    columns: {
      id: 0, ultg: 2, station: 3, bay: 4, circuit: 5, role: 7,
      brand: 8, model: 9, serial: 10, technology: 11, year: 12,
    },
    functions: ["synchro-check"],
  },
  {
    sheet: "DIFF Pilot",
    startRow: 6,
    columns: {
      ultg: 4, station: 5, bay: 6, circuit: 7,
      brand: 9, model: 10, serial: 11, technology: 12, year: 13,
    },
    fixedRole: "Pilot differential",
    functions: ["pilot-differential"],
  },
  {
    sheet: "OCR_KOPEL",
    startRow: 8,
    columns: {
      id: 0, ultg: 2, station: 3, bay: 4, circuit: 5,
      brand: 12, model: 13, serial: 14, technology: 15, year: 16,
    },
    fixedRole: "Kopel protection",
    functions: ["overcurrent", "earth-fault"],
  },
  {
    sheet: "BUSPRO",
    startRow: 6,
    columns: {
      ultg: 2, station: 3, role: 4,
      brand: 7, model: 8, serial: 9, technology: 11, year: 12,
    },
    fixedBay: "BUSPRO",
    functions: ["busbar-protection"],
  },
  {
    sheet: "KAPASITOR",
    startRow: 7,
    columns: {
      ultg: 5, station: 6, bay: 7, circuit: 8,
      brand: 12, model: 13, serial: 14, technology: 15, year: 16,
    },
    fixedRole: "Capacitor protection",
    functions: ["overcurrent", "earth-fault", "capacitor-protection"],
  },
  {
    sheet: "CBF",
    startRow: 6,
    columns: {
      ultg: 6, station: 7, bay: 8, circuit: 9, role: 11,
      brand: 14, model: 15, serial: 16, technology: 17, year: 18,
    },
    functions: ["breaker-failure"],
  },
  {
    sheet: "CCP",
    startRow: 6,
    columns: {
      ultg: 4, station: 5, bay: 6, circuit: 7, role: 8,
      brand: 11, model: 12, serial: 13, technology: 14, year: 15,
    },
    functions: ["circuit-current-protection"],
  },
  {
    sheet: "SZP",
    startRow: 6,
    columns: {
      ultg: 7, station: 8, bay: 9, circuit: 10, role: 12,
      brand: 15, model: 16, serial: 17, technology: 18, year: 19,
    },
    functions: ["stub-zone-protection"],
  },
];

if (!fs.existsSync(inputPath)) {
  throw new Error(`Workbook tidak ditemukan: ${inputPath}`);
}

const workbook = XLSX.readFile(inputPath, {
  cellFormula: true,
  cellDates: true,
});
const sourceStat = fs.statSync(inputPath);
const occurrences = [];

for (const profile of SHEET_PROFILES) {
  const sheet = workbook.Sheets[profile.sheet];
  if (!sheet) continue;
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: false,
  });
  for (let index = profile.startRow - 1; index < rows.length; index += 1) {
    const row = rows[index];
    const rawModel = valueAt(row, profile.columns.model);
    const rawBrand = valueAt(row, profile.columns.brand);
    const rawStation = valueAt(row, profile.columns.station);
    if (
      !rawModel ||
      !rawBrand ||
      !rawStation ||
      isPlaceholder(rawModel) ||
      !/[a-z]/i.test(`${rawModel}${rawBrand}${rawStation}`)
    )
      continue;

    const rawBay =
      profile.fixedBay ?? valueAt(row, profile.columns.bay) ?? profile.sheet;
    const circuit = normalizeCircuit(valueAt(row, profile.columns.circuit));
    const serial = normalizeSerial(valueAt(row, profile.columns.serial));
    const model = normalizeModel(rawModel);
    const brand = normalizeBrand(rawBrand, model);
    const stationNormalized = normalizeStation(rawStation);
    const bayNormalized = normalizeBay(rawBay);
    const bayKind = classifyBay(rawBay, profile.sheet);
    const role =
      profile.fixedRole ??
      valueAt(row, profile.columns.role) ??
      inferRole(profile.sheet);

    occurrences.push({
      id: valueAt(row, profile.columns.id) ?? undefined,
      ultg: valueAt(row, profile.columns.ultg) ?? "Unknown",
      stationRaw: rawStation,
      stationNormalized,
      bayRaw: rawBay,
      bayNormalized,
      circuit,
      bayKind,
      brandRaw: rawBrand,
      brand,
      modelRaw: rawModel,
      model,
      serial,
      technology: normalizeTechnology(
        valueAt(row, profile.columns.technology)
      ),
      operationYear: parseYear(valueAt(row, profile.columns.year)),
      role,
      functions: profile.functions,
      sourceSheet: profile.sheet,
      sourceRow: index + 1,
    });
  }
}

const assetsByKey = new Map();
for (const occurrence of occurrences) {
  const key = assetKey(occurrence);
  const existing = assetsByKey.get(key);
  if (!existing) {
    assetsByKey.set(key, {
      assetId: `relay_${stableSlug(key)}`,
      ultg: occurrence.ultg,
      stationRaw: occurrence.stationRaw,
      stationNormalized: occurrence.stationNormalized,
      bayRaw: occurrence.bayRaw,
      bayNormalized: occurrence.bayNormalized,
      circuit: occurrence.circuit,
      bayKind: occurrence.bayKind,
      brand: occurrence.brand,
      brandRaw: occurrence.brandRaw,
      model: occurrence.model,
      modelRaw: occurrence.modelRaw,
      serial: occurrence.serial,
      technology: occurrence.technology,
      operationYear: occurrence.operationYear,
      roles: unique([occurrence.role]),
      functions: unique(occurrence.functions),
      sourceRefs: [
        {
          sheet: occurrence.sourceSheet,
          row: occurrence.sourceRow,
        },
      ],
    });
    continue;
  }
  existing.roles = unique([...existing.roles, occurrence.role]);
  existing.functions = unique([...existing.functions, ...occurrence.functions]);
  existing.sourceRefs.push({
    sheet: occurrence.sourceSheet,
    row: occurrence.sourceRow,
  });
  if (!existing.operationYear && occurrence.operationYear)
    existing.operationYear = occurrence.operationYear;
  if (!existing.technology && occurrence.technology)
    existing.technology = occurrence.technology;
}

const assets = Array.from(assetsByKey.values()).sort((a, b) =>
  `${a.ultg}|${a.stationNormalized}|${a.bayNormalized}|${a.model}`.localeCompare(
    `${b.ultg}|${b.stationNormalized}|${b.bayNormalized}|${b.model}`
  )
);

const crosscheck = JSON.parse(
  fs.readFileSync(
    path.resolve("src/domain/generated/crosscheck-workbook-registry.json"),
    "utf8"
  )
);
const lineRecords = crosscheck.digsilentLineDb?.records ?? [];
for (const asset of assets) {
  asset.digsilentMatch = matchDigsilent(asset, lineRecords);
}

const modelMap = new Map();
for (const asset of assets) {
  const key = `${asset.brand}|${asset.model}`;
  const entry = modelMap.get(key) ?? {
    brand: asset.brand,
    model: asset.model,
    assetCount: 0,
    stationCount: 0,
    bayKinds: [],
    functions: [],
    technologies: [],
    operationYears: [],
  };
  entry.assetCount += 1;
  entry.bayKinds = unique([...entry.bayKinds, asset.bayKind]);
  entry.functions = unique([...entry.functions, ...asset.functions]);
  entry.technologies = unique([
    ...entry.technologies,
    ...(asset.technology ? [asset.technology] : []),
  ]);
  entry.operationYears = unique([
    ...entry.operationYears,
    ...(asset.operationYear ? [asset.operationYear] : []),
  ]).sort();
  modelMap.set(key, entry);
}
for (const entry of modelMap.values()) {
  entry.stationCount = new Set(
    assets
      .filter(
        (asset) => asset.brand === entry.brand && asset.model === entry.model
      )
      .map((asset) => asset.stationNormalized)
  ).size;
}
const modelCatalog = Array.from(modelMap.values()).sort(
  (a, b) => b.assetCount - a.assetCount || a.model.localeCompare(b.model)
);

const summary = {
  sourceWorkbook: path.basename(inputPath),
  sourceLastModified: sourceStat.mtime.toISOString(),
  sourceSheets: SHEET_PROFILES.map((profile) => profile.sheet),
  occurrenceCount: occurrences.length,
  assetCount: assets.length,
  modelCount: modelCatalog.length,
  ultgCount: new Set(assets.map((asset) => asset.ultg)).size,
  stationCount: new Set(assets.map((asset) => asset.stationNormalized)).size,
  withSerialCount: assets.filter((asset) => asset.serial).length,
  digsilentMatchedCount: assets.filter(
    (asset) => asset.digsilentMatch.status === "matched"
  ).length,
  digsilentCandidateCount: assets.filter(
    (asset) => asset.digsilentMatch.status === "candidate"
  ).length,
};

const payload = {
  schema: "plms.relay-catalog.v1",
  summary,
  modelCatalog,
  assets,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
console.log(
  `Indexed ${summary.assetCount} relay assets / ${summary.modelCount} models from ${summary.sourceSheets.length} sheets.`
);
console.log(
  `DIgSILENT: ${summary.digsilentMatchedCount} matched, ${summary.digsilentCandidateCount} candidates.`
);
console.log(`Wrote ${outputPath}`);

function valueAt(row, index) {
  if (index === undefined) return null;
  const value = row?.[index];
  if (value === null || value === undefined) return null;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized || null;
}

function isPlaceholder(value) {
  return /^(-|N\/?A|NONE|TIDAK ADA|BELUM ADA|0)$/i.test(value.trim());
}

function normalizeBrand(value, model) {
  const raw = value.toUpperCase().replace(/\s+/g, " ").trim();
  if (/^NR\b|NANJING|NARI/.test(raw)) return "NR Electric";
  if (/SIEMENS/.test(raw) || /^7[A-Z]/.test(model)) return "Siemens";
  if (/ABB/.test(raw)) return "ABB";
  if (/GE|GENERAL ELECTRIC/.test(raw)) return "GE";
  if (/SEL/.test(raw)) return "SEL";
  if (/SCHNEIDER|AREVA|ALSTOM|GEC/.test(raw) || /MICOM/.test(model))
    return "MiCOM / Schneider";
  return titleCase(value);
}

function normalizeModel(value) {
  const raw = value
    .toUpperCase()
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const micom = raw.match(/(?:MICOM\s*)?(P\d{3})\b/);
  if (micom) return `MiCOM ${micom[1]}`;
  const micomP14d = raw.match(/(?:MICOM\s*)?(P14D)\b/);
  if (micomP14d) return "MiCOM P14D";
  const pcs = raw.match(/\bPCS[- ]?(\d{3,4}[A-Z]?)\b/);
  if (pcs) return `PCS-${pcs[1]}`;
  const relion = raw.match(/\b(RED|REF|REL|RET|REB)\s*(\d{3})\b/);
  if (relion) return `${relion[1]}${relion[2]}`;
  const toshiba = raw.match(/\b(GRL)\s*(\d{3})\b/);
  if (toshiba) return `${toshiba[1]}${toshiba[2]}`;
  const legacy = raw.match(/\b(MCAG|MCGG|LFAA|KAVR|MVTR)\s*0?(\d+)\b/);
  if (legacy) return `${legacy[1]} ${legacy[2]}`;
  const siprotec = raw.match(/\b(7[A-Z]{2}\d{2}[A-Z0-9-]*)\b/);
  if (siprotec) return siprotec[1];
  return titleCase(raw);
}

function normalizeSerial(value) {
  if (!value || /^(-|N\/?A|NONE|BELUM ADA|0)$/i.test(value)) return null;
  return value.replace(/\s+/g, " ").trim();
}

function normalizeTechnology(value) {
  if (!value) return null;
  if (/NUMER/i.test(value)) return "Numerical";
  if (/ELEKTRO|ELECTRO/i.test(value)) return "Electromechanical";
  if (/STATIC/i.test(value)) return "Static";
  return titleCase(value);
}

function parseYear(value) {
  const match = value?.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function normalizeStation(value) {
  return value
    .toLowerCase()
    .replace(/([a-z])[57]\b/g, "$1")
    .replace(/\b(?:150|500)\s*kv\b/g, " ")
    .replace(/\b(?:trs-\d+(?:\.\d+)?|gi(?:s|tet)?|gardu induk|kv)\b/g, " ")
    .replace(/\b(?:150|500)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBay(value) {
  return value
    .toLowerCase()
    .replace(/\b(?:150|500)\s*kv\b/g, " ")
    .replace(/\b(?:trs-\d+(?:\.\d+)?-b\d+|pht|kv|bay)\b/g, " ")
    .replace(/\b(?:150|500)\b/g, " ")
    .replace(/#\s*(\d+)/g, " $1 ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCircuit(value) {
  if (!value) return null;
  const match = value.match(/(?:#|sirkit\s*)?([12])\b/i);
  return match?.[1] ?? value.replace(/\s+/g, " ").trim();
}

function classifyBay(value, sheet) {
  const raw = `${value} ${sheet}`.toUpperCase();
  if (/KOPEL/.test(raw)) return "bus-coupler";
  if (/KAPASITOR/.test(raw)) return "capacitor";
  if (/BUSPRO/.test(raw)) return "busbar";
  if (/IBT|TRAFO|TRANSFORMER/.test(raw)) return "transformer";
  if (/PHT|PENGHANTAR|DIFF PILOT|DIST|LCD/.test(raw)) return "line";
  if (/DIAMETER|CUT OFF|CBF|CCP|SZP/.test(raw)) return "breaker-system";
  return "other";
}

function inferRole(sheet) {
  if (sheet === "LCD" || sheet === "DIST") return "MPU";
  if (sheet === "OCR_PHT") return "BPU";
  return sheet;
}

function assetKey(asset) {
  if (asset.serial) return `serial|${normalizeToken(asset.serial)}`;
  return [
    "logical",
    asset.stationNormalized,
    asset.bayNormalized,
    asset.circuit ?? "",
    asset.model,
    normalizeToken(asset.role),
  ].join("|");
}

function stableSlug(value) {
  const cleaned = normalizeToken(value).slice(0, 90);
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${cleaned}_${(hash >>> 0).toString(36)}`;
}

function matchDigsilent(asset, records) {
  if (asset.bayKind !== "line") {
    return {
      status: "not-applicable",
      confidence: 0,
      candidates: [],
      reason: "DIgSILENT line database hanya digunakan untuk bay penghantar.",
    };
  }
  const local = stationAliases(asset.stationNormalized);
  const remote = stationAliases(remoteFromBay(asset.bayNormalized));
  const circuit = asset.circuit;
  const scored = [];
  for (const record of records) {
    const from = stationAliases(normalizeStation(record.fromSubstation));
    const to = stationAliases(normalizeStation(record.toSubstation));
    const localAtFrom = overlaps(local, from);
    const localAtTo = overlaps(local, to);
    if (!localAtFrom && !localAtTo) continue;
    const opposite = localAtFrom ? to : from;
    let score = 0.55;
    const reasons = ["local station"];
    if (remote.size && overlaps(remote, opposite)) {
      score += 0.35;
      reasons.push("remote endpoint");
    }
    if (circuit && circuitFromRecord(record) === circuit) {
      score += 0.1;
      reasons.push("circuit");
    }
    scored.push({
      row: record.row,
      name: record.name,
      score: Number(Math.min(score, 1).toFixed(2)),
      reasons,
    });
  }
  scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const candidates = scored.slice(0, 3);
  const best = candidates[0];
  const unambiguous =
    best &&
    best.score >= 0.9 &&
    (!candidates[1] || best.score > candidates[1].score);
  return {
    status: unambiguous ? "matched" : best ? "candidate" : "unmatched",
    confidence: best?.score ?? 0,
    matchedRow: unambiguous ? best.row : undefined,
    matchedName: unambiguous ? best.name : undefined,
    candidates,
    reason: unambiguous
      ? best.reasons.join(" + ")
      : best
        ? "Perlu review karena kandidat masih ambigu."
        : "Tidak ada endpoint lokal pada DIgSILENT line database.",
  };
}

function remoteFromBay(value) {
  return value
    .replace(/\b(?:bus|kopel|kapasitor|sc|line|pht)\b/g, " ")
    .replace(/\b[12]\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stationAliases(value) {
  const normalized = normalizeStation(value);
  const aliases = new Set([normalized]);
  const table = {
    "durikosambi": ["dksbi", "dks"],
    "daan mogot": ["dnmgt", "dm"],
    "pantai indah kapuk": ["pinka", "pik"],
    "muarakarang baru": ["mkrbu", "mkb", "mb"],
    "muarakarang lama": ["mkrla", "mkl"],
    "muarakarang": ["mkr"],
    "kebon jeruk": ["kbjer", "kbj"],
    "new senayan": ["senay", "nsy"],
    "kembangan": ["kmbng", "kmb"],
    // Confirmed 2026-07-31 against MASTER_PHT's REAL/ALIAS station-name
    // columns + direct digsilentLineDb lookup (same source graph-builder.ts
    // anchors against) — these are genuinely different spellings of the
    // same physical site, not abbreviations to guess at:
    //  - "karet" alone is DIgSILENT's name for "Karet Lama" (a distinct
    //    neighboring site, "Karet Baru", has its own separate code) — same
    //    pattern already fixed in graph-builder.ts's SHORTCODE_OVERRIDE.
    //  - "grogol ii" is DIgSILENT's name for "Grogol Baru" — confirmed same
    //    physical site, already aliased in graph-builder.ts's
    //    DIGSILENT_TO_SLD_ALIAS but never ported to this independent
    //    matcher (same gap class as the Karet fix).
    //  - "cengkareng"/"tangerang" alone (no qualifier) are DIgSILENT's names
    //    for the "Lama" site, distinguishing them from "Cengkareng Baru"/
    //    "Tangerang Baru" which keep their own separate codes.
    "karet lama": ["karet"],
    "grogol baru": ["grogol ii"],
    "cengkareng": ["cengkareng lama"],
    "tangerang": ["tangerang lama"],
  };
  for (const [canonical, values] of Object.entries(table)) {
    if (normalized === canonical || values.includes(normalized)) {
      aliases.add(canonical);
      values.forEach((item) => aliases.add(item));
    }
  }
  return aliases;
}

function circuitFromRecord(record) {
  // The record's own name suffix ("ANGKE-ANCOL -1" / "-2") is the reliable
  // signal: it directly names which parallel circuit this is. Terminal codes
  // (fromTerminal/toTerminal, e.g. "I-5"/"II-5") are bus/bay position labels,
  // NOT circuit numbers — "II" is a Roman numeral for terminal 2, not circuit
  // 2, and both circuits of a parallel pair commonly share the same terminal
  // codes at each end (confirmed: ANGKE-ANCOL -1 and -2 both run I-5/II-5).
  // Falling back to terminal-based guessing when the name has no suffix
  // previously misclassified 40/218 name-suffixed records (~18%) by matching
  // "II-5" as circuit "2" regardless of the record's real circuit.
  const name = record.name ?? "";
  const nameMatch = name.match(/-\s*([12])\s*$/);
  if (nameMatch) return nameMatch[1];
  // Some pairs use a trailing Roman numeral instead of an arabic digit as
  // the SAME kind of name-suffix circuit marker — confirmed real case:
  // "DKSBI-GGLII I" / "DKSBI-GGLII II" (both circuits Roman), and even a
  // MIXED pair "GRGOL-GGLII 1" (arabic) / "GRGOL-GGLII II" (Roman) for the
  // same two physical circuits. Must be anchored at the end of the name
  // (not just "contains II" — many station codes themselves contain "II",
  // e.g. "GGLII" = Grogol II's own station code) so this doesn't misfire on
  // the station-code token itself.
  const romanNameMatch = name.match(/\s(I|II)\s*$/);
  if (romanNameMatch) return romanNameMatch[1] === "II" ? "2" : "1";
  const terminal = `${record.fromTerminal ?? ""} ${record.toTerminal ?? ""}`;
  if (/(?:^|[-\s])2(?:$|[-\s])|II-?5/i.test(terminal)) return "2";
  if (/(?:^|[-\s])1(?:$|[-\s])|I-?5/i.test(terminal)) return "1";
  return null;
}

function overlaps(left, right) {
  for (const item of left) if (right.has(item)) return true;
  return false;
}

function normalizeToken(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function titleCase(value) {
  return String(value)
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
