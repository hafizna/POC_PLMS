import { useEffect, useState } from "react";
import { Save, TriangleAlert } from "lucide-react";
import { calculateOcr, type OcrInputs, type OcrResults } from "../../lib/ocr-calculation";
import type { CalculationSnapshot } from "../../store/useProsetStore";

type OcrWorkbookProps = {
  lineId: string;
  caseId: string;
  onSave: (
    snapshot: Omit<CalculationSnapshot, "id" | "createdAt" | "actor" | "status"> & {
      status?: CalculationSnapshot["status"];
    }
  ) => string;
};

export function OcrWorkbook({ lineId, caseId, onSave }: OcrWorkbookProps) {
  const [inputs, setInputs] = useState<OcrInputs>({
    loadCurrent: 400,
    ctPrimary: 1000,
    ctSecondary: 1,
    pickupMultiplier: 1.1,
    curveType: "SI",
    tms: 0.1,
    faultCurrentMax: 5000,
    faultCurrentMin: 1500,
    gradingMarginS: 0.3,
  });
  const [results, setResults] = useState<OcrResults>(() => calculateOcr(inputs));
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => {
    setResults(calculateOcr(inputs));
    setSavedId(null);
  }, [inputs]);

  const updateNumber = (key: keyof OcrInputs, value: number) => {
    setInputs((current) => ({ ...current, [key]: value }));
  };

  const handleSave = () => {
    if (!lineId) return;
    const snapshotId = onSave({
      caseId,
      lineId,
      templateId: "ocr-gfr-backup-150kv",
      templateName: "OCR/GFR Backup 150 kV",
      functionIds: ["OCR", "GFR"],
      sourceRef: "PLMS OCR/GFR Workbook",
      inputValues: {
        loadCurrent: inputs.loadCurrent,
        ctPrimary: inputs.ctPrimary,
        ctSecondary: inputs.ctSecondary,
        pickupMultiplier: inputs.pickupMultiplier,
        curveType: inputs.curveType,
        tms: inputs.tms,
        faultCurrentMax: inputs.faultCurrentMax,
        faultCurrentMin: inputs.faultCurrentMin,
        gradingMarginS: inputs.gradingMarginS,
      },
      outputValues: {
        pickupPrimaryA: results.pickupPrimary,
        pickupSecondaryA: results.pickupSecondary,
        tms: inputs.tms,
        curve: inputs.curveType,
        tripTimeAtMaxFaultS: results.tripTimeAtMaxFault,
        tripTimeAtMinFaultS: results.tripTimeAtMinFault,
        ctRatio: results.ctRatio,
        curveK: results.curveK,
        curveAlpha: results.curveAlpha,
      },
      warnings: results.warnings,
      note: "Draft TAP setting generated from executable OCR/GFR workbook.",
      status: "reviewed",
    });
    setSavedId(snapshotId);
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[420px_1fr] gap-4">
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">
              OCR/GFR Inputs
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              POC workbook berbasis IEC inverse curve. Data fault masih manual sampai hasil studi hubung singkat masuk ke PLMS.
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={!lineId}
            className={`inline-flex items-center gap-1.5 rounded border px-3 py-2 text-xs font-medium transition-colors ${
              lineId
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-slate-200 bg-slate-50 text-slate-300 cursor-not-allowed"
            }`}
          >
            <Save className="w-3.5 h-3.5" />
            Save draft TAP
          </button>
        </div>
        {savedId && (
          <div className="mt-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            OCR/GFR calculation snapshot saved to Setting Register.
          </div>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Input label="Load Current" value={inputs.loadCurrent} unit="A" onChange={(value) => updateNumber("loadCurrent", value)} />
          <Input label="Pickup Multiplier" value={inputs.pickupMultiplier} step={0.05} unit="x load" onChange={(value) => updateNumber("pickupMultiplier", value)} />
          <Input label="CT Primary" value={inputs.ctPrimary} unit="A" onChange={(value) => updateNumber("ctPrimary", value)} />
          <Input label="CT Secondary" value={inputs.ctSecondary} unit="A" onChange={(value) => updateNumber("ctSecondary", value)} />
          <Input label="TMS" value={inputs.tms} step={0.01} onChange={(value) => updateNumber("tms", value)} />
          <Input label="Grading Margin" value={inputs.gradingMarginS} step={0.05} unit="s" onChange={(value) => updateNumber("gradingMarginS", value)} />
          <Input label="Max Fault Current" value={inputs.faultCurrentMax} unit="A" onChange={(value) => updateNumber("faultCurrentMax", value)} />
          <Input label="Min Fault Current" value={inputs.faultCurrentMin} unit="A" onChange={(value) => updateNumber("faultCurrentMin", value)} />
        </div>
        <label className="mt-3 flex flex-col gap-1">
          <span className="text-[11px] text-slate-600">Curve Type</span>
          <select
            value={inputs.curveType}
            onChange={(event) =>
              setInputs((current) => ({
                ...current,
                curveType: event.target.value as OcrInputs["curveType"],
              }))
            }
            className="w-full px-2 py-1.5 text-sm border border-slate-300 rounded focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent/30"
          >
            <option value="SI">IEC Standard Inverse</option>
            <option value="VI">IEC Very Inverse</option>
            <option value="EI">IEC Extremely Inverse</option>
            <option value="LTI">IEC Long Time Inverse</option>
          </select>
        </label>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-2 bg-slate-50">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">
            OCR/GFR Calculation Result
          </h3>
        </div>
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <ResultCard label="Pickup Primary" value={`${results.pickupPrimary.toFixed(2)} A`} />
            <ResultCard label="Pickup Secondary" value={`${results.pickupSecondary.toFixed(4)} A`} />
            <ResultCard label="Max Fault Trip" value={formatTime(results.tripTimeAtMaxFault)} />
            <ResultCard label="Min Fault Trip" value={formatTime(results.tripTimeAtMinFault)} />
          </div>
          <div className="rounded-md border border-brand-accent/40 bg-brand-accent/10 px-3 py-2">
            <div className="text-xs font-semibold text-brand-accent-dark">IEC inverse curve</div>
            <div className="font-mono text-[11px] text-brand-accent-dark mt-1">
              t = TMS x k / ((I / Is)^alpha - 1)
            </div>
            <div className="text-[11px] text-brand-accent-dark mt-1">
              Curve {inputs.curveType}: k = {results.curveK}, alpha = {results.curveAlpha}; CT ratio = {results.ctRatio}
            </div>
          </div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs font-semibold text-slate-700">Engineering warnings</div>
            {results.warnings.length === 0 ? (
              <div className="text-xs text-emerald-700 mt-1">No warning from basic OCR/GFR POC checks.</div>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {results.warnings.map((warning) => (
                  <li key={warning} className="flex gap-2 text-xs text-red-800">
                    <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{warning}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  unit,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-slate-600">{label}</span>
      <div className="flex">
        <input
          type="number"
          value={value}
          step={step}
          onChange={(event) => onChange(Number(event.target.value))}
          className="w-full min-w-0 px-2 py-1.5 text-sm border border-slate-300 rounded-l focus:border-brand-accent focus:outline-none focus:ring-1 focus:ring-brand-accent/30"
        />
        {unit && (
          <span className="inline-flex items-center px-2 text-[11px] text-slate-500 border border-l-0 border-slate-300 rounded-r bg-slate-50">
            {unit}
          </span>
        )}
      </div>
    </label>
  );
}

function ResultCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">{label}</div>
      <div className="mt-1 font-mono text-lg font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function formatTime(value: number | null) {
  return value === null ? "no trip" : `${value.toFixed(3)} s`;
}
