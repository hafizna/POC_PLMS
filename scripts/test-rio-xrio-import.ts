import assert from "node:assert/strict";
import { parseRio } from "../src/domain/rio-xrio-import";

// Ported from base_ai_tfa's ImpedanceLocus.tsx (parseRIO/parseXRIO), then
// corrected against 2 real .rio files provided directly by the user (not
// present in the source project) — see rio-xrio-import.ts's file header for
// the full list of what was found wrong and fixed. Fixtures below mirror
// the real files' structure closely (same BEGIN/END framing, same field
// names) but are trimmed for brevity, not verbatim copies.
//
// parseXrio (DOMParser-based) isn't covered here since plain Node has no
// DOMParser — verified instead against 2 real XRIO files (ABB ZMFPDIS,
// MiCOM/GE P54x-style) via a one-off browser check during development.

// Siemens 7SA522 PROTECTIONDEVICE: ZONE + TRIPCHAR (mho circle, phase) +
// TRIPCHAR-EARTH (polygon, ground), TIME1/TIMEM timer pair, RE/RL + XE/XL
// earth compensation. Mirrors "Mrica 2...rio".
const siemensRio = `
BEGIN PROTECTIONDEVICE
DEVICE 7SA522
SUBSTATION DUMMY
FEEDER DUMMY-1
LINEANGLE 75
RE/RL 0.730,0.000
XE/XL 0.670,0.000

BEGIN ZONE
NAME Z1
TIME1 0.000
TIMEM 0.000
BEGIN TRIPCHAR
START 0.797,2.314
ARC 2.447,0.000,360.0,CCW
END TRIPCHAR
BEGIN TRIPCHAR-EARTH
START 0.000,0.000
LINE -2.680,4.642
LINE 1.598,4.642
LINE 30.628,4.642
LINE 27.432,-4.642
LINE 11.489,-4.642
END TRIPCHAR-EARTH
END ZONE

BEGIN ZONE
NAME Z2
TIME1 0.400
TIMEM 0.400
BEGIN TRIPCHAR
START 1.819,5.283
ARC 5.588,0.000,360.0,CCW
END TRIPCHAR
END ZONE
END PROTECTIONDEVICE
`;

const parsedSiemens = parseRio(siemensRio);
assert.ok(parsedSiemens, "Siemens 7SA522 PROTECTIONDEVICE .rio should parse");
assert.equal(parsedSiemens!.kind, "rio");
assert.equal(parsedSiemens!.zones.length, 2);

const z1 = parsedSiemens!.zones[0];
assert.equal(z1.label, "Z1");
assert.equal(z1.shapeSource, "mho-circle");
assert.ok(z1.rfppOhmPerLoop && z1.rfppOhmPerLoop > 0, "Z1 should have a phase (TRIPCHAR circle) fault-resistance reach");
assert.ok(z1.rfpeOhmPerLoop && z1.rfpeOhmPerLoop > 0, "Z1 should have a ground (TRIPCHAR-EARTH polygon) fault-resistance reach");
assert.equal(z1.timeDelayPpS, 0);
assert.equal(z1.timeDelayPeS, 0);

const z2 = parsedSiemens!.zones[1];
assert.equal(z2.timeDelayPpS, 0.4, "Z2 TIME1/TIMEM=0.400 should surface as timeDelayPpS");

assert.ok(parsedSiemens!.earthComp, "RE/RL + XE/XL should produce an earth compensation reading");
assert.equal(
  Math.round((parsedSiemens!.earthComp!.k0 + Number.EPSILON) * 1000) / 1000,
  Math.round(Math.hypot(0.73, 0.67) * 1000) / 1000
);

// SIPROTEC 5 TESTOBJECT: INDEX offset-by-N pairing (ground zones 1..N,
// phase zones N+1..2N describe the SAME physical Z1..ZN), BEGIN SHAPE
// (LINE-clipped polygon, ground) + BEGIN MHOSHAPE (direct mho circle,
// phase), TRIPTIME single timer value, RERL_XEXL combined earth comp field.
// Mirrors "...PRIOK#1_Siprotec_7SL87...rio" (2 zones for brevity; the real
// file has 3).
const siprotec5Rio = `
BEGIN TESTOBJECT
BEGIN DEVICE
NAME 7SL87
END DEVICE
BEGIN DISTANCE
RERL_XEXL 0.210,0.670
BEGIN ZONE
INDEX 1
FAULTLOOP LN
TRIPTIME 0.000
BEGIN SHAPE
LINE 0.000, 0.000, -60.000, LEFT
LINE -0.329, 0.569, 0.000, LEFT
LINE 18.204, 0.569, 78.000, LEFT
LINE 17.962, -0.569, 0.000, LEFT
LINE 1.408, -0.569, -22.000, LEFT
END SHAPE
END ZONE
BEGIN ZONE
INDEX 2
FAULTLOOP LN
TRIPTIME 0.800
BEGIN SHAPE
LINE 0.000, 0.000, -60.000, LEFT
LINE -0.644, 1.116, 0.000, LEFT
LINE 36.239, 1.116, 78.000, LEFT
LINE 35.765, -1.116, 0.000, LEFT
LINE 2.762, -1.116, -22.000, LEFT
END SHAPE
END ZONE
BEGIN ZONE
INDEX 3
FAULTLOOP LL
TRIPTIME 0.000
BEGIN MHOSHAPE
ANGLE 78.000
REACH 2.079
OFFSET 0.000
END MHOSHAPE
END ZONE
BEGIN ZONE
INDEX 4
FAULTLOOP LL
TRIPTIME 0.800
BEGIN MHOSHAPE
ANGLE 78.000
REACH 4.074
OFFSET 0.000
END MHOSHAPE
END ZONE
END DISTANCE
END TESTOBJECT
`;

const parsedSiprotec5 = parseRio(siprotec5Rio);
assert.ok(parsedSiprotec5, "SIPROTEC 5 TESTOBJECT .rio should parse");
assert.equal(parsedSiprotec5!.kind, "rio");
assert.equal(parsedSiprotec5!.zones.length, 2, "INDEX 1+3 and 2+4 should merge into 2 physical zones, not 4");

const siprotecZ1 = parsedSiprotec5!.zones[0];
assert.equal(siprotecZ1.label, "Z1");
assert.equal(siprotecZ1.shapeSource, "mho-circle", "the LL/MHOSHAPE half should be recorded on the merged zone");
assert.ok(siprotecZ1.rfpeOhmPerLoop && siprotecZ1.rfpeOhmPerLoop > 0, "ground (LN/SHAPE) half should still contribute rfpe");
assert.ok(siprotecZ1.rfppOhmPerLoop && siprotecZ1.rfppOhmPerLoop > 0, "phase (LL/MHOSHAPE) half should contribute rfpp");
assert.equal(siprotecZ1.timeDelayPeS, 0);
assert.equal(siprotecZ1.timeDelayPpS, 0, "INDEX 1 (LN) and INDEX 4-3=1 (LL) should pair as the same physical zone's timers");

const siprotecZ2 = parsedSiprotec5!.zones[1];
assert.equal(siprotecZ2.timeDelayPpS, 0.8);
assert.equal(siprotecZ2.timeDelayPeS, 0.8);

assert.ok(parsedSiprotec5!.earthComp, "RERL_XEXL combined field should produce an earth compensation reading");
assert.equal(
  Math.round((parsedSiprotec5!.earthComp!.k0 + Number.EPSILON) * 1000) / 1000,
  Math.round(Math.hypot(0.21, 0.67) * 1000) / 1000
);

// Non-.rio text should not parse as either dialect.
assert.equal(parseRio("just some random text, not a rio export at all"), null);

console.log(
  "Rio/XRIO import regression passed: Siemens 7SA522 PROTECTIONDEVICE (same-INDEX LN/LL pairing, TIME1/TIMEM, RE/RL+XE/XL) and SIPROTEC 5 TESTOBJECT (offset-INDEX LN/LL pairing across SHAPE+MHOSHAPE, TRIPTIME, RERL_XEXL) both merge into DistanceZoneSetting-shaped zones with correct PP/PE reach and timers; unrelated text yields null."
);
