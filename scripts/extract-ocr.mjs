import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

const DEFAULT_INPUT = path.join(
  process.env.USERPROFILE ?? "",
  "Downloads",
  "Data Setting Penghantar UPT DKSBI.xlsx"
);

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

const sheet = workbook.Sheets["OCR"];
if (!sheet) {
  console.error("Sheet OCR not found");
  process.exit(1);
}

const rows = XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  raw: false,
  defval: "",
  blankrows: false,
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
  const ultg = clean(row[5]);
  const substation = clean(row[6]);
  const bay = clean(row[7]);
  const circuit = clean(row[8]);

  if (!substation || !bay) return null;

  const tap = settingBlock(row, 15);
  const actual = settingBlock(row, 24);
  const calculation = settingBlock(row, 32);
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
    ctRatio: normalizeRatio(row[9]),
    relay: {
      make: clean(row[10]),
      model: clean(row[11]),
      serial: clean(row[12]),
      relayType: clean(row[13]),
      operationYear: parseNumber(row[14]),
    },
    tap: {
      ...tap,
      document: clean(row[22]),
      date: parseDate(row[23]),
    },
    actual: {
      ...actual,
      date: parseDate(row[31]),
    },
    calculation,
    notes: clean(row[39]),
    dataQuality: {
      hasCt: Boolean(normalizeRatio(row[9])),
      hasRelay: Boolean(clean(row[10]) || clean(row[11])),
      hasTap: tap.ocPickupA !== null || tap.gfPickupA !== null,
      hasActual: actual.ocPickupA !== null || actual.gfPickupA !== null,
      hasCalculation:
        calculation.ocPickupA !== null || calculation.gfPickupA !== null,
      hasTapDocument: Boolean(clean(row[22])),
    },
  };
}

const records = [];
for (let i = 9; i < rows.length; i += 1) {
  const record = makeRecord(rows[i], i + 1);
  if (record) records.push(record);
}

const summary = {
  generatedAt: new Date().toISOString(),
  inputFile: path.basename(inputPath),
  sheetName: "OCR",
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
