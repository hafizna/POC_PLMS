import type { ProtectionFunctionId } from "./unified";

export type CalculationTemplateStatus = "executable" | "blueprint" | "blocked";

export type CalculationInputSpec = {
  key: string;
  label: string;
  unit?: string;
  source: "asset" | "setting" | "study" | "manual" | "system" | "derived";
  required: boolean;
  note?: string;
};

export type CalculationFormulaStep = {
  id: string;
  label: string;
  expression: string;
  description: string;
};

export type CalculationOutputSpec = {
  key: string;
  label: string;
  unit?: string;
  target: "tap-setting" | "validation" | "report" | "setting-register";
};

export type MathcadBenchmarkSpec = {
  requiredArtifact: string;
  comparisonMethod: string;
  tolerance: string;
  status: "not-started" | "sample-needed" | "ready-for-sample" | "benchmarked";
};

export type CalculationTemplate = {
  id: string;
  name: string;
  shortName: string;
  functionIds: ProtectionFunctionId[];
  status: CalculationTemplateStatus;
  purpose: string;
  scope: string;
  inputs: CalculationInputSpec[];
  formulaSteps: CalculationFormulaStep[];
  outputs: CalculationOutputSpec[];
  assumptions: string[];
  benchmarkAgainst: MathcadBenchmarkSpec[];
  nextImplementationStep?: string;
};

export const CALCULATION_TEMPLATES: CalculationTemplate[] = [
  {
    id: "distance-line-150kv",
    name: "Distance Line 150 kV",
    shortName: "DIST Line",
    functionIds: ["DIST"],
    status: "executable",
    purpose:
      "Menghitung zone reach distance relay untuk penghantar 150 kV, termasuk konversi primary ke secondary dan warning dasar koordinasi.",
    scope:
      "Line protection pada bay penghantar 150 kV dengan data line impedance, CT/VT, next-line reach, dan rule Z1/Z2/Z3.",
    inputs: [
      { key: "bayName", label: "Bay / protected line", source: "study", required: true },
      { key: "relayModel", label: "Relay model", source: "asset", required: true },
      { key: "nominalVoltageKv", label: "Nominal voltage", unit: "kV", source: "asset", required: true },
      { key: "lineLengthKm", label: "Line length", unit: "km", source: "asset", required: true },
      { key: "r1PerKm", label: "Positive-sequence R1", unit: "ohm/km", source: "asset", required: true },
      { key: "x1PerKm", label: "Positive-sequence X1", unit: "ohm/km", source: "asset", required: true },
      { key: "ctPrimaryA", label: "CT primary", unit: "A", source: "asset", required: true },
      { key: "ctSecondaryA", label: "CT secondary", unit: "A", source: "asset", required: true },
      { key: "vtPrimaryKv", label: "VT primary", unit: "kV", source: "asset", required: true },
      { key: "vtSecondaryV", label: "VT secondary", unit: "V", source: "asset", required: true },
      { key: "nextLineXOhm", label: "Next line X", unit: "ohm", source: "derived", required: true },
      { key: "z1Percent", label: "Z1 reach", unit: "%", source: "setting", required: true },
      { key: "z2Percent", label: "Z2 reach", unit: "%", source: "setting", required: true },
      { key: "z3OwnLinePercent", label: "Z3 own-line reach", unit: "%", source: "setting", required: true },
      { key: "z3NextLinePercent", label: "Z3 next-line reach", unit: "%", source: "setting", required: true },
    ],
    formulaSteps: [
      {
        id: "line-impedance",
        label: "Line impedance",
        expression: "Zline = L x (R1/km + jX1/km)",
        description: "Menghitung impedansi protected line pada primary ohm.",
      },
      {
        id: "secondary-conversion",
        label: "Secondary conversion",
        expression: "Zsecondary = Zprimary x (CTR / VTR)",
        description: "Mengubah primary ohm menjadi secondary ohm sesuai CT/VT ratio.",
      },
      {
        id: "zone-reach",
        label: "Zone reach",
        expression: "Z1/Z2/Z3 = reach rule x line or next-line impedance",
        description: "Menghasilkan reach Z1, Z2, dan Z3 untuk TAP preview.",
      },
      {
        id: "load-check",
        label: "Load check",
        expression: "Zload = kV^2 / MVA",
        description: "Warning awal jika load impedance terlalu dekat resistive reach.",
      },
    ],
    outputs: [
      { key: "z1", label: "Zone 1 reach", unit: "ohm", target: "tap-setting" },
      { key: "z2", label: "Zone 2 reach", unit: "ohm", target: "tap-setting" },
      { key: "z3", label: "Zone 3 reach", unit: "ohm", target: "tap-setting" },
      { key: "rfpp", label: "RFPP", unit: "ohm/loop", target: "tap-setting" },
      { key: "rfpe", label: "RFPE", unit: "ohm/loop", target: "tap-setting" },
      { key: "warnings", label: "Engineering warnings", target: "validation" },
    ],
    assumptions: [
      "POC memakai positive-sequence R/X sederhana; zero-sequence compensation belum dimodelkan penuh.",
      "R1/km saat ini diperkirakan dari X jika data real belum tersedia.",
      "Template perlu benchmark terhadap Mathcad existing sebelum dijadikan calculation resmi.",
    ],
    benchmarkAgainst: [
      {
        requiredArtifact: "Export PDF/printout Mathcad distance line 150 kV",
        comparisonMethod: "Bandingkan Z1/Z2/Z3 primary, secondary, RFPP/RFPE, dan timer.",
        tolerance: "Rounding tolerance awal +/- 0.5% atau sesuai rule engineering.",
        status: "ready-for-sample",
      },
    ],
  },
  {
    id: "ocr-gfr-backup-150kv",
    name: "OCR/GFR Backup 150 kV",
    shortName: "OCR/GFR",
    functionIds: ["OCR", "GFR"],
    status: "executable",
    purpose:
      "Menghitung pickup, TMS, curve, dan coordination margin untuk OCR/GFR backup pada bay penghantar.",
    scope: "Backup overcurrent/ground fault feeder atau line bay 150 kV.",
    inputs: [
      { key: "loadCurrent", label: "Load current", unit: "A", source: "system", required: true },
      { key: "faultCurrentMax", label: "Maximum fault current", unit: "A", source: "system", required: true },
      { key: "faultCurrentMin", label: "Minimum fault current", unit: "A", source: "system", required: true },
      { key: "ctRatio", label: "CT ratio", source: "asset", required: true },
      { key: "downstreamClearingTime", label: "Downstream clearing time", unit: "s", source: "setting", required: true },
      { key: "curveFamily", label: "Curve family", source: "setting", required: true },
    ],
    formulaSteps: [
      {
        id: "pickup-selection",
        label: "Pickup selection",
        expression: "I> > max load and sensitive to min fault",
        description: "Menentukan pickup OCR/GFR dengan margin terhadap load dan fault minimum.",
      },
      {
        id: "curve-time",
        label: "Curve time",
        expression: "t = curve(I/Is, TMS)",
        description: "Menghitung waktu operasi berdasarkan curve family dan TMS.",
      },
      {
        id: "grading-margin",
        label: "Grading margin",
        expression: "t(upstream) - t(downstream) >= margin",
        description: "Memastikan koordinasi dengan downstream relay.",
      },
    ],
    outputs: [
      { key: "pickup", label: "Pickup", unit: "A secondary", target: "tap-setting" },
      { key: "tms", label: "TMS", target: "tap-setting" },
      { key: "curve", label: "Curve", target: "tap-setting" },
      { key: "gradingMargin", label: "Grading margin", unit: "s", target: "validation" },
    ],
    assumptions: [
      "Butuh fault current max/min dari studi hubung singkat.",
      "Curve equation harus mengikuti relay/vendor yang dipakai.",
      "POC sudah punya OCR/GFR registry dan comparison, tetapi workbook formula belum executable.",
    ],
    benchmarkAgainst: [
      {
        requiredArtifact: "Mathcad/PDF OCR-GFR backup calculation",
        comparisonMethod: "Bandingkan pickup, TMS, curve, dan operation time pada fault scenarios.",
        tolerance: "Sesuai toleransi timing/grading internal.",
        status: "sample-needed",
      },
    ],
    nextImplementationStep: "Minta satu template OCR/GFR existing dan satu dataset fault current per bus.",
  },
  {
    id: "line-differential-lcd",
    name: "Line Differential / LCD",
    shortName: "LCD",
    functionIds: ["LCD", "TELE"],
    status: "blueprint",
    purpose:
      "Mendokumentasikan setting/checklist line differential, teleprotection, CT matching, channel, dan scheme supervision.",
    scope: "Line differential pada penghantar dengan channel teleproteksi atau pilot scheme.",
    inputs: [
      { key: "ctLocal", label: "Local CT ratio/class", source: "asset", required: true },
      { key: "ctRemote", label: "Remote CT ratio/class", source: "asset", required: true },
      { key: "lineCharging", label: "Line charging current", unit: "A", source: "asset", required: false },
      { key: "teleprotectionScheme", label: "Teleprotection scheme", source: "setting", required: true },
      { key: "channelDelay", label: "Channel delay", unit: "ms", source: "manual", required: false },
    ],
    formulaSteps: [
      {
        id: "ct-consistency",
        label: "CT consistency",
        expression: "local CT and remote CT must be scheme-compatible",
        description: "Validasi kesesuaian CT lokal dan remote untuk differential scheme.",
      },
      {
        id: "diff-sensitivity",
        label: "Differential sensitivity",
        expression: "Idiff/Ibias threshold review",
        description: "Checklist sensitivitas dan stabilitas terhadap through fault.",
      },
      {
        id: "channel-supervision",
        label: "Channel supervision",
        expression: "teleprotection status and delay supervision",
        description: "Mencatat status channel, guard, permissive/blocking, dan fail-safe behavior.",
      },
    ],
    outputs: [
      { key: "ctCheck", label: "CT compatibility check", target: "validation" },
      { key: "schemeCheck", label: "Scheme checklist", target: "report" },
      { key: "lcdSettings", label: "LCD setting values", target: "setting-register" },
    ],
    assumptions: [
      "LCD sering lebih checklist/rule-heavy dibanding formula reach distance.",
      "Butuh template vendor/engineering existing untuk menentukan parameter prioritas.",
    ],
    benchmarkAgainst: [
      {
        requiredArtifact: "Existing LCD calculation/checklist or TAP setting with engineering notes",
        comparisonMethod: "Bandingkan parameter priority, CT matching, and scheme settings.",
        tolerance: "Checklist equivalence and exact match for critical scheme fields.",
        status: "sample-needed",
      },
    ],
    nextImplementationStep: "Ambil satu TAP LCD dan satu export setting P545/P443 untuk menentukan field prioritas.",
  },
  {
    id: "ar-sync-check",
    name: "AR + Synchrocheck",
    shortName: "AR/SYNC",
    functionIds: ["AR", "SYNC"],
    status: "blueprint",
    purpose:
      "Mendokumentasikan autoreclose, dead time, reclaim time, synchrocheck criteria, dan permissive condition.",
    scope: "Autoreclose dan synchrocheck pada bay penghantar.",
    inputs: [
      { key: "deadTime", label: "Dead time", unit: "s", source: "setting", required: true },
      { key: "reclaimTime", label: "Reclaim time", unit: "s", source: "setting", required: true },
      { key: "voltageDiff", label: "Voltage difference limit", unit: "%", source: "setting", required: true },
      { key: "angleDiff", label: "Angle difference limit", unit: "deg", source: "setting", required: true },
      { key: "frequencyDiff", label: "Frequency difference limit", unit: "Hz", source: "setting", required: true },
    ],
    formulaSteps: [
      {
        id: "ar-sequence",
        label: "AR sequence",
        expression: "shot count, dead time, reclaim time",
        description: "Validasi sequence autoreclose terhadap philosophy operasi.",
      },
      {
        id: "sync-window",
        label: "Sync window",
        expression: "dV, dAngle, dF within permitted window",
        description: "Validasi synchrocheck window sebelum close command.",
      },
    ],
    outputs: [
      { key: "arSettings", label: "AR setting checklist", target: "setting-register" },
      { key: "syncSettings", label: "SYNC setting checklist", target: "setting-register" },
      { key: "warnings", label: "Validation warnings", target: "validation" },
    ],
    assumptions: [
      "Template ini lebih cocok sebagai structured checklist pada tahap awal.",
      "Perlu policy operasi dan template setting existing untuk benchmark.",
    ],
    benchmarkAgainst: [
      {
        requiredArtifact: "Existing AR/SYNC TAP setting and engineering assumptions",
        comparisonMethod: "Bandingkan dead time, reclaim time, dV, dAngle, dF, and enable/disable logic.",
        tolerance: "Exact match for binary enable/disable and documented tolerance for numeric fields.",
        status: "sample-needed",
      },
    ],
    nextImplementationStep: "Normalisasi field AR/SYNC dari PDF TAP atau export relay.",
  },
];

export function getCalculationTemplate(templateId: string) {
  return CALCULATION_TEMPLATES.find((template) => template.id === templateId) ?? CALCULATION_TEMPLATES[0];
}
