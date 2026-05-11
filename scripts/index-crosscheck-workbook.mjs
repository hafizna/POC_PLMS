import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import XLSX from "xlsx";

const ROOT = process.cwd();
const REPO_INPUT = path.join(
  ROOT,
  "data",
  "template-setting",
  "Aplikasi Crosscheck Setting Relay [Digsilent_ 9 Maret 2021, IHS 1-2021].xlsx"
);
const LEGACY_INPUT =
  "C:\\Users\\hafizna.fadhli\\Downloads\\Aplikasi Crosscheck Setting Relay [Digsilent_ 9 Maret 2021, IHS 1-2021].xlsx";
const INPUT = fs.existsSync(REPO_INPUT) ? REPO_INPUT : LEGACY_INPUT;
const OUTPUT = path.join(ROOT, "src", "domain", "generated", "crosscheck-workbook-registry.json");

const wb = XLSX.readFile(INPUT, { cellFormula: true, cellDates: true });

function cell(sheetName, address) {
  const ws = wb.Sheets[sheetName];
  const c = ws?.[address];
  if (!c) return null;
  return c.w ?? c.v ?? null;
}

function num(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function str(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/\s+/g, " ").trim();
}

function formula(sheetName, address) {
  return wb.Sheets[sheetName]?.[address]?.f ?? "";
}

function sheetStats() {
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    let formulas = 0;
    let nonEmpty = 0;
    for (const key of Object.keys(ws)) {
      if (key.startsWith("!")) continue;
      nonEmpty += 1;
      if (ws[key].f) formulas += 1;
    }
    return {
      name,
      ref: ws["!ref"] ?? "",
      nonEmpty,
      formulas,
    };
  });
}

function rows(sheetName) {
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });
}

function extractLineDb(limit = 5000) {
  const data = rows("DB");
  const out = [];
  for (let i = 3; i < data.length && out.length < limit; i += 1) {
    const r = data[i];
    const name = str(r[19]);
    if (!name) continue;
    const from = str(r[23]);
    const to = str(r[25]);
    if (!from || !to) continue;
    out.push({
      row: i + 1,
      name,
      type: str(r[22]),
      fromSubstation: from,
      fromTerminal: str(r[24]),
      toSubstation: to,
      toTerminal: str(r[26]),
      outOfService: str(r[29]) === "1",
      lengthKm: num(r[32]),
      currentRatingKa: num(r[42]),
      z1Ohm: num(r[43]),
      angleDeg: num(r[44]),
      r1Ohm: num(r[45]),
      x1Ohm: num(r[46]),
      r0Ohm: num(r[47]),
      x0Ohm: num(r[48]),
      k0: num(r[50]),
      phiK0Deg: num(r[51]),
    });
  }
  return out;
}

function extractFaultDb(limit = 5000) {
  const data = rows("IHS");
  const out = [];
  for (let i = 4; i < data.length && out.length < limit; i += 1) {
    const r = data[i];
    const substation = str(r[6]);
    if (!substation) continue;
    out.push({
      row: i + 1,
      key: str(r[0]),
      bus: str(r[5]),
      substation,
      area: str(r[7]),
      voltageKv: num(r[8]),
      r1Pu: num(r[9]),
      x1Pu: num(r[10]),
      r2Pu: num(r[11]),
      x2Pu: num(r[12]),
      r0Pu: num(r[13]),
      x0Pu: num(r[14]),
      fault1phKa: num(r[15]),
      fault3phKa: num(r[16]),
      kitFault1phKa: num(r[17]),
      kitFault3phKa: num(r[18]),
    });
  }
  return out;
}

function extractDistanceCase() {
  const lineRows = [20, 21, 22, 23].map((row, idx) => ({
    slot: `L${idx + 1}`,
    name: str(cell("PROSES", `B${row}`)),
    lengthKm: num(cell("PROSES", `C${row}`)),
    zOhm: num(cell("PROSES", `D${row}`)),
    angleDeg: num(cell("PROSES", `E${row}`)),
    r1Ohm: num(cell("PROSES", `G${row}`)),
    x1Ohm: num(cell("PROSES", `H${row}`)),
    type: str(cell("PROSES", `K${row}`)),
    r1PerKm: num(cell("PROSES", `L${row}`)),
    x1PerKm: num(cell("PROSES", `M${row}`)),
    r0PerKm: num(cell("PROSES", `N${row}`)),
    x0PerKm: num(cell("PROSES", `O${row}`)),
  }));
  return {
    localSubstation: str(cell("PROSES", "B1")),
    subjectBay: str(cell("PROSES", "B2")),
    remoteSubstation: str(cell("PROSES", "B3")),
    fault3phKa: num(cell("PROSES", "B4")),
    fault1phKa: num(cell("PROSES", "B5")),
    cccA: num(cell("Cek Distance", "C7")),
    cccRefA: num(cell("Cek Distance", "E7")),
    ctPrimaryA: num(cell("Cek Distance", "C8")),
    ctSecondaryA: num(cell("Cek Distance", "E8")),
    ptPrimaryV: num(cell("Cek Distance", "C9")),
    ptSecondaryV: num(cell("Cek Distance", "E9")),
    selectedLines: lineRows,
    outputs: {
      z1PrimaryOhm: num(cell("Cek Distance", "C14")),
      z1SecondaryOhm: num(cell("Cek Distance", "D14")),
      x1PrimaryOhm: num(cell("Cek Distance", "C15")),
      x1SecondaryOhm: num(cell("Cek Distance", "D15")),
      rg1PrimaryOhm: num(cell("Cek Distance", "C16")),
      rg1SecondaryOhm: num(cell("Cek Distance", "D16")),
      tZ1S: num(cell("Cek Distance", "C17")),
      z2PrimaryOhm: num(cell("Cek Distance", "C21")),
      z2SecondaryOhm: num(cell("Cek Distance", "D21")),
      x2PrimaryOhm: num(cell("Cek Distance", "C22")),
      x2SecondaryOhm: num(cell("Cek Distance", "D22")),
      rg2PrimaryOhm: num(cell("Cek Distance", "C23")),
      rg2SecondaryOhm: num(cell("Cek Distance", "D23")),
      tZ2S: num(cell("Cek Distance", "C24")),
      z3PrimaryOhm: num(cell("Cek Distance", "C27")),
      z3SecondaryOhm: num(cell("Cek Distance", "D27")),
      x3PrimaryOhm: num(cell("Cek Distance", "C28")),
      x3SecondaryOhm: num(cell("Cek Distance", "D28")),
      rg3PrimaryOhm: num(cell("Cek Distance", "C29")),
      rg3SecondaryOhm: num(cell("Cek Distance", "D29")),
      tZ3S: num(cell("Cek Distance", "C30")),
      realK0: num(cell("Cek Distance", "O19")),
      imagK0: num(cell("Cek Distance", "O20")),
    },
    keyFormulas: {
      remoteSubstation: formula("PROSES", "B3"),
      fault3ph: formula("PROSES", "B4"),
      l1Auto: formula("PROSES", "B8"),
      l2Auto: formula("PROSES", "B9"),
      l3Auto: formula("PROSES", "B10"),
      l4Auto: formula("PROSES", "B11"),
      z1Primary: formula("Cek Distance", "C14"),
      z2Primary: formula("Cek Distance", "C21"),
      z3Primary: formula("Cek Distance", "C27"),
      ocrPickup: formula("Cek Distance", "H27"),
    },
  };
}

function extractOcrGfrCase() {
  return {
    substation: str(cell("Cek OCRGFR", "G6")),
    bay: str(cell("Cek OCRGFR", "G7")),
    cccOrTsaA: num(cell("Cek OCRGFR", "G8")),
    ctPrimaryA: num(cell("Cek OCRGFR", "G9")),
    ctSecondaryA: num(cell("Cek OCRGFR", "L9")),
    buspro: str(cell("Cek OCRGFR", "G10")),
    operatingTimeS: num(cell("Cek OCRGFR", "G11")),
    voltageKv: num(cell("Cek OCRGFR", "G12")),
    fault3phA: num(cell("Cek OCRGFR", "G13")),
    fault1phA: num(cell("Cek OCRGFR", "G14")),
    outputs: {
      ocrPickupPrimaryA: num(cell("Cek OCRGFR", "X6")),
      ocrPickupSecondaryA: num(cell("Cek OCRGFR", "X7")),
      ocrTms: str(cell("Cek OCRGFR", "X9")),
      gfrPickupPrimaryA: num(cell("Cek OCRGFR", "X11")),
      gfrPickupSecondaryA: num(cell("Cek OCRGFR", "X12")),
      gfrTms: str(cell("Cek OCRGFR", "X14")),
    },
    keyFormulas: {
      voltageLookup: formula("Cek OCRGFR", "G12"),
      fault3phLookup: formula("Cek OCRGFR", "G13"),
      fault1phLookup: formula("Cek OCRGFR", "G14"),
      ocrPickup: formula("Cek OCRGFR", "X6"),
      ocrTms: formula("Cek OCRGFR", "X9"),
      gfrPickup: formula("Cek OCRGFR", "X11"),
      gfrTms: formula("Cek OCRGFR", "X14"),
    },
  };
}

const file = fs.readFileSync(INPUT);
const lineRecords = extractLineDb();
const faultRecords = extractFaultDb();

const registry = {
  generatedAt: new Date().toISOString(),
  sourceWorkbook: path.relative(ROOT, INPUT) || INPUT,
  fileName: path.basename(INPUT),
  fileSizeBytes: file.length,
  sha256Prefix: crypto.createHash("sha256").update(file).digest("hex").slice(0, 16),
  summary: {
    sheetCount: wb.SheetNames.length,
    lineRecordCount: lineRecords.length,
    faultRecordCount: faultRecords.length,
    formulaCount: sheetStats().reduce((sum, sheet) => sum + sheet.formulas, 0),
  },
  sheets: sheetStats(),
  digsilentLineDb: {
    sourceSheet: "DB",
    updateInstruction: str(cell("DB", "T1")),
    records: lineRecords,
  },
  faultLevelDb: {
    sourceSheet: "IHS",
    title: str(cell("IHS", "E1")),
    records: faultRecords,
  },
  legacyCases: {
    distance: extractDistanceCase(),
    ocrGfr: extractOcrGfrCase(),
  },
  interpretation: {
    purpose:
      "Legacy Excel workbook that combines DIgSILENT line database, short-circuit/fault-level data, bay selection, distance corridor L1-L4 screening, and OCR/GFR quick setting checks.",
    plmsMapping: [
      "DB sheet -> LineRelation + conductor/impedance master",
      "IHS sheet -> bus fault-level/source impedance master",
      "PROSES sheet -> corridor candidate selector for L1/L2/L3/L4",
      "Cek Distance -> distance calculation benchmark and legacy output",
      "Cek OCRGFR -> OCR/GFR calculation benchmark and legacy output",
    ],
  },
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, `${JSON.stringify(registry, null, 2)}\n`);
console.log(`Indexed crosscheck workbook -> ${path.relative(ROOT, OUTPUT)}`);
console.log(`${lineRecords.length} line records, ${faultRecords.length} fault records`);
