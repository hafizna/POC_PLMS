import assert from "node:assert/strict";
import { CROSSCHECK_WORKBOOK_REGISTRY } from "../src/domain/crosscheck-workbook-registry";
import { calculateOcrGfrReference } from "../src/domain/reference-setting";
import { extractTapFields } from "../src/lib/ocr";
import {
  compareReferenceToActual,
  demoActualText,
  mapManualParameter,
  parseActualSettingText,
} from "../src/domain/setting-verification";

const legacy = CROSSCHECK_WORKBOOK_REGISTRY.legacyCases.ocrGfr as {
  substation: string;
  cccOrTsaA: number;
  ctPrimaryA: number;
  ctSecondaryA: number;
  operatingTimeS: number;
  voltageKv: number;
  fault3phA: number;
  fault1phA: number;
};

const reference = calculateOcrGfrReference({
  substation: legacy.substation,
  bayType: "LINE",
  cccOrTsaA: legacy.cccOrTsaA,
  ctPrimaryA: legacy.ctPrimaryA,
  ctSecondaryA: legacy.ctSecondaryA,
  hasBusProtection: true,
  operatingTimeS: legacy.operatingTimeS,
  voltageKv: legacy.voltageKv,
  fault3phA: legacy.fault3phA,
  fault1phA: legacy.fault1phA,
});

const siprotecText = `
DEVICE=SIPROTEC 7SJ63
OC Pickup=1.0236 A sec
OC TMS=0.2940
OCR PU=1.0236 pu
GF Pickup=0.1706 A sec
GF TMS=0.5875
GFR PU=0.1706 pu
Vendor Special Flag=ENABLED
`;
const parsed = parseActualSettingText(siprotecText, {
  referenceKind: "ocr-gfr",
  currentBasis: "secondary",
  impedanceBasis: "secondary",
});

assert.equal(parsed.vendor, "Siemens / SIPROTEC");
assert.deepEqual(
  parsed.parameters.map((parameter) => parameter.id).sort(),
  [
    "gfr-delay",
    "gfr-pu",
    "gfr-secondary",
    "ocr-delay",
    "ocr-pu",
    "ocr-secondary",
  ]
);
assert.equal(
  parsed.parameters.find((parameter) => parameter.id === "ocr-secondary")
    ?.value,
  1.0236
);

const engineering = compareReferenceToActual(reference, parsed.parameters, {
  kind: "ocr-gfr",
  profile: "engineering",
  currentBasis: "secondary",
  impedanceBasis: "secondary",
});
assert.equal(engineering.summary.mismatch, 0);
assert.equal(engineering.summary["within-tolerance"], 1);
assert.equal(engineering.summary["missing-actual"], 0);
assert.equal(engineering.decision, "REVIEW");

const strict = compareReferenceToActual(reference, parsed.parameters, {
  kind: "ocr-gfr",
  profile: "strict",
  currentBasis: "secondary",
  impedanceBasis: "secondary",
});
assert.equal(strict.summary.mismatch, 1);
assert.equal(strict.decision, "FAIL");

const demo = parseActualSettingText(
  demoActualText("ocr-gfr", reference),
  {
    referenceKind: "ocr-gfr",
    currentBasis: "secondary",
    impedanceBasis: "secondary",
  }
);
const demoReport = compareReferenceToActual(reference, demo.parameters, {
  kind: "ocr-gfr",
  profile: "engineering",
  currentBasis: "secondary",
  impedanceBasis: "secondary",
});
assert.ok(demoReport.summary.mismatch >= 1);
assert.equal(demoReport.decision, "FAIL");

const distance = parseActualSettingText(
  "Z1 Reach=4.238 ohm\nZone 2 delay=0.4 s\nK0 Real=0.678",
  {
    referenceKind: "distance",
    currentBasis: "secondary",
    impedanceBasis: "secondary",
  }
);
assert.deepEqual(
  distance.parameters.map((parameter) => parameter.id),
  ["Z1-z-secondary", "Z2-delay", "k0-real"]
);

const transformer = parseActualSettingText(
  "Differential pickup=0.3 pu\nOCR HV TMS=0.373874\nSBEF pickup=192.45 A",
  {
    referenceKind: "transformer",
    currentBasis: "primary",
    impedanceBasis: "primary",
  }
);
assert.deepEqual(
  transformer.parameters.map((parameter) => parameter.id),
  ["diff", "ocr-hv-tms", "sbef"]
);

const manual = mapManualParameter(
  {
    rawName: "Vendor Zone One",
    rawValue: "4.238 ohm",
    sourceLine: 7,
    reason: "unknown",
  },
  "Z1-z-secondary"
);
assert.equal(manual?.id, "Z1-z-secondary");
assert.equal(manual?.value, 4.238);
assert.equal(manual?.confidence, "review");

const scannedTapFields = extractTapFields(
  "Z1 Ph. Reach 12.657 Ohm tZ2 Ph. Delay 0.800 s " +
    "Ip> Pickup 0.665 x In 0.665 A (sekunder) 2661.6 A (primer) " +
    "Ip Time Dial 0.365 IEp> Pickup 0.111 x In 0.111 A (sekunder) " +
    "IEp Time Dial 0.657"
);
assert.deepEqual(
  scannedTapFields.map((field) => [field.field, field.value]),
  [
    ["Z1 reach", "12.657"],
    ["tZ2 delay", "0.800"],
    ["OC pickup (I>)", "0.665"],
    ["OC TMS", "0.365"],
    ["GF pickup (Ie>)", "0.111"],
    ["GF TMS", "0.657"],
  ]
);

console.log(
  "Setting-verification regression passed: alias normalization, basis selection, tolerance profiles, manual mapping, and decision logic."
);
