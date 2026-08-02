import assert from "node:assert/strict";
import {
  P545_CILEDUG_ALAM_SUTERA_BENCHMARK_INPUT,
  P545_DISTANCE_CORE_RULE_VERSION,
  calculateP545DistanceCore,
  type P545DistanceCoreInput,
} from "../src/domain/p545-calculation";

const benchmark = calculateP545DistanceCore();

assert.equal(benchmark.ruleVersion, P545_DISTANCE_CORE_RULE_VERSION);
assert.equal(benchmark.parity.status, "pass");
assert.equal(benchmark.parity.matched, 16);
assert.equal(benchmark.parity.mismatched, 0);
assert.equal(benchmark.parity.maxAbsoluteDelta, 0);
assert.equal(benchmark.outputs.impedanceConversionFactor, 2);
assert.equal(benchmark.outputs.linePrimary.re, 0.046956000000000005);
assert.equal(benchmark.outputs.linePrimary.im, 0.20292675000000002);
assert.equal(benchmark.outputs.z1SecondaryOhm, 0.33326172509305663);
assert.deepEqual(benchmark.outputs.z2Primary, { re: 0.0984928, im: 0.5496694 });
assert.equal(benchmark.outputs.z2SecondaryOhm, 1.1168478516757776);
assert.equal(benchmark.outputs.z3SecondaryOhm, 1.9692832485533915);
assert.equal(benchmark.outputs.z3ReverseSecondaryOhm, 0.041657715636632078);
assert.deepEqual(
  [benchmark.outputs.t1Seconds, benchmark.outputs.t2Seconds, benchmark.outputs.t3Seconds],
  [0, 0.4, 1.6]
);
assert.ok(benchmark.trace.length >= 20);
assert.ok(benchmark.trace.some((step) => step.key === "Z2mak1"));
assert.ok(benchmark.trace.some((step) => step.key === "ZTrf3"));
assert.ok(benchmark.trace.every((step) => step.formula && step.sourceLocator));

const changed = structuredClone(
  P545_CILEDUG_ALAM_SUTERA_BENCHMARK_INPUT
) as P545DistanceCoreInput;
changed.protectedLine.lengthKm = 3.3;
const changedResult = calculateP545DistanceCore(changed);
assert.equal(changedResult.parity.status, "fail");
assert.ok(changedResult.parity.mismatched > 0);
assert.ok(
  changedResult.parity.rows.some(
    (row) => row.key === "linePrimaryR" && row.status === "mismatch"
  )
);

const invalid = structuredClone(
  P545_CILEDUG_ALAM_SUTERA_BENCHMARK_INPUT
) as P545DistanceCoreInput;
invalid.vt.secondaryV = 0;
assert.throws(
  () => calculateP545DistanceCore(invalid),
  /non-positive engineering value/
);

console.log(
  "P545 calculation regression passed: 16/16 saved XMCD results match, intermediate trace is present, and changed/invalid inputs fail explicitly."
);
