import assert from "node:assert/strict";
import {
  P545_AUXILIARY_RULE_VERSION,
  P545_CILEDUG_ALAM_SUTERA_AUXILIARY_INPUT,
  calculateP545AuxiliaryBlocks,
  type P545AuxiliaryInput,
} from "../src/domain/p545-auxiliary-calculation";

const benchmark = calculateP545AuxiliaryBlocks();

assert.equal(benchmark.ruleVersion, P545_AUXILIARY_RULE_VERSION);
assert.equal(benchmark.parity.status, "pass");
assert.equal(benchmark.parity.matched, 39);
assert.equal(benchmark.parity.mismatched, 0);
assert.ok(benchmark.parity.maxAbsoluteDelta <= benchmark.parity.tolerance);
assert.deepEqual(benchmark.parity.byBlock, {
  "residual-compensation": { matched: 2, mismatched: 0 },
  "resistive-reach": { matched: 19, mismatched: 0 },
  "load-blinder-psb": { matched: 8, mismatched: 0 },
  "line-differential": { matched: 10, mismatched: 0 },
});

assert.equal(benchmark.outputs.residualCompensation.magnitude, 1.0151445200359346);
assert.ok(
  Math.abs(benchmark.outputs.residualCompensation.angleDeg - -37.193351731462457) <=
    benchmark.parity.tolerance
);
assert.deepEqual(benchmark.outputs.resistiveReach.phaseReachByZone, {
  z1: 47.158358122043396,
  z2: 58.947947652554241,
  z3: 65.497719613949158,
});
assert.deepEqual(benchmark.outputs.resistiveReach.groundReachByZone, {
  z1: 38.813463474932831,
  z2: 48.516829343666039,
  z3: 60.646036679582544,
});
assert.ok(
  Math.abs(
    benchmark.outputs.loadBlinderAndPowerSwing.blinderSecondaryOhm -
      53.571428571428577
  ) <= benchmark.parity.tolerance
);
assert.equal(benchmark.outputs.lineDifferential.selectedIs1SecondaryA, 0.2);
assert.equal(benchmark.outputs.lineDifferential.is2SecondaryA, 2);
assert.equal(benchmark.outputs.lineDifferential.slopeK1, 0.3);
assert.equal(benchmark.outputs.lineDifferential.slopeK2, 1.5);
assert.equal(benchmark.outputs.autoreclosePolicy.classification, "extracted-policy");
assert.deepEqual(
  {
    mode: benchmark.outputs.autoreclosePolicy.tripMode,
    dead: benchmark.outputs.autoreclosePolicy.deadTime1Seconds,
    reclaim: benchmark.outputs.autoreclosePolicy.reclaimTimeSeconds,
    pulse: benchmark.outputs.autoreclosePolicy.pulseTimeSeconds,
  },
  { mode: "1 - 3", dead: 1, reclaim: 40, pulse: 0.2 }
);
assert.ok(benchmark.trace.length >= 40);
assert.ok(
  benchmark.trace
    .filter((step) => step.block === "autoreclose-policy")
    .every((step) => step.formula.includes("no calculation expression"))
);

const changed = structuredClone(
  P545_CILEDUG_ALAM_SUTERA_AUXILIARY_INPUT
) as P545AuxiliaryInput;
changed.loadAndFault.fault3PhasePrimaryA = 33220;
const changedResult = calculateP545AuxiliaryBlocks(changed);
assert.equal(changedResult.parity.status, "fail");
assert.ok(
  changedResult.parity.rows.some(
    (row) => row.key === "arcResistancePrimaryOhm" && row.status === "mismatch"
  )
);
assert.equal(
  changedResult.parity.byBlock["resistive-reach"].mismatched > 0,
  true
);

const invalid = structuredClone(
  P545_CILEDUG_ALAM_SUTERA_AUXILIARY_INPUT
) as P545AuxiliaryInput;
invalid.lineDifferential.lineSusceptanceMicroSiemensPerKm = 0;
assert.throws(
  () => calculateP545AuxiliaryBlocks(invalid),
  /non-positive engineering value/
);

console.log(
  "P545 auxiliary regression passed: 39/39 XMCD results match across kZ0, resistive reach, load/PSB, and LCD; AR remains explicit extracted policy."
);
