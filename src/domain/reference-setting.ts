import type {
  CrosscheckFaultRecord,
  CrosscheckLineRecord,
} from "./crosscheck-workbook-registry";

export type ReferenceMetric = {
  key: string;
  label: string;
  value: number | string | null;
  unit?: string;
  group: string;
  precision?: number;
};

export type ReferenceTraceStep = {
  id: string;
  label: string;
  formula: string;
  result: number | string | null;
  unit?: string;
  source: string;
};

export type ReferenceResult = {
  ruleId: string;
  ruleVersion: string;
  metrics: ReferenceMetric[];
  trace: ReferenceTraceStep[];
  warnings: string[];
  assumptions: string[];
};

export type OcrGfrBayType = "LINE" | "KOPEL";

export type OcrGfrReferenceInput = {
  substation: string;
  bayType: OcrGfrBayType;
  cccOrTsaA: number;
  ctPrimaryA: number;
  ctSecondaryA: number;
  hasBusProtection: boolean;
  operatingTimeS: number;
  voltageKv: number;
  fault3phA: number;
  fault1phA: number;
};

export type TransformerScheme =
  | "SETTING_UIT_UID"
  | "SETTING_PLN_PUSAT"
  | "SETTING_ZDT"
  | "NON_CASCADE";

export type TransformerWinding =
  | "YYD"
  | "YY_SHELL"
  | "YY_CORE";

export type TransformerReferenceInput = {
  substation: string;
  bayName: string;
  manufacturer: string;
  powerMva: number;
  impedancePercent: number;
  winding: TransformerWinding;
  hvKv: number;
  lvKv: number;
  phaseCtHvPrimaryA: number;
  phaseCtHvSecondaryA: number;
  phaseCtLvPrimaryA: number;
  phaseCtLvSecondaryA: number;
  neutralCtHvPrimaryA: number;
  neutralCtHvSecondaryA: number;
  neutralCtLvPrimaryA: number;
  neutralCtLvSecondaryA: number;
  ngrCtPrimaryA: number;
  ngrCtSecondaryA: number;
  ngrOhm: number;
  ngrMaxCurrentA: number;
  ngrWithstandS: number;
  scheme: TransformerScheme;
  sourceR1Pu: number;
  sourceX1Pu: number;
  sourceR2Pu: number;
  sourceX2Pu: number;
  sourceR0Pu: number;
  sourceX0Pu: number;
  ohlR1Ohm: number;
  ohlX1Ohm: number;
};

export type DistanceReferenceInput = {
  localSubstation: string;
  remoteSubstation: string;
  l1: CrosscheckLineRecord | null;
  l2: CrosscheckLineRecord | null;
  l3: CrosscheckLineRecord | null;
  l4: CrosscheckLineRecord | null;
  cccA: number;
  ctPrimaryA: number;
  ctSecondaryA: number;
  ptPrimaryV: number;
  ptSecondaryV: number;
  transformerPercentZ: number;
  transformerMva: number;
  transformerHvKv: number;
  hasGeneratorOrIbtAtRemote: boolean;
};

type Complex = { re: number; im: number };

const SQRT3 = Math.sqrt(3);
const RULE_VERSION = "2021.03-plms.1";

export function calculateOcrGfrReference(
  input: OcrGfrReferenceInput
): ReferenceResult {
  const warnings: string[] = [];
  const referenceCurrentA = Math.min(
    positive(input.cccOrTsaA),
    positive(input.ctPrimaryA)
  );
  const fault2phA = 0.867 * positive(input.fault3phA);
  const ctFactor = safeDivide(input.ctSecondaryA, input.ctPrimaryA);
  const ocrPrimaryA = 1.2 * referenceCurrentA;
  const ocrSecondaryA = ocrPrimaryA * ctFactor;
  const ocrPu = safeDivide(ocrSecondaryA, input.ctSecondaryA);
  const isCouplerWithoutBusProtection =
    input.bayType === "KOPEL" && !input.hasBusProtection;
  const isCouplerWithBusProtection =
    input.bayType === "KOPEL" && input.hasBusProtection;
  const ocrDelay = isCouplerWithoutBusProtection
    ? "0.5 s (Definite)"
    : `${round(
        standardInverseTms(
          fault2phA,
          ocrPrimaryA,
          positive(input.operatingTimeS)
        ),
        4
      )} (SI)`;

  const gfrPrimaryA =
    (isCouplerWithoutBusProtection ? 0.4 : 0.2) * referenceCurrentA;
  const gfrSecondaryA = gfrPrimaryA * ctFactor;
  const gfrPu = safeDivide(gfrSecondaryA, input.ctSecondaryA);
  const gfrDelay = isCouplerWithBusProtection
    ? "BLOCK"
    : isCouplerWithoutBusProtection
      ? "0.5 s (Definite)"
      : `${round(
          standardInverseTms(
            positive(input.fault1phA),
            gfrPrimaryA,
            positive(input.operatingTimeS)
          ),
          4
        )} (SI)`;

  if (referenceCurrentA <= 0) {
    warnings.push("CCC/TSA dan CT primary harus lebih besar dari nol.");
  }
  if (input.fault3phA <= 0 || input.fault1phA <= 0) {
    warnings.push("Fault level belum lengkap; timer inverse tidak dapat divalidasi.");
  }
  if (input.bayType === "KOPEL") {
    warnings.push(
      "Logic kopel mengikuti rule legacy workbook; koordinasi bus protection tetap perlu review engineer."
    );
  }

  return {
    ruleId: "ocr-gfr-line-coupler",
    ruleVersion: RULE_VERSION,
    metrics: [
      metric("ocr-primary", "OCR pickup primary", ocrPrimaryA, "A", "OCR"),
      metric("ocr-secondary", "OCR pickup secondary", ocrSecondaryA, "A", "OCR"),
      metric("ocr-pu", "OCR pickup", ocrPu, "pu", "OCR"),
      metric("ocr-delay", "OCR delay / TMS", ocrDelay, undefined, "OCR"),
      metric("gfr-primary", "GFR pickup primary", gfrPrimaryA, "A", "GFR"),
      metric("gfr-secondary", "GFR pickup secondary", gfrSecondaryA, "A", "GFR"),
      metric("gfr-pu", "GFR pickup", gfrPu, "pu", "GFR"),
      metric("gfr-delay", "GFR delay / TMS", gfrDelay, undefined, "GFR"),
    ],
    trace: [
      trace(
        "reference-current",
        "Reference current",
        "min(CCC/TSA, CT primary)",
        referenceCurrentA,
        "A",
        "Cek OCRGFR!G20"
      ),
      trace(
        "fault-2ph",
        "Two-phase fault",
        "0.867 × I3ph",
        fault2phA,
        "A",
        "Cek OCRGFR!G21"
      ),
      trace(
        "ocr-pickup",
        "OCR pickup",
        "1.2 × reference current",
        ocrPrimaryA,
        "A",
        "Cek OCRGFR!G28"
      ),
      trace(
        "ocr-tms",
        "OCR standard inverse",
        "((I2ph / Ipickup)^0.02 - 1) × (t / 0.14)",
        ocrDelay,
        undefined,
        "Cek OCRGFR!G31"
      ),
      trace(
        "gfr-pickup",
        "GFR pickup",
        `${isCouplerWithoutBusProtection ? "0.4" : "0.2"} × reference current`,
        gfrPrimaryA,
        "A",
        "Cek OCRGFR!G33"
      ),
      trace(
        "gfr-tms",
        "GFR standard inverse",
        "((I1ph / Ipickup)^0.02 - 1) × (t / 0.14)",
        gfrDelay,
        undefined,
        "Cek OCRGFR!G36"
      ),
    ],
    warnings,
    assumptions: [
      "Kurva inverse mengikuti IEC Standard Inverse yang dipakai workbook legacy.",
      "Nilai ini adalah reference setting, bukan issued TAP.",
    ],
  };
}

export function calculateTransformerReference(
  input: TransformerReferenceInput
): ReferenceResult {
  const warnings: string[] = [];
  const hvNominalA = safeDivide(input.powerMva * 1000, input.hvKv * SQRT3);
  const lvNominalA = safeDivide(input.powerMva * 1000, input.lvKv * SQRT3);
  const ngrNominalA = safeDivide(input.lvKv * 1000, SQRT3 * input.ngrOhm);
  const refHvIs1A = 0.2 * hvNominalA;
  const refLvIs1A = 0.2 * lvNominalA;
  const refHvIs2A = safeDivide(refHvIs1A, 0.2);
  const refLvIs2A = safeDivide(refLvIs1A, 0.2);

  const zBaseLv = (input.lvKv * input.lvKv) / 100;
  const zBaseHv = (input.hvKv * input.hvKv) / 100;
  const iBaseLv = safeDivide(100_000, input.lvKv * SQRT3);
  const iBaseHv = safeDivide(100_000, input.hvKv * SQRT3);
  const zSource1 = complex(input.sourceR1Pu, input.sourceX1Pu);
  const zSource2 = complex(input.sourceR2Pu, input.sourceX2Pu);
  const zSource0 = complex(input.sourceR0Pu, input.sourceX0Pu);
  const zTransformerPu =
    (positive(input.impedancePercent) / 100) *
    safeDivide(100, input.powerMva);
  const zHalfTransformerPu = 0.5 * zTransformerPu;
  const zOhlPu = complex(
    safeDivide(input.ohlR1Ohm, zBaseHv),
    safeDivide(input.ohlX1Ohm, zBaseHv)
  );
  const zTransformerHalf = complex(0, zHalfTransformerPu);
  const zNgrPu = safeDivide(input.ngrOhm, zBaseLv);
  const zTransformerZeroPu =
    input.winding === "YYD"
      ? zHalfTransformerPu
      : input.winding === "YY_SHELL"
        ? 5_000_000 * zTransformerPu
        : 10 * zTransformerPu;

  const faultLv3phA = safeDivide(
    iBaseLv,
    abs(
      add(
        zSource1,
        zTransformerHalf,
        zTransformerHalf
      )
    )
  );
  const faultLv2phA = 0.867 * faultLv3phA;
  const zZeroParallel = parallel(
    add(zSource0, complex(0, zHalfTransformerPu)),
    complex(0, zTransformerZeroPu)
  );
  const faultLv1phDenominator = add(
    zZeroParallel,
    zTransformerHalf,
    zSource2,
    zTransformerHalf,
    zTransformerHalf,
    zSource1,
    zTransformerHalf,
    zTransformerHalf,
    complex(3 * zNgrPu, 0)
  );
  const faultLv1phA = safeDivide(3 * iBaseLv, abs(faultLv1phDenominator));

  const faultHv3phA = safeDivide(
    iBaseHv,
    abs(add(zSource1, zTransformerHalf, zTransformerHalf))
  );
  const faultHv2phA = 0.867 * faultHv3phA;
  const zeroPath = add(
    complex(0, zHalfTransformerPu),
    complex(0, zTransformerZeroPu)
  );
  const faultHvSource1phA = safeDivide(
    3 * iBaseHv,
    abs(add(zSource1, zSource2, parallel(zeroPath, zSource0)))
  );
  const faultHv1phA =
    faultHvSource1phA *
    abs(divide(zSource0, add(zSource0, zeroPath)));

  const hvOcrPickupA = 1.2 * hvNominalA;
  const hvOcrMomentA = safeDivide(
    1.2 * hvNominalA,
    positive(input.impedancePercent) / 100
  );
  const hvOcrTms = standardInverseTms(faultHv2phA, hvOcrPickupA, 1.5);
  const hvGfrPickupA = (input.hvKv === 500 ? 0.8 : 0.5) * hvNominalA;
  const hvGfrTms = standardInverseTms(faultHv1phA, hvGfrPickupA, 1.5);

  const lvOperatingTimeS =
    input.manufacturer.toUpperCase().includes("UNINDO") &&
    input.manufacturer.includes("<2010")
      ? 0.7
      : 1;
  const lvOcrPickupA = 1.2 * lvNominalA;
  const lvOcrTms = standardInverseTms(
    faultLv2phA,
    lvOcrPickupA,
    lvOperatingTimeS
  );
  const moment = transformerMomentary(input.scheme, lvNominalA);
  const lvGfrPickupA = 0.2 * lvNominalA;
  const lvGfrTms = standardInverseTms(faultLv1phA, lvGfrPickupA, 1);
  const sbefPickupA = 0.2 * ngrNominalA;
  const sbefLti = safeDivide(
    (safeDivide(faultLv1phA, sbefPickupA) - 1) *
      (0.5 * input.ngrWithstandS),
    120
  );

  if (input.powerMva <= 0 || input.hvKv <= 0 || input.lvKv <= 0) {
    warnings.push("Rating dan ratio trafo harus lebih besar dari nol.");
  }
  if (input.winding !== "YYD") {
    warnings.push(
      "Zero-sequence path mengikuti pendekatan legacy workbook; validasi vector group vendor diperlukan."
    );
  }
  warnings.push(
    "Calculation fault trafo mengikuti base 100 MVA dan simplifikasi source/line workbook 2021."
  );

  return {
    ruleId: "transformer-diff-ref-ocr-gfr",
    ruleVersion: RULE_VERSION,
    metrics: [
      metric("diff", "Differential pickup", 0.3, "pu", "DIFF / REF"),
      metric("ref-hv-is1", "REF HV IS1", refHvIs1A, "A primary", "DIFF / REF"),
      metric("ref-hv-is2", "REF HV IS2", refHvIs2A, "A primary", "DIFF / REF"),
      metric("ref-lv-is1", "REF LV IS1", refLvIs1A, "A primary", "DIFF / REF"),
      metric("ref-lv-is2", "REF LV IS2", refLvIs2A, "A primary", "DIFF / REF"),
      metric("ocr-hv", "OCR HV pickup", hvOcrPickupA, "A primary", "HV side"),
      metric("ocr-hv-tms", "OCR HV TMS", hvOcrTms, "SI", "HV side", 4),
      metric("ocr-hv-moment", "OCR HV momentary", hvOcrMomentA, "A primary", "HV side"),
      metric("gfr-hv", "GFR HV pickup", hvGfrPickupA, "A primary", "HV side"),
      metric("gfr-hv-tms", "GFR HV TMS", hvGfrTms, "SI", "HV side", 4),
      metric("ocr-lv", "OCR LV pickup", lvOcrPickupA, "A primary", "LV side"),
      metric("ocr-lv-tms", "OCR LV TMS", lvOcrTms, "SI", "LV side", 4),
      metric("ocr-lv-m1", "OCR LV momentary 1", moment.stage1A, "A primary", "LV side"),
      metric("ocr-lv-m1-t", "OCR LV momentary 1 delay", moment.stage1DelayS, "s", "LV side"),
      metric("ocr-lv-m2", "OCR LV momentary 2", moment.stage2A, "A primary", "LV side"),
      metric("ocr-lv-m2-t", "OCR LV momentary 2 delay", moment.stage2DelayS, "s", "LV side"),
      metric("gfr-lv", "GFR LV pickup", lvGfrPickupA, "A primary", "LV side"),
      metric("gfr-lv-tms", "GFR LV TMS", lvGfrTms, "SI", "LV side", 4),
      metric("sbef", "SBEF pickup", sbefPickupA, "A primary", "SBEF"),
      metric("sbef-lti", "SBEF TMS", sbefLti, "LTI", "SBEF", 4),
      metric("sbef-vi", "SBEF equivalent TMS", sbefLti * 8.8888888889, "VI", "SBEF", 4),
    ],
    trace: [
      trace(
        "nominal-current",
        "Transformer nominal currents",
        "S / (√3 × V)",
        `HV ${round(hvNominalA, 3)} A · LV ${round(lvNominalA, 3)} A`,
        undefined,
        "PROSES TRAFO!S38:S39"
      ),
      trace(
        "transformer-pu",
        "Transformer impedance",
        "(Z% / 100) × (100 MVA / Sbase)",
        `${round(zTransformerPu, 6)} pu · OHL ${complexLabel(zOhlPu)} pu`,
        "pu",
        "PROSES TRAFO!I49:I51"
      ),
      trace(
        "fault-lv",
        "LV fault calculation",
        "Sequence-network equivalent on 100 MVA base",
        `3ph ${round(faultLv3phA, 3)} A · 1ph ${round(faultLv1phA, 3)} A`,
        undefined,
        "PROSES TRAFO!I54:I56"
      ),
      trace(
        "fault-hv",
        "HV fault calculation",
        "Source + transformer + OHL sequence network",
        `3ph ${round(faultHv3phA, 3)} A · 2ph ${round(faultHv2phA, 3)} A · 1ph ${round(faultHv1phA, 3)} A`,
        undefined,
        "PROSES TRAFO!I59:I61"
      ),
      trace(
        "ref",
        "REF reference",
        "IS1 = 0.2 × Inom; IS2 = IS1 / 0.2",
        `HV ${round(refHvIs1A, 3)} / ${round(refHvIs2A, 3)} A`,
        undefined,
        "Cek TRAFO!F29:Q35"
      ),
      trace(
        "sbef",
        "SBEF",
        "Pickup = 0.2 × INGR; LTI from NGR withstand",
        sbefLti,
        "LTI",
        "PROSES TRAFO!H101:P104"
      ),
    ],
    warnings,
    assumptions: [
      "Differential pickup 0.3 pu dan REF IS1/IS2 mengikuti workbook legacy.",
      "Setting momentary LV mengikuti pilihan skema 20 kV.",
      "Nilai ini adalah reference setting, bukan issued TAP.",
    ],
  };
}

export function calculateDistanceReference(
  input: DistanceReferenceInput
): ReferenceResult {
  const warnings: string[] = [];
  const l1 = lineImpedance(input.l1);
  const l2 = lineImpedance(input.l2);
  const l3 = lineImpedance(input.l3);
  const l4 = lineImpedance(input.l4);
  const kInfeed = input.hasGeneratorOrIbtAtRemote ? 1.2 : 1;
  const secondaryFactor = safeDivide(
    safeDivide(input.cccA, input.ctSecondaryA),
    safeDivide(input.ptPrimaryV, input.ptSecondaryV)
  );
  const transformer = complex(
    0,
    safeDivide(
      input.transformerPercentZ *
        input.transformerHvKv *
        input.transformerHvKv,
      input.transformerMva * 100
    )
  );

  const z1 = scale(l1, 0.8);
  const z2Min = scale(l1, 1.2);
  const z2MaxLine = scale(add(l1, scale(l2, 0.8)), 0.8);
  const z2Transformer = scale(add(l1, scale(transformer, 0.5)), 0.8);
  const z2BeforeTransformer = chooseByAbs(z2Min, z2MaxLine, "max");
  const z2 = chooseByAbs(z2BeforeTransformer, z2Transformer, "min");
  const z2DelayS =
    abs(subtract(z2, l1)) < 0.8 * abs(l2) ? 0.4 : 0.8;

  const z3Min = scale(add(l1, l3), 1.2);
  const z3Max1 = scale(add(l1, scale(l3, 1.2 * kInfeed)), 0.8);
  const z3Max2 = scale(
    add(l1, scale(add(l3, scale(l4, 0.8)), 0.8 * kInfeed)),
    0.8
  );
  const z3Transformer = scale(add(l1, scale(transformer, 0.8)), 0.8);
  const z3Candidate = chooseByAbs(
    chooseByAbs(z3Max1, z3Max2, "max"),
    z3Min,
    "max"
  );
  const z3 = chooseByAbs(z3Candidate, z3Transformer, "min");
  const z3Base = add(
    l1,
    scale(add(l3, scale(l4, 0.8)), 0.8 * kInfeed)
  );
  const z3DelayS = abs(z3Base) > abs(z3Candidate) ? 1.2 : 1.6;

  const currentCapacityA = positive(input.l1?.currentRatingKa) * 1000;
  const referenceCurrentA = Math.min(
    positive(input.ctPrimaryA),
    currentCapacityA || positive(input.cccA)
  );
  const fullLoadImpedance = safeDivide(
    input.ptPrimaryV,
    SQRT3 * referenceCurrentA
  );
  const r3Phase = 0.8 * (fullLoadImpedance - 0.4 * fullLoadImpedance);
  const r3Ground = 0.5 * fullLoadImpedance;
  const r2Phase = 0.9 * r3Phase;
  const r1Phase = 0.9 * r2Phase;
  const r2Ground = 0.9 * r3Ground;
  const r1Ground = 0.9 * r2Ground;
  const k0 =
    abs(l1) > 0 ? divide(subtract(lineZeroImpedance(input.l1), l1), scale(l1, 3)) : complex(0, 0);

  if (!input.l1) warnings.push("L1 wajib dipilih.");
  if (!input.l2) warnings.push("L2 tidak tersedia dari GI lawan.");
  if (!input.l3) warnings.push("L3 tidak tersedia dari GI lawan.");
  if (!input.l4) warnings.push("L4 tidak tersedia setelah ujung L3.");
  if (input.hasGeneratorOrIbtAtRemote) {
    warnings.push(
      "Faktor infeed K=1.2 mengikuti rule legacy manual. Final setting perlu divalidasi dengan fault study max/min infeed."
    );
  }
  warnings.push(
    "Rule ini hanya untuk normal forward distance; reverse zone, parallel mutual coupling, tee/multi-terminal, dan series compensation belum didukung."
  );

  const zoneMetrics = (
    zone: "Z1" | "Z2" | "Z3",
    value: Complex,
    delay: number,
    rPhase: number,
    rGround: number
  ): ReferenceMetric[] => [
    metric(`${zone}-z-primary`, `${zone} impedance`, abs(value), "Ω primary", zone),
    metric(`${zone}-x-primary`, `${zone} X reach`, value.im, "Ω primary", zone),
    metric(`${zone}-z-secondary`, `${zone} impedance`, abs(value) * secondaryFactor, "Ω secondary", zone),
    metric(`${zone}-x-secondary`, `${zone} X reach`, value.im * secondaryFactor, "Ω secondary", zone),
    metric(`${zone}-r-phase`, `${zone} resistive reach P-P`, rPhase, "Ω primary", zone),
    metric(`${zone}-r-ground`, `${zone} resistive reach P-E`, rGround, "Ω primary", zone),
    metric(`${zone}-delay`, `${zone} delay`, delay, "s", zone),
  ];

  return {
    ruleId: "distance-normal-forward",
    ruleVersion: RULE_VERSION,
    metrics: [
      ...zoneMetrics("Z1", z1, 0, r1Phase, r1Ground),
      ...zoneMetrics("Z2", z2, z2DelayS, r2Phase, r2Ground),
      ...zoneMetrics("Z3", z3, z3DelayS, r3Phase, r3Ground),
      metric("k0-real", "K0 real", k0.re, undefined, "Compensation", 4),
      metric("k0-imag", "K0 imaginary", k0.im, undefined, "Compensation", 4),
      metric("load-z", "Full-load impedance", fullLoadImpedance, "Ω primary", "Load"),
    ],
    trace: [
      trace(
        "l1",
        "Protected line L1",
        "R1 + jX1",
        complexLabel(l1),
        "Ω",
        input.l1?.name ?? "Missing"
      ),
      trace(
        "z1",
        "Zone 1",
        "0.8 × L1",
        complexLabel(z1),
        "Ω primary",
        "CALCULATION!G107:G108"
      ),
      trace(
        "z2",
        "Zone 2",
        "min(max(1.2L1, 0.8(L1 + 0.8L2)), 0.8(L1 + 0.5Ztrafo))",
        complexLabel(z2),
        "Ω primary",
        "CALCULATION!H112:O120"
      ),
      trace(
        "z3",
        "Zone 3",
        "min(max(1.2(L1+L3), 0.8(L1+1.2K·L3), 0.8(L1+0.8K(L3+0.8L4))), Ztrafo)",
        complexLabel(z3),
        "Ω primary",
        "Cek Distance Manual!H123:Z134"
      ),
      trace(
        "secondary",
        "Primary to secondary",
        "(CCC / CT secondary) ÷ (PT primary / PT secondary)",
        secondaryFactor,
        undefined,
        "CALCULATION!F94"
      ),
      trace(
        "k0",
        "Zero-sequence compensation",
        "(Z0 - Z1) / (3 × Z1)",
        complexLabel(k0),
        undefined,
        "CALCULATION!H101"
      ),
    ],
    warnings,
    assumptions: [
      "L2 adalah outgoing line dengan impedansi minimum dari GI lawan.",
      "L3 adalah outgoing line dengan impedansi maksimum dari GI lawan.",
      "L4 adalah outgoing line minimum dari ujung L3.",
      "Resistive reach memakai hierarchy versi Cek Distance Manual.",
      "Nilai ini adalah reference setting, bukan issued TAP.",
    ],
  };
}

export function findFaultRecord(
  records: CrosscheckFaultRecord[],
  station: string
): CrosscheckFaultRecord | null {
  const key = normalize(station);
  return (
    records.find((record) => normalize(record.substation) === key) ??
    records.find(
      (record) =>
        normalize(record.substation).includes(key) ||
        key.includes(normalize(record.substation))
    ) ??
    null
  );
}

export function connectedLines(
  records: CrosscheckLineRecord[],
  station: string,
  excludeNames: string[] = []
): CrosscheckLineRecord[] {
  const key = normalize(station);
  const excluded = new Set(excludeNames);
  return records.filter(
    (line) =>
      !line.outOfService &&
      !excluded.has(line.name) &&
      (normalize(line.fromSubstation) === key ||
        normalize(line.toSubstation) === key)
  );
}

export function oppositeStation(
  line: CrosscheckLineRecord | null,
  station: string
): string {
  if (!line) return "";
  const key = normalize(station);
  return normalize(line.fromSubstation) === key
    ? line.toSubstation
    : line.fromSubstation;
}

export function suggestDistanceLegs(
  records: CrosscheckLineRecord[],
  localStation: string,
  l1: CrosscheckLineRecord | null
) {
  const remoteStation = oppositeStation(l1, localStation);
  const remoteLines = connectedLines(
    records,
    remoteStation,
    l1 ? [l1.name] : []
  );
  const sorted = [...remoteLines].sort(
    (a, b) => positive(a.z1Ohm) - positive(b.z1Ohm)
  );
  const l2 = sorted[0] ?? null;
  const l3 = sorted[sorted.length - 1] ?? null;
  const afterL3 = oppositeStation(l3, remoteStation);
  const l4Candidates = connectedLines(
    records,
    afterL3,
    [l1?.name ?? "", l3?.name ?? ""]
  ).sort((a, b) => positive(a.z1Ohm) - positive(b.z1Ohm));
  return {
    remoteStation,
    l2,
    l3,
    l4: l4Candidates[0] ?? null,
    remoteLines,
    l4Candidates,
  };
}

function transformerMomentary(
  scheme: TransformerScheme,
  nominalLvA: number
) {
  if (scheme === "SETTING_PLN_PUSAT") {
    return {
      stage1A: round(4 * nominalLvA, 0),
      stage1DelayS: 0.7,
      stage2A: "OFF",
      stage2DelayS: "OFF",
    };
  }
  if (scheme === "SETTING_ZDT") {
    return {
      stage1A: 8000,
      stage1DelayS: 0.7,
      stage2A: "OFF",
      stage2DelayS: "OFF",
    };
  }
  if (scheme === "NON_CASCADE") {
    return {
      stage1A: round(4 * nominalLvA, 0),
      stage1DelayS: 0.1,
      stage2A: round(4 * nominalLvA, 0),
      stage2DelayS: 0.7,
    };
  }
  return {
    stage1A: round(4 * nominalLvA, 0),
    stage1DelayS: 0.5,
    stage2A: round(6.5 * nominalLvA, 0),
    stage2DelayS: 0.3,
  };
}

function standardInverseTms(
  faultCurrentA: number,
  pickupCurrentA: number,
  operatingTimeS: number
) {
  const multiple = safeDivide(faultCurrentA, pickupCurrentA);
  if (multiple <= 1) return 0;
  return (Math.pow(multiple, 0.02) - 1) * (operatingTimeS / 0.14);
}

function lineImpedance(line: CrosscheckLineRecord | null): Complex {
  return complex(positive(line?.r1Ohm), positive(line?.x1Ohm));
}

function lineZeroImpedance(line: CrosscheckLineRecord | null): Complex {
  return complex(positive(line?.r0Ohm), positive(line?.x0Ohm));
}

function metric(
  key: string,
  label: string,
  value: number | string | null,
  unit: string | undefined,
  group: string,
  precision = 3
): ReferenceMetric {
  return { key, label, value, unit, group, precision };
}

function trace(
  id: string,
  label: string,
  formula: string,
  result: number | string | null,
  unit: string | undefined,
  source: string
): ReferenceTraceStep {
  return { id, label, formula, result, unit, source };
}

function positive(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

function safeDivide(a: number, b: number) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(b) > 1e-12
    ? a / b
    : 0;
}

function complex(re: number, im: number): Complex {
  return { re: Number.isFinite(re) ? re : 0, im: Number.isFinite(im) ? im : 0 };
}

function add(...values: Complex[]): Complex {
  return values.reduce(
    (sum, value) => ({ re: sum.re + value.re, im: sum.im + value.im }),
    complex(0, 0)
  );
}

function subtract(a: Complex, b: Complex): Complex {
  return complex(a.re - b.re, a.im - b.im);
}

function scale(value: Complex, factor: number): Complex {
  return complex(value.re * factor, value.im * factor);
}

function multiply(a: Complex, b: Complex): Complex {
  return complex(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
}

function divide(a: Complex, b: Complex): Complex {
  const denominator = b.re * b.re + b.im * b.im;
  if (denominator <= 1e-18) return complex(0, 0);
  return complex(
    (a.re * b.re + a.im * b.im) / denominator,
    (a.im * b.re - a.re * b.im) / denominator
  );
}

function parallel(a: Complex, b: Complex): Complex {
  return divide(multiply(a, b), add(a, b));
}

function abs(value: Complex) {
  return Math.hypot(value.re, value.im);
}

function chooseByAbs(
  a: Complex,
  b: Complex,
  mode: "min" | "max"
): Complex {
  return mode === "min"
    ? abs(a) <= abs(b)
      ? a
      : b
    : abs(a) >= abs(b)
      ? a
      : b;
}

function round(value: number, precision = 3) {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(precision));
}

function complexLabel(value: Complex) {
  const sign = value.im >= 0 ? "+" : "-";
  return `${round(value.re, 4)} ${sign} j${round(Math.abs(value.im), 4)}`;
}

function normalize(value: string) {
  return value
    .toUpperCase()
    .replace(/\b(GI|GIS|GITET|GISTET)\b/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}
