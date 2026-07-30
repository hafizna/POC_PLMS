import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const downloadDir = path.join(process.env.USERPROFILE ?? "", "Downloads");
const DEFAULT_INPUT =
  [
    path.join(downloadDir, "Data Setting Penghantar UPT DKSBI (1).xlsx"),
    path.join(downloadDir, "Data Setting Penghantar UPT DKSBI.xlsx"),
  ].find((candidate) => fs.existsSync(candidate)) ??
  path.join(downloadDir, "Data Setting Penghantar UPT DKSBI.xlsx");

const inputPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_INPUT;
const outputPath = path.resolve(
  process.cwd(),
  "src",
  "domain",
  "generated",
  "ocr-registry.json"
);

if (!fs.existsSync(inputPath)) {
  console.error(`Input workbook not found: ${inputPath}`);
  process.exit(1);
}

const workbook = XLSX.readFile(inputPath, {
  cellDates: false,
  cellText: true,
});

const consolidatedSheet = workbook.Sheets["OCR_PHT"];
const sheet = consolidatedSheet ?? workbook.Sheets["OCR"];
if (!sheet) {
  console.error("Sheet OCR_PHT/OCR not found");
  process.exit(1);
}
const consolidated = Boolean(consolidatedSheet);

const rows = XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  raw: false,
  defval: "",
  blankrows: true,
});

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseNumber(value) {
  const text = clean(value).replace(",", ".");
  if (!text || /^disable|blok|-$/i.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function positiveSetting(value) {
  return typeof value === "number" && value > 0;
}

function parseDate(value) {
  const text = clean(value);
  if (!text) return "";
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }
  return text;
}

function normalizeRatio(value) {
  const text = clean(value);
  const ratio = text.match(/^(\d+(?:\.\d+)?)\s*[/\\-]\s*(\d+(?:\.\d+)?)$/);
  if (ratio) return `${Number(ratio[1])}/${Number(ratio[2])}`;
  return text;
}

function slugify(parts) {
  return parts
    .filter(Boolean)
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function settingBlock(row, offset) {
  return {
    inA: parseNumber(row[offset]),
    ocPickupA: parseNumber(row[offset + 1]),
    ocTms: parseNumber(row[offset + 2]),
    ocCurve: clean(row[offset + 3]),
    gfPickupA: parseNumber(row[offset + 4]),
    gfTms: parseNumber(row[offset + 5]),
    gfCurve: clean(row[offset + 6]),
  };
}

function makeRecord(row, rowNumber) {
  const columns = consolidated
    ? {
        ultg: 2,
        substation: 3,
        bay: 4,
        circuit: 5,
        ctRatio: 6,
        make: 9,
        model: 10,
        serial: 11,
        relayType: 12,
        operationYear: 13,
        tapOffset: 15,
        tapDocument: 22,
        tapDate: 23,
        actualOffset: 25,
        actualDate: 32,
        actualFile: 33,
      }
    : {
        ultg: 5,
        substation: 6,
        bay: 7,
        circuit: 8,
        ctRatio: 9,
        make: 10,
        model: 11,
        serial: 12,
        relayType: 13,
        operationYear: 14,
        tapOffset: 15,
        tapDocument: 22,
        tapDate: 23,
        actualOffset: 24,
        actualDate: 31,
        actualFile: null,
      };
  const ultg = clean(row[columns.ultg]);
  const substation = clean(row[columns.substation]);
  const bay = clean(row[columns.bay]);
  const circuit = clean(row[columns.circuit]);

  if (!substation || !bay) return null;

  const tap = settingBlock(row, columns.tapOffset);
  const actual = settingBlock(row, columns.actualOffset);
  const calculation = consolidated
    ? settingBlock([], 0)
    : settingBlock(row, 32);
  const hasAnySetting =
    tap.ocPickupA !== null ||
    tap.gfPickupA !== null ||
    actual.ocPickupA !== null ||
    actual.gfPickupA !== null ||
    calculation.ocPickupA !== null ||
    calculation.gfPickupA !== null;
  if (!hasAnySetting) return null;

  return {
    id: slugify([substation, bay, circuit, rowNumber]),
    sourceRow: rowNumber,
    ultg,
    substation,
    bay,
    circuit,
    ctRatio: normalizeRatio(row[columns.ctRatio]),
    relay: {
      make: clean(row[columns.make]),
      model: clean(row[columns.model]),
      serial: clean(row[columns.serial]),
      relayType: clean(row[columns.relayType]),
      operationYear: parseNumber(row[columns.operationYear]),
    },
    tap: {
      ...tap,
      document: clean(row[columns.tapDocument]),
      date: parseDate(row[columns.tapDate]),
    },
    actual: {
      ...actual,
      date: parseDate(row[columns.actualDate]),
      file:
        columns.actualFile === null ? "" : clean(row[columns.actualFile]),
    },
    calculation,
    notes: consolidated ? "" : clean(row[39]),
    dataQuality: {
      hasCt: Boolean(normalizeRatio(row[columns.ctRatio])),
      hasRelay: Boolean(clean(row[columns.make]) || clean(row[columns.model])),
      hasTap: positiveSetting(tap.ocPickupA) || positiveSetting(tap.gfPickupA),
      hasActual:
        positiveSetting(actual.ocPickupA) || positiveSetting(actual.gfPickupA),
      hasCalculation:
        calculation.ocPickupA !== null || calculation.gfPickupA !== null,
      hasTapDocument: Boolean(clean(row[columns.tapDocument])),
    },
  };
}

const records = [];
for (let i = consolidated ? 10 : 9; i < rows.length; i += 1) {
  const record = makeRecord(rows[i], i + 1);
  if (record) records.push(record);
}

const summary = {
  generatedAt: new Date().toISOString(),
  inputFile: path.basename(inputPath),
  sheetName: consolidated ? "OCR_PHT" : "OCR",
  recordCount: records.length,
  withTap: records.filter((r) => r.dataQuality.hasTap).length,
  withActual: records.filter((r) => r.dataQuality.hasActual).length,
  withTapDocument: records.filter((r) => r.dataQuality.hasTapDocument).length,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  `${JSON.stringify({ summary, records }, null, 2)}\n`,
  "utf8"
);

console.log(`Extracted ${records.length} OCR/GFR records`);
console.log(`Output: ${outputPath}`);
