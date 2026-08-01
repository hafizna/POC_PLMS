import assert from "node:assert/strict";
import {
  adaptRioXrioResult,
  parseMicomCourierSet,
  vendorImportToVerificationText,
} from "../src/domain/vendor-import";

const encoder = new TextEncoder();

function ascii(value: string) {
  return Array.from(encoder.encode(value));
}

function recordPrefix(address: string, label: string) {
  const group = address.slice(0, 2);
  const ordinal = Number.parseInt(address.slice(2), 16);
  return [
    0xff,
    0x00,
    ordinal,
    group.charCodeAt(1),
    group.charCodeAt(0),
    0,
    0,
    0,
    0,
    0,
    0x18,
    0x13,
    ...ascii(label.padEnd(17, " ").slice(0, 17)),
  ];
}

function numericRecord(
  address: string,
  label: string,
  mantissa: number,
  exponent: number,
  unitCode: number
) {
  const raw = mantissa < 0 ? mantissa + 0x10000 : mantissa;
  return [
    ...recordPrefix(address, label),
    0x25,
    0x6b,
    0x2c,
    0x04,
    raw & 0xff,
    (raw >> 8) & 0xff,
    exponent + 126,
    unitCode,
    0xff,
    0x00,
    0xff,
    0x00,
    0xff,
    0x00,
  ];
}

function enumRecord(
  address: string,
  label: string,
  selected: number,
  choices: string[]
) {
  return [
    ...recordPrefix(address, label),
    0x25,
    0x73,
    0x50,
    0x02,
    selected & 0xff,
    (selected >> 8) & 0xff,
    0x24,
    0x02,
    0,
    0,
    0x24,
    0x02,
    (choices.length - 1) & 0xff,
    0,
    0x24,
    0x02,
    1,
    0,
    0xff,
    0x00,
    0xff,
    0x00,
    0xff,
    0x00,
    ...choices.flatMap((choice) => [...ascii(choice.padEnd(16, " ")), 0]),
  ];
}

const header = ascii(
  [
    "APP: Courier",
    "TYPE: Setting",
    "FORMAT: 1.0",
    "MODEL: P54531AH7M0570K",
    "S1_LANG: ENGLISH",
    "Created by : MiCOM S1 Agile",
    "",
  ].join("\r\n")
);
const bytes = new Uint8Array([
  ...header,
  ...numericRecord("3202", "Z1 Ph. Reach", 1225, -2, 0x03),
  ...numericRecord("3411", "tZ2 Ph. Delay", 4000, -4, 0x08),
  ...numericRecord("3302", "Phase Is1", 2000, -4, 0x00),
  ...enumRecord("31D3", "Load Blinders", 1, ["Disabled", "Enabled"]),
]);

const result = parseMicomCourierSet(bytes, "fixture-p545.set");
assert.equal(result.model, "P54531AH7M0570K");
assert.equal(result.family, "P545");
assert.equal(result.coverage.totalRecords, 4);
assert.equal(result.coverage.decodedRecords, 4);

const z1 = result.parameters.find(
  (parameter) => parameter.rawName === "Z1 Ph. Reach"
);
assert.equal(z1?.address, "3202");
assert.equal(z1?.value, 12.25);
assert.equal(z1?.unit, "ohm");
assert.equal(z1?.canonicalKey, "distance.zone1.phase_reach");

const delay = result.parameters.find(
  (parameter) => parameter.rawName === "tZ2 Ph. Delay"
);
assert.equal(delay?.value, 0.4);
assert.equal(delay?.unit, "s");

const blinders = result.parameters.find(
  (parameter) => parameter.rawName === "Load Blinders"
);
assert.equal(blinders?.value, "Enabled");
assert.equal(blinders?.canonicalKey, "distance.load_blinder.enabled");

const rio = adaptRioXrioResult(
  {
    kind: "xrio",
    zones: [{
      label: "Zone 1",
      shapeSource: "named-fields",
      xReachOhm: 4.2,
      rfppOhmPerLoop: 8.5,
      timeDelayPpS: 0,
    }],
    earthComp: { k0: 0.7, angleDeg: 15, source: "fixture" },
  },
  "readback-7SL87.xrio",
  "SIPROTEC 7SL87"
);
assert.equal(rio.adapterId, "rio-xrio-v1");
assert.equal(rio.vendor, "Siemens / SIPROTEC");
assert.equal(rio.parameters.find((item) => item.rawName === "Z1 Ph. Reach")?.value, 4.2);
assert.match(vendorImportToVerificationText(rio), /t?Z1 Ph\. (?:Reach|Delay)=/);

console.log(
  `Vendor import tests passed (${result.coverage.decodedRecords} Courier records decoded + RIO/XRIO canonical handoff).`
);
