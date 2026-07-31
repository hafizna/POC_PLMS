import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx");

// HEL_PHT_TAP is a per-bay (not per-model-dictionary) sheet with far deeper
// coverage than DIST/AR/OCR_PHT (Current Diff, Distance Z1-Z3 incl. PP/PE
// split, Scheme Logic/POTT-PUTT, SOTF/TOR, Autoreclose, System Checks/Sync,
// VTS/CTS supervision, OCR/GFR backup) — see the HEL_PHT_TAP data-completeness
// audit. Column layout is NOT uniform across the sheet's 13 relay models:
// rows 2-14 hold one header row PER MODEL, and each model's own header row is
// the only correct column map for that model's data rows (data rows for
// different models are interleaved, not grouped in blocks). All 13 penghantar
// (line-protection) relay models present in this sheet now have a column map,
// each verified against a real data row for that model before being written —
// not a generic concatenated-header guess (that was tried during the audit
// and is wrong: the same column index means something different for
// different models). Column layouts collapse into 7 distinct shapes, not 13,
// because several MiCOM sub-families share an identical column position:
//   - Layout A (MICOM P545/P546/P543/P521): PP/PE-split distance, Scheme
//     Logic w/ Aid1/Aid2 + SOTF/TOR status+tripping bitmask, AR, sync checks.
//   - Layout B (MICOM P443/P442/P446): flat Z1/R1G/R1Ph/tZ1 distance (no
//     PP/PE split), combined "SOTF/TOR Mode" field, GFR uses "Ie>".
//   - L90 (GE): Current Differential (87L) + full Phase/Ground Mho distance
//     with quadrilateral blinders, Pilot Scheme.
//   - Siemens 7SL87/7SD61 (identical layout): 87 Line Differential, flat
//     distance Z1-Z3, separate Mho-shape variant, carrier/aided scheme.
//   - ABB RED670: Diff Mode (IdMin/EndSection slopes), Zone 1 PP/PE-split
//     (mirrors the XRIO ZMFPDIS structure from the .rio/XRIO parser work),
//     Zone 2/3 shared reach, Autorecloser + Synchronizing.
//   - NR PCS-931: Line/Diff/Dist Setting using IEC-61850-style logical-node
//     naming (87L.*, 21M1-3.ZG/ZP.*), explicit Pilot Mode (85.Opt_PilotMode).
//   - Toshiba GRL 200: separate phase (Mho) and ground (Quad) distance
//     characteristics per zone, Carrier Distance/DEF, Differential (DIFL.*).
// This sheet only covers penghantar (line-protection) relays — transformer,
// busbar, and other function relays live in separate sheets with their own
// (not yet audited) column layouts.

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
  "hel-pht-tap-registry.json"
);

if (!fs.existsSync(inputPath)) {
  console.error(`Input workbook not found: ${inputPath}`);
  process.exit(1);
}

const workbook = XLSX.readFile(inputPath, { cellDates: false, cellText: true });
const sheet = workbook.Sheets["HEL_PHT_TAP"];
if (!sheet) {
  console.error("Sheet HEL_PHT_TAP not found");
  process.exit(1);
}

const rows = XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  raw: false,
  defval: null,
  blankrows: true,
});

function clean(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

// Cells carry a unit/percent suffix inline ("0.263 ohm", "30%", "100 ms",
// "70.066 deg") rather than a separate units column. parseQuantity splits the
// leading number from the trailing unit so callers get a typed number instead
// of re-parsing a display string, and normalizes "ms" to seconds and "%" to a
// fraction since RelaySetting/DistanceZoneSetting elsewhere use seconds and
// fractions, not milliseconds/percent. Some models (7SL87/P546/GRL 200) also
// append a descriptive parenthetical after the unit ("0,819 A (sec)", "1 A
// (0,2xIn)") that carries no additional numeric meaning beyond the leading
// value — stripped before matching, not parsed itself.
function parseQuantity(value) {
  const text = clean(value).replace(",", ".").replace(/\s*\([^)]*\)\s*$/, "");
  if (!text || text === "-" || /^(disabled?|blok)$/i.test(text)) {
    return { value: null, unit: null, raw: text };
  }
  const match = text.match(/^(-?\d+(?:\.\d+)?)\s*([a-zA-Z%]*)$/);
  if (!match) return { value: null, unit: null, raw: text };
  const num = Number(match[1]);
  const unit = match[2] || null;
  if (!Number.isFinite(num)) return { value: null, unit, raw: text };
  if (unit === "ms") return { value: num / 1000, unit: "s", raw: text };
  if (unit === "%") return { value: num / 100, unit: "fraction", raw: text };
  return { value: num, unit, raw: text };
}

function numOrNull(value) {
  return parseQuantity(value).value;
}

function statusOrNull(value) {
  const text = clean(value);
  if (!text || text === "-") return null;
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

// Column indices below are read directly off HEL_PHT_TAP's row 2 (MICOM P545's
// own header row) — confirmed against real P545 data rows, not guessed from
// the concatenated multi-model header dump used during the audit.
const P545_COLS = {
  id: 0,
  substation: 1,
  remoteBay: 2,
  sourceUrl: 3,
  model: 4,
  functionEnabled: {
    distance: 9,
    directionalEf: 10,
    currentDiff: 11,
    overcurrent: 12,
    negSequenceOc: 13,
    brokenConductor: 14,
    earthFault: 15,
    sefRefProtn: 16,
    residualOvNvd: 17,
    thermalOverload: 18,
    powerSwingBlock: 19,
    voltProtection: 20,
    freqProtection: 21,
    cbFail: 22,
    supervision: 23,
    systemCheck: 24,
    autoreclose: 25,
  },
  ctRatio: 28,
  vtRatio: 29,
  lineLengthKm: 30,
  lineImpedanceOhm: 31,
  lineAngleDeg: 32,
  kznResComp: 33,
  kznResAngleDeg: 34,
  currentDiff: {
    phaseIs1A: 36,
    phaseIs2A: 37,
    phaseK1: 38,
    phaseK2: 39,
    phaseTimeDelayS: 40,
  },
  scheme: {
    tZ1PhDelayS: 53,
    tZ2PhDelayS: 54,
    tZ3PhDelayS: 55,
    aid1Selection: 56,
    tRevGuard1: 57,
    aid2Selection: 58,
    sotfStatus: 60,
    sotfTripping: 61,
    torStatus: 62,
    torTripping: 63,
  },
  supervisionDetail: {
    vtsMode: 66,
    ctsMode: 67,
  },
  distanceElement: {
    z1PhReachOhm: 70,
    z1PhAngleDeg: 71,
    r1PhResistiveOhm: 72,
    z2PhReachOhm: 73,
    z2PhAngleDeg: 74,
    r2PhResistiveOhm: 75,
    z3PhReachOhm: 76,
    z3PhAngleDeg: 77,
    r3PhResistiveOhm: 78,
  },
  autoreclose: {
    arMode: 80,
    multiPhaseAr: 81,
    discrimTimeS: 82,
    spArDeadTimeS: 83,
    threePArDtShot1S: 84,
  },
  systemChecks: {
    liveLineV: 86,
    deadLineV: 87,
    cb1CsVoltBlk: 89,
    cb1Cs1Status: 90,
    cb1Cs1AngleDeg: 91,
    cb1VdiffV: 92,
    cb1Cs1SlipFreqHz: 93,
  },
  ocrBackup: {
    ctRatio: 109,
    ocPickupA: 111,
    ocTms: 112,
    ocHighsetPickupA: 113,
    ocHighsetTms: 114,
    gfPickupA: 116,
    gfTms: 117,
    gfHighsetPickupA: 118,
    gfHighsetTms: 119,
  },
};

function functionStatusBlock(row, cols) {
  const out = {};
  for (const [key, col] of Object.entries(cols)) {
    out[key] = statusOrNull(row[col]);
  }
  return out;
}

function makeP545Record(row, rowNumber) {
  const bayId = clean(row[P545_COLS.id]);
  const substation = clean(row[P545_COLS.substation]);
  const remoteBay = clean(row[P545_COLS.remoteBay]);
  if (!bayId || !substation || !remoteBay) return null;

  const c = P545_COLS;
  return {
    id: slugify([substation, remoteBay, bayId]),
    sourceRow: rowNumber,
    bayId,
    substation,
    remoteBay,
    model: clean(row[c.model]),
    functionEnabled: functionStatusBlock(row, c.functionEnabled),
    ctRatio: clean(row[c.ctRatio]),
    vtRatio: clean(row[c.vtRatio]),
    lineLengthKm: numOrNull(row[c.lineLengthKm]),
    lineImpedanceOhm: numOrNull(row[c.lineImpedanceOhm]),
    lineAngleDeg: numOrNull(row[c.lineAngleDeg]),
    kznResComp: numOrNull(row[c.kznResComp]),
    kznResAngleDeg: numOrNull(row[c.kznResAngleDeg]),
    currentDiff: {
      phaseIs1A: numOrNull(row[c.currentDiff.phaseIs1A]),
      phaseIs2A: numOrNull(row[c.currentDiff.phaseIs2A]),
      phaseK1: numOrNull(row[c.currentDiff.phaseK1]),
      phaseK2: numOrNull(row[c.currentDiff.phaseK2]),
      phaseTimeDelayS: numOrNull(row[c.currentDiff.phaseTimeDelayS]),
    },
    distance: {
      z1PhReachOhm: numOrNull(row[c.distanceElement.z1PhReachOhm]),
      z1PhAngleDeg: numOrNull(row[c.distanceElement.z1PhAngleDeg]),
      r1PhResistiveOhm: numOrNull(row[c.distanceElement.r1PhResistiveOhm]),
      z2PhReachOhm: numOrNull(row[c.distanceElement.z2PhReachOhm]),
      z2PhAngleDeg: numOrNull(row[c.distanceElement.z2PhAngleDeg]),
      r2PhResistiveOhm: numOrNull(row[c.distanceElement.r2PhResistiveOhm]),
      z3PhReachOhm: numOrNull(row[c.distanceElement.z3PhReachOhm]),
      z3PhAngleDeg: numOrNull(row[c.distanceElement.z3PhAngleDeg]),
      r3PhResistiveOhm: numOrNull(row[c.distanceElement.r3PhResistiveOhm]),
      tZ1PhDelayS: numOrNull(row[c.scheme.tZ1PhDelayS]),
      tZ2PhDelayS: numOrNull(row[c.scheme.tZ2PhDelayS]),
      tZ3PhDelayS: numOrNull(row[c.scheme.tZ3PhDelayS]),
    },
    scheme: {
      aid1Selection: statusOrNull(row[c.scheme.aid1Selection]),
      tRevGuardS: numOrNull(row[c.scheme.tRevGuard1]),
      aid2Selection: statusOrNull(row[c.scheme.aid2Selection]),
      sotfStatus: statusOrNull(row[c.scheme.sotfStatus]),
      sotfTripping: statusOrNull(row[c.scheme.sotfTripping]),
      torStatus: statusOrNull(row[c.scheme.torStatus]),
      torTripping: statusOrNull(row[c.scheme.torTripping]),
    },
    supervision: {
      vtsMode: statusOrNull(row[c.supervisionDetail.vtsMode]),
      ctsMode: statusOrNull(row[c.supervisionDetail.ctsMode]),
    },
    autoreclose: {
      arMode: statusOrNull(row[c.autoreclose.arMode]),
      multiPhaseAr: statusOrNull(row[c.autoreclose.multiPhaseAr]),
      discrimTimeS: numOrNull(row[c.autoreclose.discrimTimeS]),
      spArDeadTimeS: numOrNull(row[c.autoreclose.spArDeadTimeS]),
      threePArDtShot1S: numOrNull(row[c.autoreclose.threePArDtShot1S]),
    },
    systemChecks: {
      liveLineV: numOrNull(row[c.systemChecks.liveLineV]),
      deadLineV: numOrNull(row[c.systemChecks.deadLineV]),
      cb1CsVoltBlk: statusOrNull(row[c.systemChecks.cb1CsVoltBlk]),
      cb1Cs1Status: statusOrNull(row[c.systemChecks.cb1Cs1Status]),
      cb1Cs1AngleDeg: numOrNull(row[c.systemChecks.cb1Cs1AngleDeg]),
      cb1VdiffV: numOrNull(row[c.systemChecks.cb1VdiffV]),
      cb1Cs1SlipFreqHz: numOrNull(row[c.systemChecks.cb1Cs1SlipFreqHz]),
    },
    ocrBackup: {
      ctRatio: clean(row[c.ocrBackup.ctRatio]),
      ocPickupA: numOrNull(row[c.ocrBackup.ocPickupA]),
      ocTms: numOrNull(row[c.ocrBackup.ocTms]),
      ocHighsetPickupA: numOrNull(row[c.ocrBackup.ocHighsetPickupA]),
      ocHighsetTms: numOrNull(row[c.ocrBackup.ocHighsetTms]),
      gfPickupA: numOrNull(row[c.ocrBackup.gfPickupA]),
      gfTms: numOrNull(row[c.ocrBackup.gfTms]),
      gfHighsetPickupA: numOrNull(row[c.ocrBackup.gfHighsetPickupA]),
      gfHighsetTms: numOrNull(row[c.ocrBackup.gfHighsetTms]),
    },
    dataQuality: {
      hasCt: Boolean(clean(row[c.ctRatio])),
      hasVt: Boolean(clean(row[c.vtRatio])),
      hasDistance: numOrNull(row[c.distanceElement.z1PhReachOhm]) !== null,
      hasCurrentDiff: numOrNull(row[c.currentDiff.phaseIs1A]) !== null,
      hasScheme: statusOrNull(row[c.scheme.aid1Selection]) !== null,
      hasSotfTor: statusOrNull(row[c.scheme.sotfStatus]) !== null,
      hasAutoreclose: statusOrNull(row[c.autoreclose.arMode]) !== null,
      hasOcrBackup: numOrNull(row[c.ocrBackup.ocPickupA]) !== null,
    },
  };
}

// Layout A (same column positions as P545): confirmed identical header row
// for MICOM P546/P543/P521 against their own real data rows — the MiCOM
// distance/AR/scheme family shares one layout. P521 has zero real setting
// data in the workbook today (both its rows are identity-only) but the map
// is still added so it produces correct (empty) records rather than being
// silently skipped forever once data appears.
function makeLayoutARecord(row, rowNumber) {
  return makeP545Record(row, rowNumber);
}

// Layout B (MICOM P443/P442/P446): confirmed identical header row across
// these three — distance is flat Z1/R1G/R1Ph/tZ1 (no PP/PE split, unlike
// layout A), scheme is "Distance Scheme"/"SOTF/TOR Mode" (one combined
// mode field, not separate SOTF/TOR status+tripping bitmasks), and GFR
// backup uses "Ie>" instead of layout A's "I>".
const LAYOUT_B_COLS = {
  id: 0,
  substation: 1,
  remoteBay: 2,
  sourceUrl: 3,
  model: 4,
  functionEnabled: {
    distance: 9,
    directionalEf: 10,
    currentDiff: 11,
    overcurrent: 12,
    negSequenceOc: 13,
    brokenConductor: 14,
    earthFault: 15,
    sefRefProtn: 16,
    residualOvNvd: 17,
    thermalOverload: 18,
    powerSwingBlock: 19,
    voltProtection: 20,
    freqProtection: 21,
    cbFailAndIlt: 22,
    supervision: 23,
    systemCheck: 24,
    autoreclose: 25,
  },
  ctRatio: 28,
  vtRatio: 29,
  lineLengthKm: 31,
  lineImpedanceOhm: 32,
  lineAngleDeg: 33,
  kzResComp: 34,
  kzResAngleDeg: 35,
  distance: {
    z1Ohm: 36,
    r1gOhm: 37,
    r1phOhm: 38,
    tZ1S: 39,
    z2Ohm: 40,
    r2gOhm: 41,
    r2phOhm: 42,
    tZ2S: 43,
    z3Ohm: 44,
    r3gOhm: 45,
    r3phOhm: 46,
    tZ3S: 47,
  },
  scheme: {
    programMode: 53,
    standardMode: 54,
    aidDistDly: 55,
    tReversalGuardS: 56,
    unblockingLogic: 57,
    sotfTorMode: 58,
    sotfDelayS: 59,
    z1ExtFail: 60,
  },
  supervisionDetail: {
    vtsMode: 66,
    ctsMode: 67,
  },
  autoreclose: {
    arMode: 69,
    multiPhaseAr: 70,
    discrimTimeS: 71,
    spArDeadTimeS: 72,
    threePArDtShot1S: 73,
  },
  ocrBackup: {
    ctRatio: 108,
    ocPickupA: 110,
    ocTms: 111,
    ocHighsetPickupA: 112,
    ocHighsetTms: 113,
    gfPickupA: 115,
    gfTms: 116,
    gfHighsetPickupA: 117,
    gfHighsetTms: 118,
  },
};

function makeLayoutBRecord(row, rowNumber) {
  const c = LAYOUT_B_COLS;
  const bayId = clean(row[c.id]);
  const substation = clean(row[c.substation]);
  const remoteBay = clean(row[c.remoteBay]);
  if (!bayId || !substation || !remoteBay) return null;

  return {
    id: slugify([substation, remoteBay, bayId]),
    sourceRow: rowNumber,
    bayId,
    substation,
    remoteBay,
    model: clean(row[c.model]),
    functionEnabled: functionStatusBlock(row, c.functionEnabled),
    ctRatio: clean(row[c.ctRatio]),
    vtRatio: clean(row[c.vtRatio]),
    lineLengthKm: numOrNull(row[c.lineLengthKm]),
    lineImpedanceOhm: numOrNull(row[c.lineImpedanceOhm]),
    lineAngleDeg: numOrNull(row[c.lineAngleDeg]),
    kzResComp: numOrNull(row[c.kzResComp]),
    kzResAngleDeg: numOrNull(row[c.kzResAngleDeg]),
    distance: {
      z1Ohm: numOrNull(row[c.distance.z1Ohm]),
      r1gOhm: numOrNull(row[c.distance.r1gOhm]),
      r1phOhm: numOrNull(row[c.distance.r1phOhm]),
      tZ1S: numOrNull(row[c.distance.tZ1S]),
      z2Ohm: numOrNull(row[c.distance.z2Ohm]),
      r2gOhm: numOrNull(row[c.distance.r2gOhm]),
      r2phOhm: numOrNull(row[c.distance.r2phOhm]),
      tZ2S: numOrNull(row[c.distance.tZ2S]),
      z3Ohm: numOrNull(row[c.distance.z3Ohm]),
      r3gOhm: numOrNull(row[c.distance.r3gOhm]),
      r3phOhm: numOrNull(row[c.distance.r3phOhm]),
      tZ3S: numOrNull(row[c.distance.tZ3S]),
    },
    scheme: {
      programMode: statusOrNull(row[c.scheme.programMode]),
      standardMode: statusOrNull(row[c.scheme.standardMode]),
      aidDistDly: statusOrNull(row[c.scheme.aidDistDly]),
      tReversalGuardS: numOrNull(row[c.scheme.tReversalGuardS]),
      unblockingLogic: statusOrNull(row[c.scheme.unblockingLogic]),
      sotfTorMode: statusOrNull(row[c.scheme.sotfTorMode]),
      sotfDelayS: numOrNull(row[c.scheme.sotfDelayS]),
      z1ExtFail: statusOrNull(row[c.scheme.z1ExtFail]),
    },
    supervision: {
      vtsMode: statusOrNull(row[c.supervisionDetail.vtsMode]),
      ctsMode: statusOrNull(row[c.supervisionDetail.ctsMode]),
    },
    autoreclose: {
      arMode: statusOrNull(row[c.autoreclose.arMode]),
      multiPhaseAr: statusOrNull(row[c.autoreclose.multiPhaseAr]),
      discrimTimeS: numOrNull(row[c.autoreclose.discrimTimeS]),
      spArDeadTimeS: numOrNull(row[c.autoreclose.spArDeadTimeS]),
      threePArDtShot1S: numOrNull(row[c.autoreclose.threePArDtShot1S]),
    },
    ocrBackup: {
      ctRatio: clean(row[c.ocrBackup.ctRatio]),
      ocPickupA: numOrNull(row[c.ocrBackup.ocPickupA]),
      ocTms: numOrNull(row[c.ocrBackup.ocTms]),
      ocHighsetPickupA: numOrNull(row[c.ocrBackup.ocHighsetPickupA]),
      ocHighsetTms: numOrNull(row[c.ocrBackup.ocHighsetTms]),
      gfPickupA: numOrNull(row[c.ocrBackup.gfPickupA]),
      gfTms: numOrNull(row[c.ocrBackup.gfTms]),
      gfHighsetPickupA: numOrNull(row[c.ocrBackup.gfHighsetPickupA]),
      gfHighsetTms: numOrNull(row[c.ocrBackup.gfHighsetTms]),
    },
    dataQuality: {
      hasCt: Boolean(clean(row[c.ctRatio])),
      hasVt: Boolean(clean(row[c.vtRatio])),
      hasDistance: numOrNull(row[c.distance.z1Ohm]) !== null,
      hasScheme: statusOrNull(row[c.scheme.sotfTorMode]) !== null,
      hasAutoreclose: statusOrNull(row[c.autoreclose.arMode]) !== null,
      hasOcrBackup: numOrNull(row[c.ocrBackup.ocPickupA]) !== null,
    },
  };
}

// GE L90: Current Differential (87L) + full Phase/Ground Distance Z1-Z3
// (Mho circle: Reach/RCA/CompLimit/DIR RCA/DIR CompLimit, plus quadrilateral
// blinders) + backup overcurrent suite + Pilot Scheme (POTT/PUTT/blocking).
const L90_COLS = {
  id: 0,
  substation: 1,
  remoteBay: 2,
  sourceUrl: 3,
  model: 4,
  ctRatio: 8,
  vtRatio: 9,
  currentDiff: {
    function: 12,
    pickupPu: 13,
    restrain1Pct: 14,
    restrain2Pct: 15,
    breakpointPu: 16,
  },
  phaseDistance: {
    z1ReachOhm: 25,
    z1RcaDeg: 26,
    z1DelayS: 34,
    z2ReachOhm: 36,
    z2RcaDeg: 37,
    z2DelayS: 45,
    z3ReachOhm: 53,
    z3RcaDeg: 54,
    z3DelayS: 62,
  },
  groundDistance: {
    z1ReachOhm: 64,
    z1RcaDeg: 65,
    z1DelayS: 73,
    z2ReachOhm: 75,
    z2RcaDeg: 76,
    z2DelayS: 84,
    z3ReachOhm: 86,
    z3RcaDeg: 87,
    z3DelayS: 95,
  },
  scheme: {
    powerSwingDetect: 102,
    loadEncroachment: 103,
    pilotScheme: 129,
  },
  backupOc: {
    phaseToc: 105,
    phaseIoc: 106,
    phaseDirectional: 107,
    neutralIoc: 109,
    negSequenceToc: 118,
    negSequenceIoc: 119,
  },
};

function makeL90Record(row, rowNumber) {
  const c = L90_COLS;
  const bayId = clean(row[c.id]);
  const substation = clean(row[c.substation]);
  const remoteBay = clean(row[c.remoteBay]);
  if (!bayId || !substation || !remoteBay) return null;

  return {
    id: slugify([substation, remoteBay, bayId]),
    sourceRow: rowNumber,
    bayId,
    substation,
    remoteBay,
    model: clean(row[c.model]),
    ctRatio: clean(row[c.ctRatio]),
    vtRatio: clean(row[c.vtRatio]),
    currentDiff: {
      function: statusOrNull(row[c.currentDiff.function]),
      pickupPu: numOrNull(row[c.currentDiff.pickupPu]),
      restrain1Pct: numOrNull(row[c.currentDiff.restrain1Pct]),
      restrain2Pct: numOrNull(row[c.currentDiff.restrain2Pct]),
      breakpointPu: numOrNull(row[c.currentDiff.breakpointPu]),
    },
    phaseDistance: {
      z1ReachOhm: numOrNull(row[c.phaseDistance.z1ReachOhm]),
      z1RcaDeg: numOrNull(row[c.phaseDistance.z1RcaDeg]),
      z1DelayS: numOrNull(row[c.phaseDistance.z1DelayS]),
      z2ReachOhm: numOrNull(row[c.phaseDistance.z2ReachOhm]),
      z2RcaDeg: numOrNull(row[c.phaseDistance.z2RcaDeg]),
      z2DelayS: numOrNull(row[c.phaseDistance.z2DelayS]),
      z3ReachOhm: numOrNull(row[c.phaseDistance.z3ReachOhm]),
      z3RcaDeg: numOrNull(row[c.phaseDistance.z3RcaDeg]),
      z3DelayS: numOrNull(row[c.phaseDistance.z3DelayS]),
    },
    groundDistance: {
      z1ReachOhm: numOrNull(row[c.groundDistance.z1ReachOhm]),
      z1RcaDeg: numOrNull(row[c.groundDistance.z1RcaDeg]),
      z1DelayS: numOrNull(row[c.groundDistance.z1DelayS]),
      z2ReachOhm: numOrNull(row[c.groundDistance.z2ReachOhm]),
      z2RcaDeg: numOrNull(row[c.groundDistance.z2RcaDeg]),
      z2DelayS: numOrNull(row[c.groundDistance.z2DelayS]),
      z3ReachOhm: numOrNull(row[c.groundDistance.z3ReachOhm]),
      z3RcaDeg: numOrNull(row[c.groundDistance.z3RcaDeg]),
      z3DelayS: numOrNull(row[c.groundDistance.z3DelayS]),
    },
    scheme: {
      powerSwingDetect: statusOrNull(row[c.scheme.powerSwingDetect]),
      loadEncroachment: statusOrNull(row[c.scheme.loadEncroachment]),
      pilotScheme: statusOrNull(row[c.scheme.pilotScheme]),
    },
    backupOc: {
      phaseToc: statusOrNull(row[c.backupOc.phaseToc]),
      phaseIoc: statusOrNull(row[c.backupOc.phaseIoc]),
      phaseDirectional: statusOrNull(row[c.backupOc.phaseDirectional]),
      neutralIoc: statusOrNull(row[c.backupOc.neutralIoc]),
      negSequenceToc: statusOrNull(row[c.backupOc.negSequenceToc]),
      negSequenceIoc: statusOrNull(row[c.backupOc.negSequenceIoc]),
    },
    dataQuality: {
      hasCt: Boolean(clean(row[c.ctRatio])),
      hasVt: Boolean(clean(row[c.vtRatio])),
      hasDistance: numOrNull(row[c.phaseDistance.z1ReachOhm]) !== null,
      hasCurrentDiff: statusOrNull(row[c.currentDiff.function]) !== null,
      hasScheme: statusOrNull(row[c.scheme.pilotScheme]) !== null,
    },
  };
}

// Siemens 7SL87/7SD61 (confirmed identical header layout): line-differential
// (87 Line Differential I-DIFF/I-DIFF Fast), distance Z1-Z3 in both a flat
// impedance form ("Z1"/"X Reach"/"R (Ph-g)"/"R (Ph-ph)") and a separate Mho
// variant ("Z1 (Mho)"), aided/carrier scheme, and OCR/GFR backup using
// "Ie>"/"I>" naming (varies slightly between the two models but at the same
// column positions).
const SIEMENS_7S_COLS = {
  id: 0,
  substation: 1,
  remoteBay: 2,
  sourceUrl: 3,
  model: 4,
  ctRatio: 7,
  vtRatio: 8,
  lineParams: {
    c1PerLengthUfPerKm: 10,
    c0PerLengthUfPerKm: 11,
    xPerLengthOhmPerKm: 12,
    lineLengthKm: 14,
    lineAngleDeg: 15,
  },
  lineDiff: {
    iDiff: 17,
    thresholdA: 18,
    operateDelayS: 19,
    iDiffFast: 20,
    thresholdFastA: 21,
    icCompensation: 22,
  },
  distanceProt: {
    mode: 29,
    characteristicAngleDeg: 31,
    z1XReachOhm: 33,
    z1RphgOhm: 34,
    z1RphphOhm: 35,
    z1OperateDelayS: 36,
    z2XReachOhm: 38,
    z2RphgOhm: 39,
    z2RphphOhm: 40,
    z2OperateDelayS: 41,
    z3XReachOhm: 43,
    z3RphgOhm: 44,
    z3RphphOhm: 45,
    z3OperateDelayS: 46,
  },
  ocrBackup: {
    ctRatio: 107,
    ocPickupA: 109,
    ocTms: 110,
    ocHighsetPickupA: 111,
    ocHighsetTms: 112,
    gfPickupA: 114,
    gfTms: 115,
    gfHighsetPickupA: 116,
    gfHighsetTms: 117,
  },
};

function makeSiemens7SRecord(row, rowNumber) {
  const c = SIEMENS_7S_COLS;
  const bayId = clean(row[c.id]);
  const substation = clean(row[c.substation]);
  const remoteBay = clean(row[c.remoteBay]);
  if (!bayId || !substation || !remoteBay) return null;

  return {
    id: slugify([substation, remoteBay, bayId]),
    sourceRow: rowNumber,
    bayId,
    substation,
    remoteBay,
    model: clean(row[c.model]),
    ctRatio: clean(row[c.ctRatio]),
    vtRatio: clean(row[c.vtRatio]),
    lineParams: {
      c1PerLengthUfPerKm: numOrNull(row[c.lineParams.c1PerLengthUfPerKm]),
      c0PerLengthUfPerKm: numOrNull(row[c.lineParams.c0PerLengthUfPerKm]),
      xPerLengthOhmPerKm: numOrNull(row[c.lineParams.xPerLengthOhmPerKm]),
      lineLengthKm: numOrNull(row[c.lineParams.lineLengthKm]),
      lineAngleDeg: numOrNull(row[c.lineParams.lineAngleDeg]),
    },
    lineDiff: {
      iDiff: statusOrNull(row[c.lineDiff.iDiff]),
      thresholdA: numOrNull(row[c.lineDiff.thresholdA]),
      operateDelayS: numOrNull(row[c.lineDiff.operateDelayS]),
      iDiffFast: statusOrNull(row[c.lineDiff.iDiffFast]),
      thresholdFastA: numOrNull(row[c.lineDiff.thresholdFastA]),
      icCompensation: statusOrNull(row[c.lineDiff.icCompensation]),
    },
    distance: {
      mode: statusOrNull(row[c.distanceProt.mode]),
      characteristicAngleDeg: numOrNull(row[c.distanceProt.characteristicAngleDeg]),
      z1XReachOhm: numOrNull(row[c.distanceProt.z1XReachOhm]),
      z1RphgOhm: numOrNull(row[c.distanceProt.z1RphgOhm]),
      z1RphphOhm: numOrNull(row[c.distanceProt.z1RphphOhm]),
      z1OperateDelayS: numOrNull(row[c.distanceProt.z1OperateDelayS]),
      z2XReachOhm: numOrNull(row[c.distanceProt.z2XReachOhm]),
      z2RphgOhm: numOrNull(row[c.distanceProt.z2RphgOhm]),
      z2RphphOhm: numOrNull(row[c.distanceProt.z2RphphOhm]),
      z2OperateDelayS: numOrNull(row[c.distanceProt.z2OperateDelayS]),
      z3XReachOhm: numOrNull(row[c.distanceProt.z3XReachOhm]),
      z3RphgOhm: numOrNull(row[c.distanceProt.z3RphgOhm]),
      z3RphphOhm: numOrNull(row[c.distanceProt.z3RphphOhm]),
      z3OperateDelayS: numOrNull(row[c.distanceProt.z3OperateDelayS]),
    },
    ocrBackup: {
      ctRatio: clean(row[c.ocrBackup.ctRatio]),
      ocPickupA: numOrNull(row[c.ocrBackup.ocPickupA]),
      ocTms: numOrNull(row[c.ocrBackup.ocTms]),
      ocHighsetPickupA: numOrNull(row[c.ocrBackup.ocHighsetPickupA]),
      ocHighsetTms: numOrNull(row[c.ocrBackup.ocHighsetTms]),
      gfPickupA: numOrNull(row[c.ocrBackup.gfPickupA]),
      gfTms: numOrNull(row[c.ocrBackup.gfTms]),
      gfHighsetPickupA: numOrNull(row[c.ocrBackup.gfHighsetPickupA]),
      gfHighsetTms: numOrNull(row[c.ocrBackup.gfHighsetTms]),
    },
    dataQuality: {
      hasCt: Boolean(clean(row[c.ctRatio])),
      hasVt: Boolean(clean(row[c.vtRatio])),
      hasLineDiff: statusOrNull(row[c.lineDiff.iDiff]) !== null,
      hasDistance: numOrNull(row[c.distanceProt.z1XReachOhm]) !== null,
      hasOcrBackup: numOrNull(row[c.ocrBackup.ocPickupA]) !== null,
    },
  };
}

// ABB RED670: Diff Mode (IdMin/EndSection slope settings) + Zone 1 with
// PP/PE-split reach/resistance (mirrors the XRIO ZMFPDIS structure found
// during the .rio/XRIO parser work), Zone 2/3 with shared (non-split) reach,
// Autorecloser + Synchronizing, and OCR/GFR backup.
const RED670_COLS = {
  id: 0,
  substation: 1,
  remoteBay: 2,
  sourceUrl: 3,
  model: 4,
  ctRatio: 7,
  vtRatio: 8,
  diffMode: {
    idMinPu: 10,
    endSection1Pu: 11,
    endSection2Pu: 12,
    slopeSection2Pct: 13,
    slopeSection3Pct: 14,
    idMinHighPu: 15,
    tIdMinHighS: 16,
  },
  zone1: {
    tppS: 32,
    x1ppOhm: 33,
    r1ppOhm: 34,
    x1peOhm: 35,
    x0Ohm: 37,
    r0Ohm: 38,
    rfppOhm: 39,
    rfpeOhm: 40,
    tppzOhmS: 41,
  },
  zone2: {
    x1Ohm: 43,
    r1Ohm: 44,
    x0Ohm: 45,
    r0Ohm: 46,
    rfppOhm: 53,
    rfpeOhm: 54,
    tppS: 55,
  },
  zone3: {
    x1Ohm: 57,
    r1Ohm: 58,
    x0Ohm: 59,
    r0Ohm: 60,
    rfppOhm: 61,
    rfpeOhm: 62,
    tppS: 63,
  },
  lineLengthKm: 78,
  autorecloser: {
    operation: 90,
    t1OnePhaseS: 92,
  },
  synchronizing: {
    operationSynch: 95,
    uDiffSynchPct: 101,
    freqDiffMaxHz: 102,
  },
  ocrBackup: {
    ctRatio: 114,
    ocPickupA: 116,
    ocTms: 117,
    gfPickupA: 121,
    gfTms: 122,
  },
};

function makeRed670Record(row, rowNumber) {
  const c = RED670_COLS;
  const bayId = clean(row[c.id]);
  const substation = clean(row[c.substation]);
  const remoteBay = clean(row[c.remoteBay]);
  if (!bayId || !substation || !remoteBay) return null;

  return {
    id: slugify([substation, remoteBay, bayId]),
    sourceRow: rowNumber,
    bayId,
    substation,
    remoteBay,
    model: clean(row[c.model]),
    ctRatio: clean(row[c.ctRatio]),
    vtRatio: clean(row[c.vtRatio]),
    diffMode: {
      idMinPu: numOrNull(row[c.diffMode.idMinPu]),
      endSection1Pu: numOrNull(row[c.diffMode.endSection1Pu]),
      endSection2Pu: numOrNull(row[c.diffMode.endSection2Pu]),
      slopeSection2Pct: numOrNull(row[c.diffMode.slopeSection2Pct]),
      slopeSection3Pct: numOrNull(row[c.diffMode.slopeSection3Pct]),
      idMinHighPu: numOrNull(row[c.diffMode.idMinHighPu]),
      tIdMinHighS: numOrNull(row[c.diffMode.tIdMinHighS]),
    },
    zone1: {
      tppS: numOrNull(row[c.zone1.tppS]),
      x1ppOhm: numOrNull(row[c.zone1.x1ppOhm]),
      r1ppOhm: numOrNull(row[c.zone1.r1ppOhm]),
      x1peOhm: numOrNull(row[c.zone1.x1peOhm]),
      x0Ohm: numOrNull(row[c.zone1.x0Ohm]),
      r0Ohm: numOrNull(row[c.zone1.r0Ohm]),
      rfppOhm: numOrNull(row[c.zone1.rfppOhm]),
      rfpeOhm: numOrNull(row[c.zone1.rfpeOhm]),
      tppzOhmS: numOrNull(row[c.zone1.tppzOhmS]),
    },
    zone2: {
      x1Ohm: numOrNull(row[c.zone2.x1Ohm]),
      r1Ohm: numOrNull(row[c.zone2.r1Ohm]),
      x0Ohm: numOrNull(row[c.zone2.x0Ohm]),
      r0Ohm: numOrNull(row[c.zone2.r0Ohm]),
      rfppOhm: numOrNull(row[c.zone2.rfppOhm]),
      rfpeOhm: numOrNull(row[c.zone2.rfpeOhm]),
      tppS: numOrNull(row[c.zone2.tppS]),
    },
    zone3: {
      x1Ohm: numOrNull(row[c.zone3.x1Ohm]),
      r1Ohm: numOrNull(row[c.zone3.r1Ohm]),
      x0Ohm: numOrNull(row[c.zone3.x0Ohm]),
      r0Ohm: numOrNull(row[c.zone3.r0Ohm]),
      rfppOhm: numOrNull(row[c.zone3.rfppOhm]),
      rfpeOhm: numOrNull(row[c.zone3.rfpeOhm]),
      tppS: numOrNull(row[c.zone3.tppS]),
    },
    lineLengthKm: numOrNull(row[c.lineLengthKm]),
    autorecloser: {
      operation: statusOrNull(row[c.autorecloser.operation]),
      t1OnePhaseS: numOrNull(row[c.autorecloser.t1OnePhaseS]),
    },
    synchronizing: {
      operationSynch: statusOrNull(row[c.synchronizing.operationSynch]),
      uDiffSynchPct: numOrNull(row[c.synchronizing.uDiffSynchPct]),
      freqDiffMaxHz: numOrNull(row[c.synchronizing.freqDiffMaxHz]),
    },
    ocrBackup: {
      ctRatio: clean(row[c.ocrBackup.ctRatio]),
      ocPickupA: numOrNull(row[c.ocrBackup.ocPickupA]),
      ocTms: numOrNull(row[c.ocrBackup.ocTms]),
      gfPickupA: numOrNull(row[c.ocrBackup.gfPickupA]),
      gfTms: numOrNull(row[c.ocrBackup.gfTms]),
    },
    dataQuality: {
      hasCt: Boolean(clean(row[c.ctRatio])),
      hasVt: Boolean(clean(row[c.vtRatio])),
      hasZone1: numOrNull(row[c.zone1.x1ppOhm]) !== null,
      hasAutorecloser: statusOrNull(row[c.autorecloser.operation]) !== null,
      hasOcrBackup: numOrNull(row[c.ocrBackup.ocPickupA]) !== null,
    },
  };
}

// NR PCS-931: Line Setting (X1L/R1L/X0L/R0L) + Diff Setting (87L.* IEC-61850
// style logical-node naming) + Dist Setting (21M1-3 ZG/ZP addressed
// separately per zone but NOT PP/PE-split the way RED670/P545 are — ZG and
// ZP carry their own Z_Set/t_Op pair per zone) + explicit Pilot Mode
// (85.Opt_PilotMode = POTT/PUTT/blocking) + Autoreclose.
const PCS931_COLS = {
  id: 0,
  substation: 1,
  remoteBay: 2,
  sourceUrl: 3,
  model: 4,
  vtRatio: 7,
  ctRatio: 8,
  lineSetting: {
    x1lOhm: 10,
    r1lOhm: 11,
    x0lOhm: 12,
    r0lOhm: 13,
    x0mOhm: 14,
    r0mOhm: 15,
    lineLengthKm: 16,
  },
  diffSetting: {
    pickupA: 18,
    kCrCt: 19,
    enabled: 20,
    enabledNeutral: 21,
  },
  distSetting: {
    realK0: 23,
    imagK0: 24,
    phi1ReachDeg: 25,
    z1gZSetOhm: 26,
    z1gTOpS: 27,
    z1pZSetOhm: 28,
    z1pTOpS: 29,
    z2gZSetOhm: 30,
    z2gTOpS: 31,
    z2pZSetOhm: 32,
    z2pTOpS: 33,
    z3gZSetOhm: 34,
    z3gTOpS: 35,
    z3pZSetOhm: 36,
    z3pTOpS: 37,
    pilotZSetOhm: 38,
    pilotMode: 40,
  },
  additional: {
    sotfEnabled: 43,
    outOfStepEnabled: 44,
    vtsEnabled: 48,
  },
  autoreclose: {
    arMode: 52,
  },
  ocrBackup: {
    ctRatio: 67,
    ocPickupA: 69,
    ocTms: 70,
    gfPickupA: 74,
    gfTms: 75,
  },
};

function makePcs931Record(row, rowNumber) {
  const c = PCS931_COLS;
  const bayId = clean(row[c.id]);
  const substation = clean(row[c.substation]);
  const remoteBay = clean(row[c.remoteBay]);
  if (!bayId || !substation || !remoteBay) return null;

  return {
    id: slugify([substation, remoteBay, bayId]),
    sourceRow: rowNumber,
    bayId,
    substation,
    remoteBay,
    model: clean(row[c.model]),
    ctRatio: clean(row[c.ctRatio]),
    vtRatio: clean(row[c.vtRatio]),
    lineSetting: {
      x1lOhm: numOrNull(row[c.lineSetting.x1lOhm]),
      r1lOhm: numOrNull(row[c.lineSetting.r1lOhm]),
      x0lOhm: numOrNull(row[c.lineSetting.x0lOhm]),
      r0lOhm: numOrNull(row[c.lineSetting.r0lOhm]),
      x0mOhm: numOrNull(row[c.lineSetting.x0mOhm]),
      r0mOhm: numOrNull(row[c.lineSetting.r0mOhm]),
      lineLengthKm: numOrNull(row[c.lineSetting.lineLengthKm]),
    },
    diffSetting: {
      pickupA: numOrNull(row[c.diffSetting.pickupA]),
      kCrCt: numOrNull(row[c.diffSetting.kCrCt]),
      enabled: statusOrNull(row[c.diffSetting.enabled]),
      enabledNeutral: statusOrNull(row[c.diffSetting.enabledNeutral]),
    },
    distSetting: {
      realK0: numOrNull(row[c.distSetting.realK0]),
      imagK0: numOrNull(row[c.distSetting.imagK0]),
      phi1ReachDeg: numOrNull(row[c.distSetting.phi1ReachDeg]),
      z1gZSetOhm: numOrNull(row[c.distSetting.z1gZSetOhm]),
      z1gTOpS: numOrNull(row[c.distSetting.z1gTOpS]),
      z1pZSetOhm: numOrNull(row[c.distSetting.z1pZSetOhm]),
      z1pTOpS: numOrNull(row[c.distSetting.z1pTOpS]),
      z2gZSetOhm: numOrNull(row[c.distSetting.z2gZSetOhm]),
      z2gTOpS: numOrNull(row[c.distSetting.z2gTOpS]),
      z2pZSetOhm: numOrNull(row[c.distSetting.z2pZSetOhm]),
      z2pTOpS: numOrNull(row[c.distSetting.z2pTOpS]),
      z3gZSetOhm: numOrNull(row[c.distSetting.z3gZSetOhm]),
      z3gTOpS: numOrNull(row[c.distSetting.z3gTOpS]),
      z3pZSetOhm: numOrNull(row[c.distSetting.z3pZSetOhm]),
      z3pTOpS: numOrNull(row[c.distSetting.z3pTOpS]),
      pilotZSetOhm: numOrNull(row[c.distSetting.pilotZSetOhm]),
      pilotMode: statusOrNull(row[c.distSetting.pilotMode]),
    },
    additional: {
      sotfEnabled: statusOrNull(row[c.additional.sotfEnabled]),
      outOfStepEnabled: statusOrNull(row[c.additional.outOfStepEnabled]),
      vtsEnabled: statusOrNull(row[c.additional.vtsEnabled]),
    },
    autoreclose: {
      arMode: statusOrNull(row[c.autoreclose.arMode]),
    },
    ocrBackup: {
      ctRatio: clean(row[c.ocrBackup.ctRatio]),
      ocPickupA: numOrNull(row[c.ocrBackup.ocPickupA]),
      ocTms: numOrNull(row[c.ocrBackup.ocTms]),
      gfPickupA: numOrNull(row[c.ocrBackup.gfPickupA]),
      gfTms: numOrNull(row[c.ocrBackup.gfTms]),
    },
    dataQuality: {
      hasCt: Boolean(clean(row[c.ctRatio])),
      hasVt: Boolean(clean(row[c.vtRatio])),
      hasDistance: numOrNull(row[c.distSetting.z1gZSetOhm]) !== null,
      hasDiff: statusOrNull(row[c.diffSetting.enabled]) !== null,
      hasScheme: statusOrNull(row[c.distSetting.pilotMode]) !== null,
      hasOcrBackup: numOrNull(row[c.ocrBackup.ocPickupA]) !== null,
    },
  };
}

// Toshiba GRL 200: Fault Locator + Distance with SEPARATE phase (Mho:
// ZnS-Mho.Angle/Reach) and ground (Quad: ZnG-X.Reach/ZnG-R.Angle/Reach)
// characteristics per zone (unlike layout A/RED670 which share one shape
// family across phase/ground), Carrier Distance/DEF (aided scheme), and
// Differential (DIFL.*) as a distinctly-named block from the distance zones.
const GRL200_COLS = {
  id: 0,
  substation: 1,
  remoteBay: 2,
  sourceUrl: 3,
  model: 4,
  ctRatio: 8,
  vtRatio: 9,
  faultLocator: {
    enabled: 11,
    lineLengthKm: 12,
    x1Ohm: 13,
    r1Ohm: 14,
    x0Ohm: 15,
    r0Ohm: 16,
  },
  phaseDistance: {
    characteristic: 19,
    z1AngleDeg: 24,
    z1ReachOhm: 25,
    tZ1S: 26,
    z2AngleDeg: 27,
    z2ReachOhm: 28,
    tZ2S: 29,
    z3AngleDeg: 30,
    z3ReachOhm: 31,
    tZ3S: 32,
  },
  groundDistance: {
    characteristic: 33,
    z1XReachOhm: 38,
    z1RAngleDeg: 39,
    z1RReachOhm: 40,
    tZ1S: 41,
    z2XReachOhm: 42,
    z2RAngleDeg: 43,
    z2RReachOhm: 44,
    tZ2S: 45,
    z3XReachOhm: 46,
    z3RAngleDeg: 52,
    z3RReachOhm: 53,
    tZ3S: 54,
  },
  carrierScheme: {
    distanceCarrier: 56,
    defCarrier: 59,
  },
  differential: {
    enabled: 76,
    i1A: 77,
    i2A: 78,
    slope1Pct: 79,
    slope2Pct: 80,
    delayS: 82,
  },
  ocrBackup: {
    ctRatio: 109,
    ocPickupA: 111,
    ocTms: 112,
    gfPickupA: 116,
    gfTms: 117,
  },
};

function makeGrl200Record(row, rowNumber) {
  const c = GRL200_COLS;
  const bayId = clean(row[c.id]);
  const substation = clean(row[c.substation]);
  const remoteBay = clean(row[c.remoteBay]);
  if (!bayId || !substation || !remoteBay) return null;

  return {
    id: slugify([substation, remoteBay, bayId]),
    sourceRow: rowNumber,
    bayId,
    substation,
    remoteBay,
    model: clean(row[c.model]),
    ctRatio: clean(row[c.ctRatio]),
    vtRatio: clean(row[c.vtRatio]),
    faultLocator: {
      enabled: statusOrNull(row[c.faultLocator.enabled]),
      lineLengthKm: numOrNull(row[c.faultLocator.lineLengthKm]),
      x1Ohm: numOrNull(row[c.faultLocator.x1Ohm]),
      r1Ohm: numOrNull(row[c.faultLocator.r1Ohm]),
      x0Ohm: numOrNull(row[c.faultLocator.x0Ohm]),
      r0Ohm: numOrNull(row[c.faultLocator.r0Ohm]),
    },
    phaseDistance: {
      characteristic: statusOrNull(row[c.phaseDistance.characteristic]),
      z1AngleDeg: numOrNull(row[c.phaseDistance.z1AngleDeg]),
      z1ReachOhm: numOrNull(row[c.phaseDistance.z1ReachOhm]),
      tZ1S: numOrNull(row[c.phaseDistance.tZ1S]),
      z2AngleDeg: numOrNull(row[c.phaseDistance.z2AngleDeg]),
      z2ReachOhm: numOrNull(row[c.phaseDistance.z2ReachOhm]),
      tZ2S: numOrNull(row[c.phaseDistance.tZ2S]),
      z3AngleDeg: numOrNull(row[c.phaseDistance.z3AngleDeg]),
      z3ReachOhm: numOrNull(row[c.phaseDistance.z3ReachOhm]),
      tZ3S: numOrNull(row[c.phaseDistance.tZ3S]),
    },
    groundDistance: {
      characteristic: statusOrNull(row[c.groundDistance.characteristic]),
      z1XReachOhm: numOrNull(row[c.groundDistance.z1XReachOhm]),
      z1RAngleDeg: numOrNull(row[c.groundDistance.z1RAngleDeg]),
      z1RReachOhm: numOrNull(row[c.groundDistance.z1RReachOhm]),
      tZ1S: numOrNull(row[c.groundDistance.tZ1S]),
      z2XReachOhm: numOrNull(row[c.groundDistance.z2XReachOhm]),
      z2RAngleDeg: numOrNull(row[c.groundDistance.z2RAngleDeg]),
      z2RReachOhm: numOrNull(row[c.groundDistance.z2RReachOhm]),
      tZ2S: numOrNull(row[c.groundDistance.tZ2S]),
      z3XReachOhm: numOrNull(row[c.groundDistance.z3XReachOhm]),
      z3RAngleDeg: numOrNull(row[c.groundDistance.z3RAngleDeg]),
      z3RReachOhm: numOrNull(row[c.groundDistance.z3RReachOhm]),
      tZ3S: numOrNull(row[c.groundDistance.tZ3S]),
    },
    carrierScheme: {
      distanceCarrier: statusOrNull(row[c.carrierScheme.distanceCarrier]),
      defCarrier: statusOrNull(row[c.carrierScheme.defCarrier]),
    },
    differential: {
      enabled: statusOrNull(row[c.differential.enabled]),
      i1A: numOrNull(row[c.differential.i1A]),
      i2A: numOrNull(row[c.differential.i2A]),
      slope1Pct: numOrNull(row[c.differential.slope1Pct]),
      slope2Pct: numOrNull(row[c.differential.slope2Pct]),
      delayS: numOrNull(row[c.differential.delayS]),
    },
    ocrBackup: {
      ctRatio: clean(row[c.ocrBackup.ctRatio]),
      ocPickupA: numOrNull(row[c.ocrBackup.ocPickupA]),
      ocTms: numOrNull(row[c.ocrBackup.ocTms]),
      gfPickupA: numOrNull(row[c.ocrBackup.gfPickupA]),
      gfTms: numOrNull(row[c.ocrBackup.gfTms]),
    },
    dataQuality: {
      hasCt: Boolean(clean(row[c.ctRatio])),
      hasVt: Boolean(clean(row[c.vtRatio])),
      hasPhaseDistance: numOrNull(row[c.phaseDistance.z1ReachOhm]) !== null,
      hasGroundDistance: numOrNull(row[c.groundDistance.z1XReachOhm]) !== null,
      hasDifferential: statusOrNull(row[c.differential.enabled]) !== null,
      hasOcrBackup: numOrNull(row[c.ocrBackup.ocPickupA]) !== null,
    },
  };
}

const EXTRACTORS = {
  "MICOM P545": makeP545Record,
  "MICOM P546": makeLayoutARecord,
  "MICOM P543": makeLayoutARecord,
  "MICOM P521": makeLayoutARecord,
  "MICOM P443": makeLayoutBRecord,
  "MICOM P442": makeLayoutBRecord,
  "MICOM P446": makeLayoutBRecord,
  L90: makeL90Record,
  "7SL87": makeSiemens7SRecord,
  "7SD61": makeSiemens7SRecord,
  RED670: makeRed670Record,
  "PCS-931": makePcs931Record,
  "GRL 200": makeGrl200Record,
};

const records = [];
const skippedModels = new Map();
for (let i = 15; i < rows.length; i += 1) {
  const row = rows[i];
  if (!row || !row[P545_COLS.id]) continue;
  const model = clean(row[P545_COLS.model]);
  const extractor = EXTRACTORS[model];
  if (!extractor) {
    skippedModels.set(model, (skippedModels.get(model) ?? 0) + 1);
    continue;
  }
  const record = extractor(row, i + 1);
  if (record) records.push(record);
}

// dataQuality fields differ per model (e.g. hasSotfTor only exists on
// layout A models), so completeness is reported per-model rather than as one
// cross-model aggregate that would silently miscount models lacking a field.
const recordsByModel = new Map();
for (const record of records) {
  const list = recordsByModel.get(record.model) ?? [];
  list.push(record);
  recordsByModel.set(record.model, list);
}
const perModel = {};
for (const [model, list] of recordsByModel) {
  const withOcrBackup = list.filter((r) => r.dataQuality.hasOcrBackup).length;
  perModel[model] = { recordCount: list.length, withOcrBackup };
}

const summary = {
  generatedAt: new Date().toISOString(),
  inputFile: path.basename(inputPath),
  sheetName: "HEL_PHT_TAP",
  modelsCovered: Object.keys(EXTRACTORS),
  recordCount: records.length,
  perModel,
  skippedModels: Object.fromEntries(skippedModels),
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  `${JSON.stringify({ summary, records }, null, 2)}\n`,
  "utf8"
);

console.log(`Extracted ${records.length} HEL_PHT_TAP records (${Object.keys(EXTRACTORS).join(", ")})`);
console.log(`Skipped models (no column map yet):`, summary.skippedModels);
console.log(`Output: ${outputPath}`);
