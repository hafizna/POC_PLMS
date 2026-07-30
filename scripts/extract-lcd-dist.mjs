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

const consolidated = Boolean(workbook.Sheets["LCD"] && workbook.Sheets["DIST"]);
const sheet = workbook.Sheets["LCD+DIST"];
if (!consolidated && !sheet) {
  console.error("Sheet LCD+DIST or separate LCD/DIST sheets not found");
  process.exit(1);
}

const rows = sheet
  ? XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: true,
    })
  : [];
const lcdRows = consolidated
  ? XLSX.utils.sheet_to_json(workbook.Sheets["LCD"], {
      header: 1,
      raw: false,
      defval: "",
      blankrows: true,
    })
  : [];
const distRows = consolidated
  ? XLSX.utils.sheet_to_json(workbook.Sheets["DIST"], {
      header: 1,
      raw: false,
      defval: "",
      blankrows: true,
    })
  : [];

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

function makeConsolidatedRecord(lcdRow, distRow, rowNumber) {
  const source = distRow?.[3] ? distRow : lcdRow;
  const substation = clean(source?.[3]);
  const bay = clean(source?.[4]);
  const circuit = clean(source?.[5]);
  if (!substation || !bay) return null;

  const issuedDistance = {
    lineImpedanceOhm: parseNumber(lcdRow?.[17]),
    timeMode: "",
    z1PhPh: parseNumber(distRow?.[19]),
    z1PhGnd: parseNumber(distRow?.[20]),
    z2PhPh: parseNumber(distRow?.[21]),
    z2PhGnd: parseNumber(distRow?.[22]),
    z3PhPh: parseNumber(distRow?.[23]),
    z3PhGnd: parseNumber(distRow?.[24]),
    t1S: parseNumber(distRow?.[25]),
    t2S: parseNumber(distRow?.[26]),
    t3S: parseNumber(distRow?.[27]),
  };
  const actualDistance = {
    lineImpedanceOhm: parseNumber(lcdRow?.[32]),
    timeMode: clean(distRow?.[38]),
    z1PhPh: parseNumber(distRow?.[41]),
    z1PhGnd: parseNumber(distRow?.[42]),
    z2PhPh: parseNumber(distRow?.[43]),
    z2PhGnd: parseNumber(distRow?.[44]),
    z3PhPh: parseNumber(distRow?.[45]),
    z3PhGnd: parseNumber(distRow?.[46]),
    t1S: parseNumber(distRow?.[47]),
    t2S: parseNumber(distRow?.[48]),
    t3S: parseNumber(distRow?.[49]),
  };
  const tapDocument = clean(lcdRow?.[29]);
  const tapDate = parseDate(lcdRow?.[30]);
  const relayFunction = [
    hasDistanceValues(issuedDistance) || hasDistanceValues(actualDistance)
      ? "DIST"
      : "",
    hasCurrentDiffValues(lcdRow) ? "LCD" : "",
  ]
    .filter(Boolean)
    .join("+");

  return {
    id: slugify([substation, bay, circuit, rowNumber]),
    sourceRow: rowNumber,
    ultg: clean(source?.[2]),
    substation,
    bay,
    circuit,
    ctRatio: normalizeRatio(source?.[6]),
    vtRatio: clean(source?.[7]),
    relay: {
      make: clean(source?.[11]),
      model: clean(source?.[12]),
      serial: clean(source?.[13]),
      functionGroup: relayFunction || "LCD/DIST",
      arStatus: "",
      relayType: clean(source?.[14]),
      operationYear: parseNumber(source?.[15]),
    },
    currentDiff: {
      in: parseNumber(lcdRow?.[19]),
      is1: parseNumber(lcdRow?.[20]),
      is2: parseNumber(lcdRow?.[21]),
      k1: parseNumber(lcdRow?.[22]),
      k2: parseNumber(lcdRow?.[23]),
    },
    actualCurrentDiff: {
      in: parseNumber(lcdRow?.[34]),
      is1: parseNumber(lcdRow?.[35]),
      is2: parseNumber(lcdRow?.[36]),
      k1: parseNumber(lcdRow?.[37]),
      k2: parseNumber(lcdRow?.[38]),
    },
    distance: issuedDistance,
    actual: actualDistance,
    tap: {
      document: tapDocument,
      date: tapDate,
      z1PhPh: issuedDistance.z1PhPh,
      z1PhGnd: issuedDistance.z1PhGnd,
      z2PhPh: issuedDistance.z2PhPh,
      z2PhGnd: issuedDistance.z2PhGnd,
      z3PhPh: issuedDistance.z3PhPh,
      z3PhGnd: issuedDistance.z3PhGnd,
      t1S: issuedDistance.t1S,
      t2S: issuedDistance.t2S,
      t3S: issuedDistance.t3S,
    },
    dataQuality: {
      hasCt: Boolean(normalizeRatio(source?.[6])),
      hasVt: Boolean(clean(source?.[7])),
      hasRelay: Boolean(clean(source?.[11]) || clean(source?.[12])),
      hasDistance:
        hasDistanceValues(issuedDistance) ||
        hasDistanceValues(actualDistance),
      hasTapDocument: Boolean(tapDocument),
    },
  };
}

function hasDistanceValues(block) {
  return [
    block.z1PhPh,
    block.z2PhPh,
    block.z3PhPh,
    block.t1S,
    block.t2S,
    block.t3S,
  ].some((value) => typeof value === "number" && value !== 0);
}

function hasCurrentDiffValues(row) {
  return [19, 20, 21, 22, 23, 34, 35, 36, 37, 38].some((index) => {
    const value = parseNumber(row?.[index]);
    return typeof value === "number" && value !== 0;
  });
}

const records = [];
if (consolidated) {
  const lastRow = Math.max(lcdRows.length, distRows.length);
  for (let i = 10; i < lastRow; i += 1) {
    const record = makeConsolidatedRecord(lcdRows[i], distRows[i], i + 1);
    if (record) records.push(record);
  }
} else {
  for (let i = 9; i < rows.length; i += 1) {
    const record = makeRecord(rows[i], i + 1);
    if (record) records.push(record);
  }
}

const summary = {
  generatedAt: new Date().toISOString(),
  inputFile: path.basename(inputPath),
  sheetName: consolidated ? "LCD+DIST (separate source sheets)" : "LCD+DIST",
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
