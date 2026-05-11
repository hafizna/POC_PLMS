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
  "lcd-dist-registry.json"
);

if (!fs.existsSync(inputPath)) {
  console.error(`Input workbook not found: ${inputPath}`);
  process.exit(1);
}

const workbook = XLSX.readFile(inputPath, {
  cellDates: false,
  cellText: true,
});

const sheet = workbook.Sheets["LCD+DIST"];
if (!sheet) {
  console.error("Sheet LCD+DIST not found");
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

function normalizeRatio(value) {
  const text = clean(value);
  if (!text) return "";

  const ratio = text.match(/^(\d+(?:\.\d+)?)\s*[/\\-]\s*(\d+(?:\.\d+)?)$/);
  if (ratio) return `${Number(ratio[1])}/${Number(ratio[2])}`;

  const excelDateLike = text.match(/^(\d{3,5})-(\d{1,2})-(\d{1,2})/);
  if (excelDateLike) {
    const primary = Number(excelDateLike[1]);
    const secondary = Number(excelDateLike[2]);
    if (primary > 100 && secondary > 0) return `${primary}/${secondary}`;
  }

  return text;
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

function slugify(parts) {
  return parts
    .filter(Boolean)
    .join("_")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function makeRecord(row, rowNumber) {
  const ultg = clean(row[5]);
  const substation = clean(row[6]);
  const bay = clean(row[7]);
  const circuit = clean(row[8]);
  const relayFunction = clean(row[15]);

  if (!substation || !bay || !/lcd|dist/i.test(relayFunction)) return null;

  const id = slugify([substation, bay, circuit, rowNumber]);
  return {
    id,
    sourceRow: rowNumber,
    ultg,
    substation,
    bay,
    circuit,
    ctRatio: normalizeRatio(row[10]),
    vtRatio: clean(row[11]),
    relay: {
      make: clean(row[12]),
      model: clean(row[13]),
      serial: clean(row[14]),
      functionGroup: relayFunction,
      arStatus: clean(row[16]),
      relayType: clean(row[17]),
      operationYear: parseNumber(row[18]),
    },
    currentDiff: {
      in: parseNumber(row[19]),
      is1: parseNumber(row[20]),
      is2: parseNumber(row[21]),
      k1: parseNumber(row[22]),
      k2: parseNumber(row[23]),
    },
    distance: {
      lineImpedanceOhm: parseNumber(row[24]),
      timeMode: clean(row[25]),
      z1PhPh: parseNumber(row[26]),
      z1PhGnd: parseNumber(row[27]),
      z2PhPh: parseNumber(row[28]),
      z2PhGnd: parseNumber(row[29]),
      z3PhPh: parseNumber(row[30]),
      z3PhGnd: parseNumber(row[31]),
      t1S: parseNumber(row[32]),
      t2S: parseNumber(row[33]),
      t3S: parseNumber(row[34]),
    },
    tap: {
      document: clean(row[35]),
      date: parseDate(row[36]),
      z1PhPh: parseNumber(row[44]),
      z1PhGnd: parseNumber(row[45]),
      z2PhPh: parseNumber(row[46]),
      z2PhGnd: parseNumber(row[47]),
      z3PhPh: parseNumber(row[48]),
      z3PhGnd: parseNumber(row[49]),
      t1S: parseNumber(row[50]),
      t2S: parseNumber(row[51]),
      t3S: parseNumber(row[52]),
    },
    dataQuality: {
      hasCt: Boolean(normalizeRatio(row[10])),
      hasVt: Boolean(clean(row[11])),
      hasRelay: Boolean(clean(row[12]) || clean(row[13])),
      hasDistance: parseNumber(row[26]) !== null || parseNumber(row[28]) !== null,
      hasTapDocument: Boolean(clean(row[35])),
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
  sheetName: "LCD+DIST",
  recordCount: records.length,
  withDistance: records.filter((r) => r.dataQuality.hasDistance).length,
  withTapDocument: records.filter((r) => r.dataQuality.hasTapDocument).length,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  `${JSON.stringify({ summary, records }, null, 2)}\n`,
  "utf8"
);

console.log(`Extracted ${records.length} LCD+DIST records`);
console.log(`Output: ${outputPath}`);
