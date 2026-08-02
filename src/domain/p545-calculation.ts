export const P545_DISTANCE_CORE_RULE_VERSION =
  "micom-p545-distance-core.ciledug-alam-sutera.v1";

export const P545_MATHCAD_BENCHMARK = {
  sourceFile: "Tap Setting MiCom P545 GI Ciledug Bay Alam Sutera #1.xmcd",
  worksheetVersion: "3.0.3",
  generator: "Mathcad Professional 14.0",
  effectiveAt: "2021-03-17T00:00:00.000Z",
  validationDigest: "bd7da427af928bf3829224c0f7cc8f13",
} as const;

export type ComplexValue = {
  re: number;
  im: number;
};

export type P545LineSectionInput = {
  id: "L1" | "L2" | "L3" | "L4";
  label: string;
  r1OhmPerKm: number;
  x1OhmPerKm: number;
  lengthKm: number;
  sourceLocator: string;
};

export type P545DistanceCoreInput = {
  schema: "plms.p545-distance-core-input.v1";
  ruleVersion: typeof P545_DISTANCE_CORE_RULE_VERSION;
  source: typeof P545_MATHCAD_BENCHMARK;
  protectedLine: P545LineSectionInput;
  forwardAdjacentLine: P545LineSectionInput;
  reverseAdjacentLine: P545LineSectionInput;
  secondForwardAdjacentLine: P545LineSectionInput;
  transformer: {
    ratedMva: number;
    reactancePercent: number;
    systemVoltageKv: number;
    sourceLocator: string;
  };
  ct: {
    primaryA: number;
    secondaryA: number;
    sourceLocator: string;
  };
  vt: {
    primaryV: number;
    secondaryV: number;
    sourceLocator: string;
  };
  zonePolicy: {
    z1OwnLine: number;
    z2OwnLineMin: number;
    z2NextLine: number;
    transformerZ2: number;
    z3OwnAndReverseMin: number;
    z3ReverseLine: number;
    z3SecondForwardLine: number;
    transformerZ3: number;
    reverseZ3OwnLine: number;
    infeedFactorK3: number;
    t1Seconds: number;
    t2ShortSeconds: number;
    t2LongSeconds: number;
    t3ShortSeconds: number;
    t3LongSeconds: number;
  };
};

export type P545FormulaTrace = {
  key: string;
  label: string;
  formula: string;
  inputKeys: string[];
  value: number | ComplexValue;
  unit: "ohm-primary" | "ohm-secondary" | "degree" | "ratio" | "second";
  sourceLocator: string;
};

export type P545ParityRow = {
  key: string;
  label: string;
  expected: number;
  actual: number;
  absoluteDelta: number;
  relativeDelta: number;
  tolerance: number;
  unit: "ohm-primary" | "ohm-secondary" | "degree" | "ratio" | "second";
  status: "exact" | "within-tolerance" | "mismatch";
  sourceLocator: string;
};

export type P545DistanceCoreResult = {
  schema: "plms.p545-distance-core-result.v1";
  ruleVersion: typeof P545_DISTANCE_CORE_RULE_VERSION;
  source: typeof P545_MATHCAD_BENCHMARK;
  outputs: {
    impedanceConversionFactor: number;
    linePrimary: ComplexValue;
    linePrimaryMagnitudeOhm: number;
    lineAngleDeg: number;
    z1SecondaryOhm: number;
    z2Primary: ComplexValue;
    z2SecondaryOhm: number;
    z3Primary: ComplexValue;
    z3SecondaryOhm: number;
    z3ReversePrimary: ComplexValue;
    z3ReverseSecondaryOhm: number;
    t1Seconds: number;
    t2Seconds: number;
    t3Seconds: number;
  };
  trace: P545FormulaTrace[];
  parity: {
    status: "pass" | "fail";
    tolerance: number;
    matched: number;
    mismatched: number;
    maxAbsoluteDelta: number;
    rows: P545ParityRow[];
  };
};

export const P545_CILEDUG_ALAM_SUTERA_BENCHMARK_INPUT: P545DistanceCoreInput = {
  schema: "plms.p545-distance-core-input.v1",
  ruleVersion: P545_DISTANCE_CORE_RULE_VERSION,
  source: P545_MATHCAD_BENCHMARK,
  protectedLine: {
    id: "L1",
    label: "Ciledug - Alam Sutera #1",
    r1OhmPerKm: 0.014448,
    x1OhmPerKm: 0.062439,
    lengthKm: 3.25,
    sourceLocator: "R11a, X11a, L11a",
  },
  forwardAdjacentLine: {
    id: "L2",
    label: "Forward adjacent equivalent L2",
    r1OhmPerKm: 0.014,
    x1OhmPerKm: 0.089,
    lengthKm: 6.8,
    sourceLocator: "R21a, X21a, L21a",
  },
  reverseAdjacentLine: {
    id: "L3",
    label: "Reverse adjacent equivalent L3",
    r1OhmPerKm: 0.014,
    x1OhmPerKm: 0.089,
    lengthKm: 6.8,
    sourceLocator: "R31a, X31a, L31a",
  },
  secondForwardAdjacentLine: {
    id: "L4",
    label: "Second forward adjacent equivalent L4",
    r1OhmPerKm: 0.014448,
    x1OhmPerKm: 0.088532,
    lengthKm: 4.7,
    sourceLocator: "R41a, X41a, L41a",
  },
  transformer: {
    ratedMva: 60,
    reactancePercent: 12,
    systemVoltageKv: 150,
    sourceLocator: "MVA, X_trafo, XT1",
  },
  ct: {
    primaryA: 3000,
    secondaryA: 1,
    sourceLocator: "CT1 = 3000 / 1",
  },
  vt: {
    primaryV: 150000,
    secondaryV: 100,
    sourceLocator: "PT1 = 150000 / 100",
  },
  zonePolicy: {
    z1OwnLine: 0.8,
    z2OwnLineMin: 1.2,
    z2NextLine: 0.8,
    transformerZ2: 0.5,
    z3OwnAndReverseMin: 1.2,
    z3ReverseLine: 1.2,
    z3SecondForwardLine: 0.8,
    transformerZ3: 0.8,
    reverseZ3OwnLine: 0.1,
    infeedFactorK3: 1,
    t1Seconds: 0,
    t2ShortSeconds: 0.4,
    t2LongSeconds: 0.8,
    t3ShortSeconds: 1.2,
    t3LongSeconds: 1.6,
  },
};

const SAVED_MATHCAD_RESULTS = {
  impedanceConversionFactor: 2,
  linePrimaryR: 0.046956000000000005,
  linePrimaryX: 0.20292675000000002,
  linePrimaryMagnitudeSecondary: 0.41657715636632076,
  lineAngleDeg: 76.971409846484335,
  z1SecondaryOhm: 0.33326172509305663,
  z2PrimaryR: 0.0984928,
  z2PrimaryX: 0.5496694,
  z2SecondaryOhm: 1.1168478516757776,
  z3SecondaryOhm: 1.9692832485533915,
  z3ReversePrimaryR: 0.0046956000000000012,
  z3ReversePrimaryX: 0.020292675000000003,
  z3ReverseSecondaryOhm: 0.041657715636632078,
  t1Seconds: 0,
  t2Seconds: 0.4,
  t3Seconds: 1.6,
} as const;

const PARITY_TOLERANCE = 1e-12;

export function calculateP545DistanceCore(
  input: P545DistanceCoreInput = P545_CILEDUG_ALAM_SUTERA_BENCHMARK_INPUT
): P545DistanceCoreResult {
  validateInput(input);

  const zL1 = lineImpedance(input.protectedLine);
  const zL2 = lineImpedance(input.forwardAdjacentLine);
  const zL3 = lineImpedance(input.reverseAdjacentLine);
  const zL4 = lineImpedance(input.secondForwardAdjacentLine);
  const ctRatio = input.ct.primaryA / input.ct.secondaryA;
  const vtRatio = input.vt.primaryV / input.vt.secondaryV;
  const n1 = ctRatio / vtRatio;
  const transformerX =
    (input.transformer.reactancePercent / 100) *
    input.transformer.systemVoltageKv ** 2 /
    input.transformer.ratedMva;
  const policy = input.zonePolicy;

  const z1Primary = scale(zL1, policy.z1OwnLine);
  const z1SecondaryOhm = magnitude(scale(z1Primary, n1));

  const z2Min = scale(zL1, policy.z2OwnLineMin);
  const z2NextCandidate = scale(
    add(zL1, scale(zL2, policy.z2NextLine)),
    policy.z1OwnLine
  );
  const z2TransformerLimit = scale(
    add(zL1, complex(0, policy.transformerZ2 * transformerX)),
    policy.z1OwnLine
  );
  const z2AboveMinimum = maxMagnitude(z2Min, z2NextCandidate);
  const z2Primary = minMagnitude(z2AboveMinimum, z2TransformerLimit);
  const z2SecondaryOhm = magnitude(scale(z2Primary, n1));

  const z3Min = scale(add(zL1, zL3), policy.z3OwnAndReverseMin);
  const z3FirstCandidate = scale(
    add(zL1, scale(zL3, policy.z3ReverseLine * policy.infeedFactorK3)),
    policy.z1OwnLine
  );
  const z3SecondCandidate = scale(
    add(
      zL1,
      scale(
        add(zL3, scale(zL4, policy.z3SecondForwardLine)),
        policy.infeedFactorK3 * policy.z3SecondForwardLine
      )
    ),
    policy.z1OwnLine
  );
  const z3TransformerLimit = scale(
    add(zL1, complex(0, policy.transformerZ3 * transformerX)),
    policy.z1OwnLine
  );
  const z3AdjacentMaximum = maxMagnitude(z3FirstCandidate, z3SecondCandidate);
  const z3AboveMinimum = maxMagnitude(z3AdjacentMaximum, z3Min);
  const z3Primary = minMagnitude(z3AboveMinimum, z3TransformerLimit);
  const z3SecondaryOhm = magnitude(scale(z3Primary, n1));

  const z3ReversePrimary = scale(zL1, policy.reverseZ3OwnLine);
  const z3ReverseSecondaryOhm = magnitude(z3ReversePrimary) * n1;
  const t2Seconds =
    magnitude(add(zL1, scale(zL2, policy.z2NextLine))) > magnitude(z2Primary)
      ? policy.t2ShortSeconds
      : policy.t2LongSeconds;
  const z3CoordinationReach = add(
    zL1,
    scale(
      add(zL3, scale(zL4, policy.z3SecondForwardLine)),
      policy.infeedFactorK3 * policy.z3SecondForwardLine
    )
  );
  const t3Seconds =
    magnitude(z3CoordinationReach) > magnitude(z3AboveMinimum)
      ? policy.t3ShortSeconds
      : policy.t3LongSeconds;

  const linePrimaryMagnitudeOhm = magnitude(zL1);
  const lineAngleDeg = angleDeg(zL1);
  const formulaTrace: P545FormulaTrace[] = [
    trace("ZL1", "Protected-line impedance", "(R11a + jX11a) x L11a", ["R11a", "X11a", "L11a"], zL1, "ohm-primary", "ZL11"),
    trace("ZL2", "Forward adjacent impedance", "(R21a + jX21a) x L21a", ["R21a", "X21a", "L21a"], zL2, "ohm-primary", "ZL21"),
    trace("ZL3", "Reverse adjacent impedance", "(R31a + jX31a) x L31a", ["R31a", "X31a", "L31a"], zL3, "ohm-primary", "ZL31"),
    trace("ZL4", "Second forward impedance", "(R41a + jX41a) x L41a", ["R41a", "X41a", "L41a"], zL4, "ohm-primary", "ZL41"),
    trace("n1", "Primary-to-relay impedance factor", "(CTp / CTs) / (VTp / VTs)", ["CT1", "PT1"], n1, "ratio", "n1"),
    trace("XT1", "Transformer reactance", "(Xtrafo / 100) x kV^2 / MVA", ["X_trafo", "MVA"], transformerX, "ohm-primary", "XT1"),
    trace("Z1P", "Zone 1 primary", "0.8 x ZL1", ["ZL1"], z1Primary, "ohm-primary", "Z1P"),
    trace("Z1", "Zone 1 relay reach", "abs(Z1P x n1)", ["Z1P", "n1"], z1SecondaryOhm, "ohm-secondary", "Z1"),
    trace("Z2min", "Zone 2 minimum", "1.2 x ZL1", ["ZL1"], z2Min, "ohm-primary", "Z2min"),
    trace("Z2mak1", "Zone 2 adjacent candidate", "0.8 x (ZL1 + 0.8 x ZL2)", ["ZL1", "ZL2"], z2NextCandidate, "ohm-primary", "Z2mak1"),
    trace("ZTrf2", "Zone 2 transformer limit", "0.8 x (ZL1 + j0.5 x XT1)", ["ZL1", "XT1"], z2TransformerLimit, "ohm-primary", "ZTrf2"),
    trace("Z2P", "Zone 2 primary selected", "min|Z|(max|Z|(Z2min, Z2mak1), ZTrf2)", ["Z2min", "Z2mak1", "ZTrf2"], z2Primary, "ohm-primary", "Z2P"),
    trace("Z2", "Zone 2 relay reach", "abs(Z2P x n1)", ["Z2P", "n1"], z2SecondaryOhm, "ohm-secondary", "Z2"),
    trace("Z3min", "Zone 3 minimum", "1.2 x (ZL1 + ZL3)", ["ZL1", "ZL3"], z3Min, "ohm-primary", "Z3min"),
    trace("Z3mak1", "Zone 3 first candidate", "0.8 x (ZL1 + 1.2 x ZL3 x K3)", ["ZL1", "ZL3", "K3"], z3FirstCandidate, "ohm-primary", "Z3mak1"),
    trace("Z3mak2", "Zone 3 second candidate", "0.8 x (ZL1 + 0.8 x K3 x (ZL3 + 0.8 x ZL4))", ["ZL1", "ZL3", "ZL4", "K3"], z3SecondCandidate, "ohm-primary", "Z3mak2"),
    trace("ZTrf3", "Zone 3 transformer limit", "0.8 x (ZL1 + j0.8 x XT1)", ["ZL1", "XT1"], z3TransformerLimit, "ohm-primary", "ZTrf3"),
    trace("Z3P", "Zone 3 primary selected", "min|Z|(max|Z|(Z3mak1, Z3mak2, Z3min), ZTrf3)", ["Z3mak1", "Z3mak2", "Z3min", "ZTrf3"], z3Primary, "ohm-primary", "Z3P"),
    trace("Z3", "Zone 3 relay reach", "abs(Z3P x n1)", ["Z3P", "n1"], z3SecondaryOhm, "ohm-secondary", "Z3"),
    trace("Z3R", "Reverse Zone 3 primary", "0.1 x ZL1", ["ZL1"], z3ReversePrimary, "ohm-primary", "Z3R"),
    trace("Z3RS", "Reverse Zone 3 relay reach", "abs(Z3R) x n1", ["Z3R", "n1"], z3ReverseSecondaryOhm, "ohm-secondary", "Z3RS"),
    trace("T1", "Zone 1 delay", "0", [], policy.t1Seconds, "second", "T1"),
    trace("T2", "Zone 2 delay", "0.4 s if |Z2b| > |Z2P| else 0.8 s", ["Z2b", "Z2P"], t2Seconds, "second", "T2"),
    trace("T3", "Zone 3 delay", "1.2 s if |Z3b| > |Z3P pre-cap| else 1.6 s", ["Z3b", "Z32"], t3Seconds, "second", "T3"),
  ];

  const parityRows = buildParityRows({
    impedanceConversionFactor: n1,
    linePrimaryR: zL1.re,
    linePrimaryX: zL1.im,
    linePrimaryMagnitudeSecondary: linePrimaryMagnitudeOhm * n1,
    lineAngleDeg,
    z1SecondaryOhm,
    z2PrimaryR: z2Primary.re,
    z2PrimaryX: z2Primary.im,
    z2SecondaryOhm,
    z3SecondaryOhm,
    z3ReversePrimaryR: z3ReversePrimary.re,
    z3ReversePrimaryX: z3ReversePrimary.im,
    z3ReverseSecondaryOhm,
    t1Seconds: policy.t1Seconds,
    t2Seconds,
    t3Seconds,
  });
  const mismatched = parityRows.filter((row) => row.status === "mismatch").length;

  return {
    schema: "plms.p545-distance-core-result.v1",
    ruleVersion: P545_DISTANCE_CORE_RULE_VERSION,
    source: P545_MATHCAD_BENCHMARK,
    outputs: {
      impedanceConversionFactor: n1,
      linePrimary: zL1,
      linePrimaryMagnitudeOhm,
      lineAngleDeg,
      z1SecondaryOhm,
      z2Primary,
      z2SecondaryOhm,
      z3Primary,
      z3SecondaryOhm,
      z3ReversePrimary,
      z3ReverseSecondaryOhm,
      t1Seconds: policy.t1Seconds,
      t2Seconds,
      t3Seconds,
    },
    trace: formulaTrace,
    parity: {
      status: mismatched === 0 ? "pass" : "fail",
      tolerance: PARITY_TOLERANCE,
      matched: parityRows.length - mismatched,
      mismatched,
      maxAbsoluteDelta: Math.max(...parityRows.map((row) => row.absoluteDelta)),
      rows: parityRows,
    },
  };
}

function buildParityRows(actual: Record<keyof typeof SAVED_MATHCAD_RESULTS, number>) {
  const metadata: Record<
    keyof typeof SAVED_MATHCAD_RESULTS,
    { label: string; unit: P545ParityRow["unit"]; sourceLocator: string }
  > = {
    impedanceConversionFactor: { label: "n1 impedance factor", unit: "ratio", sourceLocator: "saved result n1" },
    linePrimaryR: { label: "ZL1 real", unit: "ohm-primary", sourceLocator: "saved result ZL11.real" },
    linePrimaryX: { label: "ZL1 imaginary", unit: "ohm-primary", sourceLocator: "saved result ZL11.imag" },
    linePrimaryMagnitudeSecondary: { label: "ZL relay magnitude", unit: "ohm-secondary", sourceLocator: "saved result ZL" },
    lineAngleDeg: { label: "Line angle", unit: "degree", sourceLocator: "saved result thetaL" },
    z1SecondaryOhm: { label: "Zone 1 relay reach", unit: "ohm-secondary", sourceLocator: "saved result Z1" },
    z2PrimaryR: { label: "Z2P real", unit: "ohm-primary", sourceLocator: "saved result Z2P.real" },
    z2PrimaryX: { label: "Z2P imaginary", unit: "ohm-primary", sourceLocator: "saved result Z2P.imag" },
    z2SecondaryOhm: { label: "Zone 2 relay reach", unit: "ohm-secondary", sourceLocator: "saved result Z2" },
    z3SecondaryOhm: { label: "Zone 3 relay reach", unit: "ohm-secondary", sourceLocator: "saved result Z3" },
    z3ReversePrimaryR: { label: "Z3 reverse real", unit: "ohm-primary", sourceLocator: "saved result Z3R.real" },
    z3ReversePrimaryX: { label: "Z3 reverse imaginary", unit: "ohm-primary", sourceLocator: "saved result Z3R.imag" },
    z3ReverseSecondaryOhm: { label: "Z3 reverse relay reach", unit: "ohm-secondary", sourceLocator: "saved result Z3RS" },
    t1Seconds: { label: "Zone 1 delay", unit: "second", sourceLocator: "saved result T1" },
    t2Seconds: { label: "Zone 2 delay", unit: "second", sourceLocator: "saved result T2" },
    t3Seconds: { label: "Zone 3 delay", unit: "second", sourceLocator: "saved result T3" },
  };

  return (Object.keys(SAVED_MATHCAD_RESULTS) as Array<keyof typeof SAVED_MATHCAD_RESULTS>).map(
    (key): P545ParityRow => {
      const expected = SAVED_MATHCAD_RESULTS[key];
      const value = actual[key];
      const absoluteDelta = Math.abs(value - expected);
      const relativeDelta = absoluteDelta / Math.max(Math.abs(expected), Number.EPSILON);
      return {
        key,
        ...metadata[key],
        expected,
        actual: value,
        absoluteDelta,
        relativeDelta,
        tolerance: PARITY_TOLERANCE,
        status:
          absoluteDelta === 0
            ? "exact"
            : absoluteDelta <= PARITY_TOLERANCE
              ? "within-tolerance"
              : "mismatch",
      };
    }
  );
}

function validateInput(input: P545DistanceCoreInput) {
  if (input.ruleVersion !== P545_DISTANCE_CORE_RULE_VERSION) {
    throw new Error(`Unsupported P545 rule version: ${input.ruleVersion}.`);
  }
  const positive = [
    input.protectedLine.lengthKm,
    input.forwardAdjacentLine.lengthKm,
    input.reverseAdjacentLine.lengthKm,
    input.secondForwardAdjacentLine.lengthKm,
    input.transformer.ratedMva,
    input.transformer.systemVoltageKv,
    input.ct.primaryA,
    input.ct.secondaryA,
    input.vt.primaryV,
    input.vt.secondaryV,
  ];
  if (positive.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("P545 distance-core input contains a non-positive engineering value.");
  }
}

function lineImpedance(line: P545LineSectionInput): ComplexValue {
  return complex(line.r1OhmPerKm * line.lengthKm, line.x1OhmPerKm * line.lengthKm);
}

function complex(re: number, im: number): ComplexValue {
  return { re, im };
}

function add(left: ComplexValue, right: ComplexValue): ComplexValue {
  return complex(left.re + right.re, left.im + right.im);
}

function scale(value: ComplexValue, factor: number): ComplexValue {
  return complex(value.re * factor, value.im * factor);
}

function magnitude(value: ComplexValue) {
  return Math.hypot(value.re, value.im);
}

function angleDeg(value: ComplexValue) {
  return Math.atan2(value.im, value.re) * (180 / Math.PI);
}

function minMagnitude(left: ComplexValue, right: ComplexValue) {
  return magnitude(left) < magnitude(right) ? left : right;
}

function maxMagnitude(left: ComplexValue, right: ComplexValue) {
  return magnitude(left) > magnitude(right) ? left : right;
}

function trace(
  key: string,
  label: string,
  formula: string,
  inputKeys: string[],
  value: number | ComplexValue,
  unit: P545FormulaTrace["unit"],
  sourceLocator: string
): P545FormulaTrace {
  return { key, label, formula, inputKeys, value, unit, sourceLocator };
}
