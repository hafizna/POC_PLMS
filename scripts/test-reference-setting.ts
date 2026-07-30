import assert from "node:assert/strict";
import { CROSSCHECK_WORKBOOK_REGISTRY } from "../src/domain/crosscheck-workbook-registry";
import {
  calculateDistanceReference,
  calculateOcrGfrReference,
  calculateTransformerReference,
  type ReferenceResult,
} from "../src/domain/reference-setting";

function value(result: ReferenceResult, key: string): number | string | null {
  const found = result.metrics.find((metric) => metric.key === key);
  assert.ok(found, `Metric ${key} tidak ditemukan`);
  return found.value;
}

function numberValue(result: ReferenceResult, key: string): number {
  const found = value(result, key);
  assert.equal(typeof found, "number", `Metric ${key} bukan angka`);
  return found;
}

function close(
  actual: number,
  expected: number,
  tolerance: number,
  label: string
) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ± ${tolerance}, got ${actual}`
  );
}

const registry = CROSSCHECK_WORKBOOK_REGISTRY;
const legacyOcr = registry.legacyCases.ocrGfr as {
  substation: string;
  cccOrTsaA: number;
  ctPrimaryA: number;
  ctSecondaryA: number;
  operatingTimeS: number;
  voltageKv: number;
  fault3phA: number;
  fault1phA: number;
};

const ocr = calculateOcrGfrReference({
  substation: legacyOcr.substation,
  bayType: "LINE",
  cccOrTsaA: legacyOcr.cccOrTsaA,
  ctPrimaryA: legacyOcr.ctPrimaryA,
  ctSecondaryA: legacyOcr.ctSecondaryA,
  hasBusProtection: true,
  operatingTimeS: legacyOcr.operatingTimeS,
  voltageKv: legacyOcr.voltageKv,
  fault3phA: legacyOcr.fault3phA,
  fault1phA: legacyOcr.fault1phA,
});

close(numberValue(ocr, "ocr-primary"), 4094.4, 1e-8, "OCR primary");
close(numberValue(ocr, "ocr-secondary"), 1.0236, 1e-8, "OCR secondary");
assert.equal(value(ocr, "ocr-delay"), "0.2917 (SI)");
close(numberValue(ocr, "gfr-primary"), 682.4, 1e-8, "GFR primary");
assert.equal(value(ocr, "gfr-delay"), "0.5875 (SI)");

const legacyDistance = registry.legacyCases.distance as {
  localSubstation: string;
  remoteSubstation: string;
  cccA: number;
  ctPrimaryA: number;
  ctSecondaryA: number;
  ptPrimaryV: number;
  ptSecondaryV: number;
  selectedLines: Array<{ name: string }>;
};
const selectedLines = legacyDistance.selectedLines.map(({ name }) => {
  const line = registry.digsilentLineDb.records.find(
    (record) => record.name === name
  );
  assert.ok(line, `Line benchmark ${name} tidak ditemukan`);
  return line;
});

const distance = calculateDistanceReference({
  localSubstation: legacyDistance.localSubstation,
  remoteSubstation: legacyDistance.remoteSubstation,
  l1: selectedLines[0],
  l2: selectedLines[1],
  l3: selectedLines[2],
  l4: selectedLines[3],
  cccA: legacyDistance.cccA,
  ctPrimaryA: legacyDistance.ctPrimaryA,
  ctSecondaryA: legacyDistance.ctSecondaryA,
  ptPrimaryV: legacyDistance.ptPrimaryV,
  ptSecondaryV: legacyDistance.ptSecondaryV,
  transformerPercentZ: 12.5,
  transformerMva: 60,
  transformerHvKv: 150,
  hasGeneratorOrIbtAtRemote: false,
});

close(numberValue(distance, "Z1-z-primary"), 3.489, 0.001, "Distance Z1 primary");
close(numberValue(distance, "Z1-z-secondary"), 4.238, 0.001, "Distance Z1 secondary");
close(numberValue(distance, "Z2-z-primary"), 9.227, 0.001, "Distance Z2 primary");
close(numberValue(distance, "Z2-z-secondary"), 11.207, 0.001, "Distance Z2 secondary");
close(numberValue(distance, "Z3-z-primary"), 13.991, 0.001, "Distance Z3 primary");
close(numberValue(distance, "Z3-z-secondary"), 16.994, 0.001, "Distance Z3 secondary");
close(numberValue(distance, "k0-real"), 0.678, 0.001, "Distance K0 real");
close(numberValue(distance, "k0-imag"), -0.085, 0.001, "Distance K0 imaginary");

const transformer = calculateTransformerReference({
  substation: "TELUK NAGA",
  bayName: "TRF2",
  manufacturer: "UNINDO >2010",
  powerMva: 60,
  impedancePercent: 12,
  winding: "YYD",
  hvKv: 150,
  lvKv: 20,
  phaseCtHvPrimaryA: 300,
  phaseCtHvSecondaryA: 5,
  phaseCtLvPrimaryA: 2000,
  phaseCtLvSecondaryA: 5,
  neutralCtHvPrimaryA: 2000,
  neutralCtHvSecondaryA: 5,
  neutralCtLvPrimaryA: 2000,
  neutralCtLvSecondaryA: 5,
  ngrCtPrimaryA: 2000,
  ngrCtSecondaryA: 5,
  ngrOhm: 12,
  ngrMaxCurrentA: 1000,
  ngrWithstandS: 10,
  scheme: "SETTING_UIT_UID",
  sourceR1Pu: 0.0018,
  sourceX1Pu: 0.0167,
  sourceR2Pu: 0,
  sourceX2Pu: 0.02,
  sourceR0Pu: 0.00618,
  sourceX0Pu: 0.02627,
  ohlR1Ohm: 0,
  ohlX1Ohm: 0,
});

close(numberValue(transformer, "ref-hv-is1"), 46.18802154, 1e-6, "REF HV IS1");
close(numberValue(transformer, "ref-lv-is1"), 346.4101615, 1e-6, "REF LV IS1");
close(numberValue(transformer, "ocr-hv"), 277.1281292, 1e-6, "OCR HV");
close(numberValue(transformer, "ocr-hv-tms"), 0.3738741181, 1e-9, "OCR HV TMS");
close(numberValue(transformer, "ocr-hv-moment"), 2309.401077, 1e-6, "OCR HV momentary");
close(numberValue(transformer, "gfr-hv-tms"), 0.6585174576, 1e-9, "GFR HV TMS");
close(numberValue(transformer, "ocr-lv-tms"), 0.2492494121, 1e-9, "OCR LV TMS");
close(numberValue(transformer, "gfr-lv-tms"), 0.1470876916, 1e-9, "GFR LV TMS");
close(numberValue(transformer, "sbef-lti"), 0.1661474957, 1e-9, "SBEF LTI");

console.log(
  "Reference-setting regression passed: OCR/GFR, Distance, and transformer benchmark values match the legacy workbook."
);
