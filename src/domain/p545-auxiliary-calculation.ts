import {
  P545_CILEDUG_ALAM_SUTERA_BENCHMARK_INPUT,
  P545_MATHCAD_BENCHMARK,
  type ComplexValue,
} from "./p545-calculation";

export const P545_AUXILIARY_RULE_VERSION =
  "micom-p545-auxiliary.ciledug-alam-sutera.v1";

export type P545AuxiliaryBlock =
  | "residual-compensation"
  | "resistive-reach"
  | "load-blinder-psb"
  | "line-differential"
  | "autoreclose-policy";

export type P545AuxiliaryInput = {
  schema: "plms.p545-auxiliary-input.v1";
  ruleVersion: typeof P545_AUXILIARY_RULE_VERSION;
  source: typeof P545_MATHCAD_BENCHMARK;
  protectedLine: {
    r1OhmPerKm: number;
    x1OhmPerKm: number;
    lengthKm: number;
    r0AdditionalOhmPerKm: number;
    x0ToX1Multiplier: number;
  };
  instrumentTransformers: {
    ctPrimaryA: number;
    ctSecondaryA: number;
    vtPrimaryV: number;
    vtSecondaryV: number;
  };
  loadAndFault: {
    continuousCurrentPrimaryA: number;
    relayNominalCurrentA: number;
    systemVoltageV: number;
    fault3PhasePrimaryA: number;
    arcConductorSpacing: number;
  };
  policy: {
    phaseLoadMargin: number;
    groundLoadMargin: number;
    groundMinimumPrimaryOhm: number;
    phaseZone3Factor: number;
    groundZone3Factor: number;
    phaseZone2Factor: number;
    groundZone2Factor: number;
    phaseZone1Factor: number;
    groundZone1Factor: number;
    loadAngleDeg: number;
    blinderFactor: number;
    powerSwingDeltaFactor: number;
    powerSwingR5Factor: number;
    powerSwingZ5Factor: number;
  };
  lineDifferential: {
    normalDifferentialPrimaryA: number;
    lineSusceptanceMicroSiemensPerKm: number;
    chargingPickupFactor: number;
    minimumPickupPerUnit: number;
    highSetPickupPerUnit: number;
    slopeK1: number;
    slopeK2: number;
    ctAPrimaryA: number;
    ctASecondaryA: number;
    ctBPrimaryA: number;
    ctBSecondaryA: number;
  };
  autoreclosePolicy: {
    tripMode: string;
    deadTime1Seconds: number;
    reclaimTimeSeconds: number;
    pulseTimeSeconds: number;
    evidenceLocator: string;
  };
};

export type P545AuxiliaryTrace = {
  key: string;
  block: P545AuxiliaryBlock;
  label: string;
  formula: string;
  value: number | string | ComplexValue;
  unit: string;
  sourceLocator: string;
};

export type P545AuxiliaryParityRow = {
  key: string;
  block: Exclude<P545AuxiliaryBlock, "autoreclose-policy">;
  label: string;
  expected: number;
  actual: number;
  absoluteDelta: number;
  relativeDelta: number;
  tolerance: number;
  unit: string;
  status: "exact" | "within-tolerance" | "mismatch";
  sourceLocator: string;
};

export type P545AuxiliaryResult = {
  schema: "plms.p545-auxiliary-result.v1";
  ruleVersion: typeof P545_AUXILIARY_RULE_VERSION;
  source: typeof P545_MATHCAD_BENCHMARK;
  outputs: {
    residualCompensation: {
      z1Primary: ComplexValue;
      z0Primary: ComplexValue;
      kZ0: ComplexValue;
      magnitude: number;
      angleDeg: number;
    };
    resistiveReach: {
      currentLimitPrimaryA: number;
      loadCurrentSecondaryA: number;
      minimumLoadImpedanceSecondaryOhm: number;
      maximumPhaseReachSecondaryOhm: number;
      maximumGroundReachSecondaryOhm: number;
      minimumPhaseReachSecondaryOhm: number;
      minimumGroundReachSecondaryOhm: number;
      phaseReachByZone: { z1: number; z2: number; z3: number };
      groundReachByZone: { z1: number; z2: number; z3: number };
    };
    loadBlinderAndPowerSwing: {
      loadImpedancePrimaryOhm: number;
      loadImpedanceSecondaryOhm: number;
      loadAngleDeg: number;
      blinderSecondaryOhm: number;
      blinderPrimaryOhm: number;
      deltaRSecondaryOhm: number;
      deltaXSecondaryOhm: number;
      r5SecondaryOhm: number;
      z5SecondaryOhm: number;
    };
    lineDifferential: {
      normalSusceptanceMicroSiemens: number;
      lineSusceptanceMicroSiemens: number;
      capacitiveReactancePrimaryOhm: number;
      chargingCurrentPrimaryA: number;
      chargingCurrentSecondaryA: number;
      calculatedIs1SecondaryA: number;
      selectedIs1SecondaryA: number;
      slopeK1: number;
      is2SecondaryA: number;
      slopeK2: number;
      ctCorrectionA: number;
      ctCorrectionB: number;
    };
    autoreclosePolicy: P545AuxiliaryInput["autoreclosePolicy"] & {
      classification: "extracted-policy";
    };
  };
  trace: P545AuxiliaryTrace[];
  parity: {
    status: "pass" | "fail";
    tolerance: number;
    matched: number;
    mismatched: number;
    maxAbsoluteDelta: number;
    byBlock: Record<
      Exclude<P545AuxiliaryBlock, "autoreclose-policy">,
      { matched: number; mismatched: number }
    >;
    rows: P545AuxiliaryParityRow[];
  };
};

const distanceInput = P545_CILEDUG_ALAM_SUTERA_BENCHMARK_INPUT;

export const P545_CILEDUG_ALAM_SUTERA_AUXILIARY_INPUT: P545AuxiliaryInput = {
  schema: "plms.p545-auxiliary-input.v1",
  ruleVersion: P545_AUXILIARY_RULE_VERSION,
  source: P545_MATHCAD_BENCHMARK,
  protectedLine: {
    r1OhmPerKm: distanceInput.protectedLine.r1OhmPerKm,
    x1OhmPerKm: distanceInput.protectedLine.x1OhmPerKm,
    lengthKm: distanceInput.protectedLine.lengthKm,
    r0AdditionalOhmPerKm: 0.15,
    x0ToX1Multiplier: 3,
  },
  instrumentTransformers: {
    ctPrimaryA: distanceInput.ct.primaryA,
    ctSecondaryA: distanceInput.ct.secondaryA,
    vtPrimaryV: distanceInput.vt.primaryV,
    vtSecondaryV: distanceInput.vt.secondaryV,
  },
  loadAndFault: {
    continuousCurrentPrimaryA: 1428,
    relayNominalCurrentA: 1,
    systemVoltageV: 150000,
    fault3PhasePrimaryA: 26240,
    arcConductorSpacing: 4.3,
  },
  policy: {
    phaseLoadMargin: 0.4,
    groundLoadMargin: 0.2,
    groundMinimumPrimaryOhm: 20,
    phaseZone3Factor: 0.9,
    groundZone3Factor: 0.5,
    phaseZone2Factor: 0.9,
    groundZone2Factor: 0.8,
    phaseZone1Factor: 0.8,
    groundZone1Factor: 0.8,
    loadAngleDeg: 30,
    blinderFactor: 0.51,
    powerSwingDeltaFactor: 0.3,
    powerSwingR5Factor: 0.85,
    powerSwingZ5Factor: 2,
  },
  lineDifferential: {
    normalDifferentialPrimaryA: 42,
    lineSusceptanceMicroSiemensPerKm: 132,
    chargingPickupFactor: 2.5,
    minimumPickupPerUnit: 0.2,
    highSetPickupPerUnit: 2,
    slopeK1: 0.3,
    slopeK2: 1.5,
    ctAPrimaryA: 3000,
    ctASecondaryA: 1,
    ctBPrimaryA: 2000,
    ctBSecondaryA: 1,
  },
  autoreclosePolicy: {
    tripMode: "1 - 3",
    deadTime1Seconds: 1,
    reclaimTimeSeconds: 40,
    pulseTimeSeconds: 0.2,
    evidenceLocator:
      "AUTORECLOSE text regions: 1P Trip Mode, 1P Dead Time 1, Reclaim Time, Pulse Time",
  },
};

const SAVED_RESULTS = {
  kZ0Magnitude: 1.0151445200359346,
  kZ0AngleDeg: -37.193351731462457,
  ctPrimaryAtRelayIn: 3000,
  continuousCurrentPrimaryA: 1428,
  loadCurrentSecondaryA: 0.476,
  phaseLoadMarginOhm: 48.516829343666039,
  groundLoadMarginOhm: 24.25841467183302,
  fault2PhasePrimaryA: 22724.506595303668,
  arcResistancePrimaryOhm: 0.098267385350884973,
  phaseReachMaximumOhm: 72.775244015499055,
  groundReachMaximumOhm: 97.033658687332064,
  phaseReachMinimumOhm: 0.19653477070176995,
  groundReachMinimumOhm: 40,
  phaseZone3Ohm: 65.497719613949158,
  groundZone3Ohm: 60.646036679582544,
  groundFactorSquareRoot: 0.81294817607410874,
  groundFactorCubeRoot: 0.87145877500638214,
  phaseZone2Ohm: 58.947947652554241,
  groundZone2Ohm: 48.516829343666039,
  phaseZone1Ohm: 47.158358122043396,
  groundZone1Ohm: 38.813463474932831,
  loadImpedancePrimaryOhm: 60.646036679582544,
  loadImpedanceSecondaryOhm: 121.29207335916509,
  blinderSecondaryOhm: 53.571428571428577,
  blinderPrimaryOhm: 26.785714285714288,
  powerSwingDeltaROhm: 19.649315884184748,
  powerSwingDeltaXOhm: 19.649315884184748,
  powerSwingR5Ohm: 45.535714285714292,
  powerSwingZ5Ohm: 0.83315431273264151,
  normalSusceptanceMicroSiemens: 484.97422611928562,
  lineSusceptanceMicroSiemens: 214.5,
  capacitiveReactancePrimaryOhm: 4662.0046620046624,
  chargingCurrentPrimaryA: 18.576244911176207,
  chargingCurrentSecondaryA: 0.0061920816370587359,
  calculatedIs1SecondaryA: 0.015480204092646839,
  selectedIs1SecondaryA: 0.2,
  is2SecondaryA: 2,
  ctCorrectionA: 1.5,
  ctCorrectionB: 1,
} as const;

const PARITY_TOLERANCE = 1e-12;

export function calculateP545AuxiliaryBlocks(
  input: P545AuxiliaryInput = P545_CILEDUG_ALAM_SUTERA_AUXILIARY_INPUT
): P545AuxiliaryResult {
  validateInput(input);

  const line = input.protectedLine;
  const it = input.instrumentTransformers;
  const load = input.loadAndFault;
  const policy = input.policy;
  const lcd = input.lineDifferential;
  const z1Primary = complex(
    line.r1OhmPerKm * line.lengthKm,
    line.x1OhmPerKm * line.lengthKm
  );
  const z0Primary = complex(
    (line.r1OhmPerKm + line.r0AdditionalOhmPerKm) * line.lengthKm,
    line.x1OhmPerKm * line.x0ToX1Multiplier * line.lengthKm
  );
  const kZ0 = divideComplex(subtract(z0Primary, z1Primary), scale(z1Primary, 3));
  const kZ0Magnitude = magnitude(kZ0);
  const kZ0AngleDeg = angleDeg(kZ0);

  const ctRatio = it.ctPrimaryA / it.ctSecondaryA;
  const vtRatio = it.vtPrimaryV / it.vtSecondaryV;
  const impedanceFactor = ctRatio / vtRatio;
  const ctPrimaryAtRelayIn = ctRatio * load.relayNominalCurrentA;
  const currentLimitPrimaryA = Math.min(
    load.continuousCurrentPrimaryA,
    ctPrimaryAtRelayIn
  );
  const loadCurrentSecondaryA = currentLimitPrimaryA / ctRatio;
  const nominalPhaseVoltageSecondaryV = it.vtSecondaryV / Math.sqrt(3);
  const minimumLoadImpedanceSecondaryOhm =
    nominalPhaseVoltageSecondaryV / loadCurrentSecondaryA;
  const primaryLineVoltageV = vtRatio * it.vtSecondaryV;
  const maximumLoadImpedanceSecondaryOhm =
    (primaryLineVoltageV / (Math.sqrt(3) * currentLimitPrimaryA)) * impedanceFactor;
  const phaseLoadMarginOhm =
    policy.phaseLoadMargin * minimumLoadImpedanceSecondaryOhm;
  const groundLoadMarginOhm =
    policy.groundLoadMargin * minimumLoadImpedanceSecondaryOhm;
  const fault2PhasePrimaryA =
    (Math.sqrt(3) / 2) * load.fault3PhasePrimaryA;
  const arcResistancePrimaryOhm =
    (28710 * load.arcConductorSpacing) / fault2PhasePrimaryA ** 1.4;
  const phaseReachMaximumOhm =
    minimumLoadImpedanceSecondaryOhm - phaseLoadMarginOhm;
  const groundReachMaximumOhm =
    minimumLoadImpedanceSecondaryOhm - groundLoadMarginOhm;
  const phaseReachMinimumOhm = arcResistancePrimaryOhm * impedanceFactor;
  const groundReachMinimumOhm =
    policy.groundMinimumPrimaryOhm * impedanceFactor;
  const phaseZone3Ohm = policy.phaseZone3Factor * phaseReachMaximumOhm;
  const groundZone3Ohm =
    policy.groundZone3Factor * minimumLoadImpedanceSecondaryOhm;
  const groundFactorSquareRoot =
    1.001 * Math.sqrt(groundReachMinimumOhm / groundZone3Ohm);
  const groundFactorCubeRoot =
    1.001 * (groundReachMinimumOhm / groundZone3Ohm) ** 0.333;
  const phaseZone2Ohm = policy.phaseZone2Factor * phaseZone3Ohm;
  const groundZone2Ohm = policy.groundZone2Factor * groundZone3Ohm;
  const phaseZone1Ohm = policy.phaseZone1Factor * phaseZone2Ohm;
  const groundZone1Ohm = policy.groundZone1Factor * groundZone2Ohm;

  const loadImpedancePrimaryOhm =
    primaryLineVoltageV / Math.sqrt(3) / currentLimitPrimaryA;
  const loadImpedanceSecondaryOhm =
    loadImpedancePrimaryOhm * impedanceFactor;
  const blinderSecondaryOhm =
    loadImpedanceSecondaryOhm *
    Math.cos(degToRad(policy.loadAngleDeg)) *
    policy.blinderFactor;
  const blinderPrimaryOhm = blinderSecondaryOhm / impedanceFactor;
  const deltaRSecondaryOhm = policy.powerSwingDeltaFactor * phaseZone3Ohm;
  const deltaXSecondaryOhm = policy.powerSwingDeltaFactor * phaseZone3Ohm;
  const r5SecondaryOhm = policy.powerSwingR5Factor * blinderSecondaryOhm;
  const lineSecondaryMagnitudeOhm = magnitude(z1Primary) * impedanceFactor;
  const z5SecondaryOhm = policy.powerSwingZ5Factor * lineSecondaryMagnitudeOhm;

  const normalSusceptanceMicroSiemens =
    (lcd.normalDifferentialPrimaryA * Math.sqrt(3) * 1e6) /
    load.systemVoltageV;
  const lineSusceptanceMicroSiemens =
    lcd.lineSusceptanceMicroSiemensPerKm * line.lengthKm / impedanceFactor;
  const capacitiveReactancePrimaryOhm =
    1 / (lineSusceptanceMicroSiemens * 1e-6);
  const chargingCurrentPrimaryA =
    load.systemVoltageV / (Math.sqrt(3) * capacitiveReactancePrimaryOhm);
  const chargingCurrentSecondaryA = chargingCurrentPrimaryA / ctRatio;
  const calculatedIs1SecondaryA =
    lcd.chargingPickupFactor * chargingCurrentSecondaryA;
  const standardIs1SecondaryA =
    lcd.minimumPickupPerUnit * load.relayNominalCurrentA;
  const selectedIs1SecondaryA = Math.max(
    standardIs1SecondaryA,
    calculatedIs1SecondaryA
  );
  const is2SecondaryA = lcd.highSetPickupPerUnit * load.relayNominalCurrentA;
  const ctARatio = lcd.ctAPrimaryA / lcd.ctASecondaryA;
  const ctBRatio = lcd.ctBPrimaryA / lcd.ctBSecondaryA;
  const ctCorrectionA = ctARatio / ctBRatio;
  const ctCorrectionB = ctBRatio / ctBRatio;

  const trace: P545AuxiliaryTrace[] = [
    makeTrace("ZL11", "residual-compensation", "Positive-sequence line impedance", "(R11a + jX11a) x L11a", z1Primary, "ohm primary", "ZL11"),
    makeTrace("ZL10", "residual-compensation", "Zero-sequence line impedance", "((R11a + 0.15) + j(3 x X11a)) x L11a", z0Primary, "ohm primary", "ZL10"),
    makeTrace("kZ0", "residual-compensation", "Residual compensation", "(ZL10 - ZL11) / (3 x ZL11)", kZ0, "complex ratio", "kZ0"),
    makeTrace("kZN", "residual-compensation", "Residual compensation magnitude", "abs(kZ0)", kZ0Magnitude, "ratio", "kZN"),
    makeTrace("theta-kZN", "residual-compensation", "Residual compensation angle", "arg(kZ0) x 180 / pi", kZ0AngleDeg, "degree", "theta kZN"),
    makeTrace("CC", "resistive-reach", "Primary current limit", "min(CCC, CTp)", currentLimitPrimaryA, "A primary", "CC"),
    makeTrace("IloadMax", "resistive-reach", "Maximum load current", "CC / CT1", loadCurrentSecondaryA, "A secondary", "IloadMax"),
    makeTrace("Zloadmin", "resistive-reach", "Minimum load impedance", "(VTs / sqrt(3)) / IloadMax", minimumLoadImpedanceSecondaryOhm, "ohm secondary", "Zloadmin"),
    makeTrace("ZloadMax", "resistive-reach", "Primary-derived load impedance check", "Vpp / (sqrt(3) x CC) x n1", maximumLoadImpedanceSecondaryOhm, "ohm secondary", "ZloadMax"),
    makeTrace("Ihs2f", "resistive-reach", "Two-phase fault current", "sqrt(3) / 2 x Ihs3f", fault2PhasePrimaryA, "A primary", "Ihs2f"),
    makeTrace("Ra", "resistive-reach", "Arc resistance", "28710 x Lc / Ihs2f^1.4", arcResistancePrimaryOhm, "ohm primary", "Ra"),
    makeTrace("Rphmax", "resistive-reach", "Maximum phase reach", "Zloadmin - 0.4 x Zloadmin", phaseReachMaximumOhm, "ohm secondary", "Rphmax"),
    makeTrace("Rgmax", "resistive-reach", "Maximum ground reach", "Zloadmin - 0.2 x Zloadmin", groundReachMaximumOhm, "ohm secondary", "Rgmax"),
    makeTrace("Rphmin", "resistive-reach", "Minimum phase reach", "Ra x n1", phaseReachMinimumOhm, "ohm secondary", "Rphmin"),
    makeTrace("Rgmin", "resistive-reach", "Minimum ground reach", "20 x n1", groundReachMinimumOhm, "ohm secondary", "Rgmin"),
    makeTrace("R3ph", "resistive-reach", "Zone 3 phase reach", "0.9 x Rphmax", phaseZone3Ohm, "ohm secondary", "R3ph"),
    makeTrace("R3g", "resistive-reach", "Zone 3 ground reach", "0.5 x Zloadmin", groundZone3Ohm, "ohm secondary", "R3g"),
    makeTrace("R2ph", "resistive-reach", "Zone 2 phase reach", "0.9 x R3ph", phaseZone2Ohm, "ohm secondary", "R2ph"),
    makeTrace("R2g", "resistive-reach", "Zone 2 ground reach", "0.8 x R3g", groundZone2Ohm, "ohm secondary", "R2g"),
    makeTrace("R1ph", "resistive-reach", "Zone 1 phase reach", "0.8 x R2ph", phaseZone1Ohm, "ohm secondary", "R1ph"),
    makeTrace("R1g", "resistive-reach", "Zone 1 ground reach", "0.8 x R2g", groundZone1Ohm, "ohm secondary", "R1g"),
    makeTrace("Zld", "load-blinder-psb", "Load impedance", "Vp / sqrt(3) / CC x n1", loadImpedanceSecondaryOhm, "ohm secondary", "Zld"),
    makeTrace("ZB", "load-blinder-psb", "Blinder impedance", "Zld x cos(30 deg) x 0.51", blinderSecondaryOhm, "ohm secondary", "ZB"),
    makeTrace("deltaR", "load-blinder-psb", "Power-swing delta R", "0.3 x R3ph", deltaRSecondaryOhm, "ohm secondary", "Delta R"),
    makeTrace("deltaX", "load-blinder-psb", "Power-swing delta X", "0.3 x R3ph", deltaXSecondaryOhm, "ohm secondary", "Delta X"),
    makeTrace("R5", "load-blinder-psb", "Power-swing R5", "0.85 x ZB", r5SecondaryOhm, "ohm secondary", "R5"),
    makeTrace("Z5", "load-blinder-psb", "Power-swing Z5", "2 x abs(ZL)", z5SecondaryOhm, "ohm secondary", "Z5"),
    makeTrace("B-normal", "line-differential", "Normal differential susceptance", "I-diff-normal x sqrt(3) x 1e6 / kV", normalSusceptanceMicroSiemens, "microS", "B_suseptance"),
    makeTrace("Bt", "line-differential", "Line susceptance at relay basis", "Bt-unit x L1 / n1", lineSusceptanceMicroSiemens, "microS", "Bt"),
    makeTrace("Xc", "line-differential", "Capacitive reactance", "1 / (Bt x 1e-6)", capacitiveReactancePrimaryOhm, "ohm primary", "Xc"),
    makeTrace("Ic", "line-differential", "Charging current", "kV / (sqrt(3) x Xc)", chargingCurrentPrimaryA, "A primary", "Ic"),
    makeTrace("Ics", "line-differential", "Charging current at relay", "Ic / CT1", chargingCurrentSecondaryA, "A secondary", "Ics"),
    makeTrace("Is-calculation", "line-differential", "Calculated Is1", "2.5 x Ics", calculatedIs1SecondaryA, "A secondary", "Is calculation"),
    makeTrace("Is1", "line-differential", "Selected Is1", "max(0.2 x In, Is-calculation)", selectedIs1SecondaryA, "A secondary", "Is1"),
    makeTrace("Is2", "line-differential", "High-set pickup Is2", "2 x In", is2SecondaryA, "A secondary", "Is2"),
    makeTrace("CT-corr-A", "line-differential", "CT correction side A", "CT-A / CT-B", ctCorrectionA, "ratio", "CT corr di A"),
    makeTrace("CT-corr-B", "line-differential", "CT correction side B", "CT-B / CT-B", ctCorrectionB, "ratio", "CT corr di B"),
    makeTrace("AR-trip-mode", "autoreclose-policy", "Autoreclose trip mode", "extracted policy; no calculation expression", input.autoreclosePolicy.tripMode, "policy", "1P Trip Mode"),
    makeTrace("AR-dead-time", "autoreclose-policy", "Autoreclose dead time", "extracted policy; no calculation expression", input.autoreclosePolicy.deadTime1Seconds, "second", "1P Dead Time 1"),
    makeTrace("AR-reclaim", "autoreclose-policy", "Autoreclose reclaim time", "extracted policy; no calculation expression", input.autoreclosePolicy.reclaimTimeSeconds, "second", "Reclaim Time"),
    makeTrace("AR-pulse", "autoreclose-policy", "Autoreclose pulse time", "extracted policy; no calculation expression", input.autoreclosePolicy.pulseTimeSeconds, "second", "Pulse Time"),
  ];

  const parityRows = buildParityRows({
    kZ0Magnitude,
    kZ0AngleDeg,
    ctPrimaryAtRelayIn,
    continuousCurrentPrimaryA: load.continuousCurrentPrimaryA,
    loadCurrentSecondaryA,
    phaseLoadMarginOhm,
    groundLoadMarginOhm,
    fault2PhasePrimaryA,
    arcResistancePrimaryOhm,
    phaseReachMaximumOhm,
    groundReachMaximumOhm,
    phaseReachMinimumOhm,
    groundReachMinimumOhm,
    phaseZone3Ohm,
    groundZone3Ohm,
    groundFactorSquareRoot,
    groundFactorCubeRoot,
    phaseZone2Ohm,
    groundZone2Ohm,
    phaseZone1Ohm,
    groundZone1Ohm,
    loadImpedancePrimaryOhm,
    loadImpedanceSecondaryOhm,
    blinderSecondaryOhm,
    blinderPrimaryOhm,
    powerSwingDeltaROhm: deltaRSecondaryOhm,
    powerSwingDeltaXOhm: deltaXSecondaryOhm,
    powerSwingR5Ohm: r5SecondaryOhm,
    powerSwingZ5Ohm: z5SecondaryOhm,
    normalSusceptanceMicroSiemens,
    lineSusceptanceMicroSiemens,
    capacitiveReactancePrimaryOhm,
    chargingCurrentPrimaryA,
    chargingCurrentSecondaryA,
    calculatedIs1SecondaryA,
    selectedIs1SecondaryA,
    is2SecondaryA,
    ctCorrectionA,
    ctCorrectionB,
  });
  const mismatched = parityRows.filter((row) => row.status === "mismatch").length;
  const calculationBlocks: Array<Exclude<P545AuxiliaryBlock, "autoreclose-policy">> = [
    "residual-compensation",
    "resistive-reach",
    "load-blinder-psb",
    "line-differential",
  ];

  return {
    schema: "plms.p545-auxiliary-result.v1",
    ruleVersion: P545_AUXILIARY_RULE_VERSION,
    source: P545_MATHCAD_BENCHMARK,
    outputs: {
      residualCompensation: {
        z1Primary,
        z0Primary,
        kZ0,
        magnitude: kZ0Magnitude,
        angleDeg: kZ0AngleDeg,
      },
      resistiveReach: {
        currentLimitPrimaryA,
        loadCurrentSecondaryA,
        minimumLoadImpedanceSecondaryOhm,
        maximumPhaseReachSecondaryOhm: phaseReachMaximumOhm,
        maximumGroundReachSecondaryOhm: groundReachMaximumOhm,
        minimumPhaseReachSecondaryOhm: phaseReachMinimumOhm,
        minimumGroundReachSecondaryOhm: groundReachMinimumOhm,
        phaseReachByZone: { z1: phaseZone1Ohm, z2: phaseZone2Ohm, z3: phaseZone3Ohm },
        groundReachByZone: { z1: groundZone1Ohm, z2: groundZone2Ohm, z3: groundZone3Ohm },
      },
      loadBlinderAndPowerSwing: {
        loadImpedancePrimaryOhm,
        loadImpedanceSecondaryOhm,
        loadAngleDeg: policy.loadAngleDeg,
        blinderSecondaryOhm,
        blinderPrimaryOhm,
        deltaRSecondaryOhm,
        deltaXSecondaryOhm,
        r5SecondaryOhm,
        z5SecondaryOhm,
      },
      lineDifferential: {
        normalSusceptanceMicroSiemens,
        lineSusceptanceMicroSiemens,
        capacitiveReactancePrimaryOhm,
        chargingCurrentPrimaryA,
        chargingCurrentSecondaryA,
        calculatedIs1SecondaryA,
        selectedIs1SecondaryA,
        slopeK1: lcd.slopeK1,
        is2SecondaryA,
        slopeK2: lcd.slopeK2,
        ctCorrectionA,
        ctCorrectionB,
      },
      autoreclosePolicy: {
        ...input.autoreclosePolicy,
        classification: "extracted-policy",
      },
    },
    trace,
    parity: {
      status: mismatched === 0 ? "pass" : "fail",
      tolerance: PARITY_TOLERANCE,
      matched: parityRows.length - mismatched,
      mismatched,
      maxAbsoluteDelta: Math.max(...parityRows.map((row) => row.absoluteDelta)),
      byBlock: Object.fromEntries(
        calculationBlocks.map((block) => {
          const rows = parityRows.filter((row) => row.block === block);
          const blockMismatched = rows.filter((row) => row.status === "mismatch").length;
          return [block, { matched: rows.length - blockMismatched, mismatched: blockMismatched }];
        })
      ) as P545AuxiliaryResult["parity"]["byBlock"],
      rows: parityRows,
    },
  };
}

type SavedKey = keyof typeof SAVED_RESULTS;

function buildParityRows(actual: Record<SavedKey, number>): P545AuxiliaryParityRow[] {
  const meta: Record<
    SavedKey,
    {
      block: P545AuxiliaryParityRow["block"];
      label: string;
      unit: string;
      sourceLocator: string;
    }
  > = {
    kZ0Magnitude: residual("kZ0 magnitude", "ratio", "saved result kZN"),
    kZ0AngleDeg: residual("kZ0 angle", "degree", "saved result theta-kZN"),
    ctPrimaryAtRelayIn: reach("CT primary at In", "A primary", "saved result CTp"),
    continuousCurrentPrimaryA: reach("Continuous-current criterion", "A primary", "saved result CCC"),
    loadCurrentSecondaryA: reach("Maximum load current", "A secondary", "saved result IloadMax"),
    phaseLoadMarginOhm: reach("Phase load margin", "ohm secondary", "saved result MRphmax"),
    groundLoadMarginOhm: reach("Ground load margin", "ohm secondary", "saved result MRgmax"),
    fault2PhasePrimaryA: reach("Two-phase fault current", "A primary", "saved result Ihs2f"),
    arcResistancePrimaryOhm: reach("Arc resistance", "ohm primary", "saved result Ra"),
    phaseReachMaximumOhm: reach("Maximum phase reach", "ohm secondary", "saved result Rphmax"),
    groundReachMaximumOhm: reach("Maximum ground reach", "ohm secondary", "saved result Rgmax"),
    phaseReachMinimumOhm: reach("Minimum phase reach", "ohm secondary", "saved result Rphmin"),
    groundReachMinimumOhm: reach("Minimum ground reach", "ohm secondary", "saved result Rgmin"),
    phaseZone3Ohm: reach("Zone 3 phase reach", "ohm secondary", "saved result R3ph"),
    groundZone3Ohm: reach("Zone 3 ground reach", "ohm secondary", "saved result R3g"),
    groundFactorSquareRoot: reach("Ground factor square-root check", "ratio", "saved result faktor_pengali1"),
    groundFactorCubeRoot: reach("Ground factor cube-root check", "ratio", "saved result faktor_pengali2"),
    phaseZone2Ohm: reach("Zone 2 phase reach", "ohm secondary", "saved result R2ph"),
    groundZone2Ohm: reach("Zone 2 ground reach", "ohm secondary", "saved result R2g"),
    phaseZone1Ohm: reach("Zone 1 phase reach", "ohm secondary", "saved result R1ph"),
    groundZone1Ohm: reach("Zone 1 ground reach", "ohm secondary", "saved result R1g"),
    loadImpedancePrimaryOhm: blinder("Load impedance primary", "ohm primary", "saved result Zld-primer"),
    loadImpedanceSecondaryOhm: blinder("Load impedance relay", "ohm secondary", "saved result Zld"),
    blinderSecondaryOhm: blinder("Blinder impedance relay", "ohm secondary", "saved result ZB"),
    blinderPrimaryOhm: blinder("Blinder impedance primary", "ohm primary", "saved result ZB-primer"),
    powerSwingDeltaROhm: blinder("Power-swing delta R", "ohm secondary", "saved result Delta R"),
    powerSwingDeltaXOhm: blinder("Power-swing delta X", "ohm secondary", "saved result Delta X"),
    powerSwingR5Ohm: blinder("Power-swing R5", "ohm secondary", "saved result R5"),
    powerSwingZ5Ohm: blinder("Power-swing Z5", "ohm secondary", "saved result Z5"),
    normalSusceptanceMicroSiemens: differential("Normal differential susceptance", "microS", "saved result B_suseptance"),
    lineSusceptanceMicroSiemens: differential("Line susceptance", "microS", "saved result Bt"),
    capacitiveReactancePrimaryOhm: differential("Capacitive reactance", "ohm primary", "saved result Xc"),
    chargingCurrentPrimaryA: differential("Charging current primary", "A primary", "saved result Ic"),
    chargingCurrentSecondaryA: differential("Charging current relay", "A secondary", "saved result Ics"),
    calculatedIs1SecondaryA: differential("Calculated Is1", "A secondary", "saved result Is-calculation"),
    selectedIs1SecondaryA: differential("Selected Is1", "A secondary", "saved result Is1"),
    is2SecondaryA: differential("Selected Is2", "A secondary", "saved result Is2"),
    ctCorrectionA: differential("CT correction A", "ratio", "saved result CT-corr-A"),
    ctCorrectionB: differential("CT correction B", "ratio", "saved result CT-corr-B"),
  };

  return (Object.keys(SAVED_RESULTS) as SavedKey[]).map((key) => {
    const expected = SAVED_RESULTS[key];
    const value = actual[key];
    const absoluteDelta = Math.abs(value - expected);
    const relativeDelta = absoluteDelta / Math.max(Math.abs(expected), Number.EPSILON);
    return {
      key,
      ...meta[key],
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
  });
}

function residual(label: string, unit: string, sourceLocator: string) {
  return { block: "residual-compensation" as const, label, unit, sourceLocator };
}

function reach(label: string, unit: string, sourceLocator: string) {
  return { block: "resistive-reach" as const, label, unit, sourceLocator };
}

function blinder(label: string, unit: string, sourceLocator: string) {
  return { block: "load-blinder-psb" as const, label, unit, sourceLocator };
}

function differential(label: string, unit: string, sourceLocator: string) {
  return { block: "line-differential" as const, label, unit, sourceLocator };
}

function validateInput(input: P545AuxiliaryInput) {
  if (input.ruleVersion !== P545_AUXILIARY_RULE_VERSION) {
    throw new Error(`Unsupported P545 auxiliary rule version: ${input.ruleVersion}.`);
  }
  const positive = [
    input.protectedLine.lengthKm,
    input.instrumentTransformers.ctPrimaryA,
    input.instrumentTransformers.ctSecondaryA,
    input.instrumentTransformers.vtPrimaryV,
    input.instrumentTransformers.vtSecondaryV,
    input.loadAndFault.continuousCurrentPrimaryA,
    input.loadAndFault.relayNominalCurrentA,
    input.loadAndFault.systemVoltageV,
    input.loadAndFault.fault3PhasePrimaryA,
    input.loadAndFault.arcConductorSpacing,
    input.lineDifferential.lineSusceptanceMicroSiemensPerKm,
  ];
  if (positive.some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error("P545 auxiliary input contains a non-positive engineering value.");
  }
}

function complex(re: number, im: number): ComplexValue {
  return { re, im };
}

function subtract(left: ComplexValue, right: ComplexValue): ComplexValue {
  return complex(left.re - right.re, left.im - right.im);
}

function scale(value: ComplexValue, factor: number): ComplexValue {
  return complex(value.re * factor, value.im * factor);
}

function divideComplex(numerator: ComplexValue, denominator: ComplexValue): ComplexValue {
  const divisor = denominator.re ** 2 + denominator.im ** 2;
  return complex(
    (numerator.re * denominator.re + numerator.im * denominator.im) / divisor,
    (numerator.im * denominator.re - numerator.re * denominator.im) / divisor
  );
}

function magnitude(value: ComplexValue) {
  return Math.hypot(value.re, value.im);
}

function angleDeg(value: ComplexValue) {
  return Math.atan2(value.im, value.re) * (180 / Math.PI);
}

function degToRad(value: number) {
  return value * (Math.PI / 180);
}

function makeTrace(
  key: string,
  block: P545AuxiliaryBlock,
  label: string,
  formula: string,
  value: P545AuxiliaryTrace["value"],
  unit: string,
  sourceLocator: string
): P545AuxiliaryTrace {
  return { key, block, label, formula, value, unit, sourceLocator };
}
