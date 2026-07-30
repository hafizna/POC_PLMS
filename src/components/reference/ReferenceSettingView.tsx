import { useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  Cable,
  Calculator,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Factory,
  GitBranch,
  Info,
  RotateCcw,
  ShieldCheck,
  Zap,
} from "lucide-react";
import {
  CROSSCHECK_WORKBOOK_REGISTRY,
  type CrosscheckFaultRecord,
  type CrosscheckLineRecord,
} from "../../domain/crosscheck-workbook-registry";
import {
  calculateDistanceReference,
  calculateOcrGfrReference,
  calculateTransformerReference,
  connectedLines,
  findFaultRecord,
  oppositeStation,
  suggestDistanceLegs,
  type DistanceReferenceInput,
  type OcrGfrReferenceInput,
  type ReferenceMetric,
  type ReferenceResult,
  type TransformerReferenceInput,
} from "../../domain/reference-setting";
import { useProsetStore } from "../../store/useProsetStore";
import {
  resolveFaultScenario,
  selectFaultRecordsForScenario,
} from "../../domain/engineering-data";
import { OCR_REGISTRY, type OcrRecord } from "../../domain/ocr-import";
import { LCD_DIST_REGISTRY } from "../../domain/lcd-dist-import";
import {
  buildDistanceDatabaseBaseline,
  buildOcrDatabaseBaseline,
  normalizeObjectName,
} from "../../domain/setting-database-reference";

type ReferenceKind = "ocr-gfr" | "transformer" | "distance";

type LegacyOcrCase = {
  substation?: string;
  bay?: string;
  cccOrTsaA?: number;
  ctPrimaryA?: number;
  ctSecondaryA?: number;
  buspro?: string;
  operatingTimeS?: number;
  voltageKv?: number;
  fault3phA?: number;
  fault1phA?: number;
};

type LegacyDistanceCase = {
  localSubstation?: string;
  subjectBay?: string;
  cccA?: number;
  ctPrimaryA?: number;
  ctSecondaryA?: number;
  ptPrimaryV?: number;
  ptSecondaryV?: number;
};

const registry = CROSSCHECK_WORKBOOK_REGISTRY;
const lineRecords = registry.digsilentLineDb.records;
const faultRecords = registry.faultLevelDb.records;
const legacyOcr = registry.legacyCases.ocrGfr as LegacyOcrCase;
const legacyDistance = registry.legacyCases.distance as LegacyDistanceCase;

const stationOptions = uniqueSorted(
  faultRecords.map((record) => record.substation)
);
const ocrStationOptions = uniqueSorted([
  ...stationOptions,
  ...OCR_REGISTRY.records.map((record) =>
    normalizeObjectName(record.substation)
  ),
]);
const lineStationOptions = uniqueSorted(
  lineRecords.flatMap((line) => [line.fromSubstation, line.toSubstation])
);

const initialOcrRecord =
  OCR_REGISTRY.records.find(
    (record) =>
      /ANGKE/i.test(record.substation) && /ANCOL#?1/i.test(record.bay)
  ) ?? OCR_REGISTRY.records[0];
const initialOcrInput: OcrGfrReferenceInput = initialOcrRecord
  ? ocrInputFromRecord(initialOcrRecord)
  : {
      substation: legacyOcr.substation ?? "PLTGU CILEGON BARU",
      bayType: legacyOcr.bay === "KOPEL" ? "KOPEL" : "LINE",
      bayName: "",
      circuit: "",
      cccOrTsaA: legacyOcr.cccOrTsaA ?? 3412,
      ctPrimaryA: legacyOcr.ctPrimaryA ?? 4000,
      ctSecondaryA: legacyOcr.ctSecondaryA ?? 1,
      hasBusProtection: (legacyOcr.buspro ?? "ADA") === "ADA",
      operatingTimeS: legacyOcr.operatingTimeS ?? 1,
      voltageKv: legacyOcr.voltageKv ?? 150,
      fault3phA: legacyOcr.fault3phA ?? 34_950,
      fault1phA: legacyOcr.fault1phA ?? 35_520,
    };

const telukNaga = findFaultRecord(faultRecords, "TELUK NAGA");
const initialTransformerInput = transformerInputFromFault(
  telukNaga,
  "TELUK NAGA"
);

const initialLocalStation = legacyDistance.localSubstation ?? "MENES5";
const initialL1 =
  lineRecords.find((line) => line.name === legacyDistance.subjectBay) ??
  connectedLines(lineRecords, initialLocalStation)[0] ??
  null;
const initialLegs = suggestDistanceLegs(
  lineRecords,
  initialLocalStation,
  initialL1
);

export function ReferenceSettingView() {
  const stageReferenceForVerification = useProsetStore(
    (state) => state.stageReferenceForVerification
  );
  const studies = useProsetStore((state) => state.studies);
  const activeStudyId = useProsetStore((state) => state.activeStudyId);
  const sourceSnapshots = useProsetStore((state) => state.sourceSnapshots);
  const studyScenarios = useProsetStore((state) => state.studyScenarios);
  const activeStudy = studies.find((study) => study.id === activeStudyId);
  const faultContext = useMemo(
    () =>
      resolveFaultScenario(
        sourceSnapshots,
        studyScenarios,
        activeStudy?.scenarioId
      ),
    [activeStudy?.scenarioId, sourceSnapshots, studyScenarios]
  );
  const [kind, setKind] = useState<ReferenceKind>("ocr-gfr");
  const [showTrace, setShowTrace] = useState(true);
  const [ocrInput, setOcrInput] =
    useState<OcrGfrReferenceInput>(initialOcrInput);
  const [transformerInput, setTransformerInput] =
    useState<TransformerReferenceInput>(initialTransformerInput);
  const [distanceBase, setDistanceBase] = useState({
    localSubstation: initialLocalStation,
    l1Name: initialL1?.name ?? "",
    l2Name: initialLegs.l2?.name ?? "",
    l3Name: initialLegs.l3?.name ?? "",
    l4Name: initialLegs.l4?.name ?? "",
    cccA: legacyDistance.cccA ?? 1822,
    ctPrimaryA: legacyDistance.ctPrimaryA ?? 1600,
    ctSecondaryA: legacyDistance.ctSecondaryA ?? 1,
    ptPrimaryV: legacyDistance.ptPrimaryV ?? 150_000,
    ptSecondaryV: legacyDistance.ptSecondaryV ?? 100,
    transformerPercentZ: 12.5,
    transformerMva: 60,
    transformerHvKv: 150,
    hasGeneratorOrIbtAtRemote: false,
  });

  const l1 = findLine(distanceBase.l1Name);
  const l2 = findLine(distanceBase.l2Name);
  const l3 = findLine(distanceBase.l3Name);
  const l4 = findLine(distanceBase.l4Name);
  const remoteSubstation = oppositeStation(
    l1,
    distanceBase.localSubstation
  );
  const distanceInput: DistanceReferenceInput = {
    ...distanceBase,
    remoteSubstation,
    l1,
    l2,
    l3,
    l4,
  };

  const result = useMemo(() => {
    if (kind === "ocr-gfr") return calculateOcrGfrReference(ocrInput);
    if (kind === "transformer")
      return calculateTransformerReference(transformerInput);
    return calculateDistanceReference(distanceInput);
  }, [kind, ocrInput, transformerInput, distanceBase]);

  const verificationContext =
    kind === "ocr-gfr"
      ? ocrInput.bayType === "LINE"
        ? `${ocrInput.substation} -> ${ocrInput.bayName || "bay belum dipilih"}${
            ocrInput.circuit ? ` · ${ocrInput.circuit}` : ""
          }`
        : `${ocrInput.substation} · KOPEL`
      : kind === "transformer"
        ? `${transformerInput.substation} · ${transformerInput.bayName}`
        : `${distanceBase.localSubstation} -> ${remoteSubstation || "GI lawan"} · ${
            l1?.name || "L1 belum dipilih"
          }`;

  const handleOcrStation = (substation: string) => {
    const databaseRecord = ocrRecordsForStation(substation)[0];
    const selection = selectFaultRecordsForScenario({
      snapshots: sourceSnapshots,
      scenarios: studyScenarios,
      scenarioId: activeStudy?.scenarioId,
      records: faultRecords,
      substation,
    });
    const fault =
      selection.status === "ready"
        ? findFaultRecord(selection.records, substation)
        : undefined;
    setOcrInput((current) => {
      const next = databaseRecord
        ? ocrInputFromRecord(databaseRecord, current)
        : { ...current, substation, bayName: "", databaseRecordId: undefined };
      return {
        ...next,
        voltageKv: fault?.voltageKv ?? next.voltageKv,
        fault3phA: (fault?.fault3phKa ?? 0) * 1000 || next.fault3phA,
        fault1phA: (fault?.fault1phKa ?? 0) * 1000 || next.fault1phA,
      };
    });
  };

  const handleOcrBay = (recordId: string) => {
    const record = OCR_REGISTRY.records.find((item) => item.id === recordId);
    if (!record) return;
    setOcrInput((current) => ocrInputFromRecord(record, current));
  };

  const handleTransformerStation = (substation: string) => {
    const selection = selectFaultRecordsForScenario({
      snapshots: sourceSnapshots,
      scenarios: studyScenarios,
      scenarioId: activeStudy?.scenarioId,
      records: faultRecords,
      substation,
    });
    const fault =
      selection.status === "ready"
        ? findFaultRecord(selection.records, substation)
        : undefined;
    setTransformerInput((current) => ({
      ...current,
      substation,
      hvKv: fault?.voltageKv ?? current.hvKv,
      sourceR1Pu: fault?.r1Pu ?? current.sourceR1Pu,
      sourceX1Pu: fault?.x1Pu ?? current.sourceX1Pu,
      sourceR2Pu: fault?.r2Pu ?? current.sourceR2Pu,
      sourceX2Pu: fault?.x2Pu ?? current.sourceX2Pu,
      sourceR0Pu: fault?.r0Pu ?? current.sourceR0Pu,
      sourceX0Pu: fault?.x0Pu ?? current.sourceX0Pu,
    }));
  };

  const applyDistanceContext = (localSubstation: string, l1Name: string) => {
    const nextL1 = findLine(l1Name);
    const suggested = suggestDistanceLegs(
      lineRecords,
      localSubstation,
      nextL1
    );
    setDistanceBase((current) => ({
      ...current,
      localSubstation,
      l1Name,
      l2Name: suggested.l2?.name ?? "",
      l3Name: suggested.l3?.name ?? "",
      l4Name: suggested.l4?.name ?? "",
    }));
  };

  const handleDistanceL3 = (l3Name: string) => {
    const nextL3 = findLine(l3Name);
    const afterL3 = oppositeStation(nextL3, remoteSubstation);
    const nextL4 = connectedLines(lineRecords, afterL3, [
      distanceBase.l1Name,
      l3Name,
    ]).sort(byImpedance)[0];
    setDistanceBase((current) => ({
      ...current,
      l3Name,
      l4Name: nextL4?.name ?? "",
    }));
  };

  const resetCurrent = () => {
    if (kind === "ocr-gfr") setOcrInput(initialOcrInput);
    if (kind === "transformer")
      setTransformerInput(initialTransformerInput);
    if (kind === "distance") {
      setDistanceBase({
        localSubstation: initialLocalStation,
        l1Name: initialL1?.name ?? "",
        l2Name: initialLegs.l2?.name ?? "",
        l3Name: initialLegs.l3?.name ?? "",
        l4Name: initialLegs.l4?.name ?? "",
        cccA: legacyDistance.cccA ?? 1822,
        ctPrimaryA: legacyDistance.ctPrimaryA ?? 1600,
        ctSecondaryA: legacyDistance.ctSecondaryA ?? 1,
        ptPrimaryV: legacyDistance.ptPrimaryV ?? 150_000,
        ptSecondaryV: legacyDistance.ptSecondaryV ?? 100,
        transformerPercentZ: 12.5,
        transformerMva: 60,
        transformerHvKv: 150,
        hasGeneratorOrIbtAtRemote: false,
      });
    }
  };

  return (
    <div className="space-y-5">
      <header className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
        <div className="px-6 py-5 bg-gradient-to-r from-slate-950 via-slate-900 to-blue-950 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-cyan-300">
                <BookOpenCheck className="h-4 w-4" />
                MVP 1A · REFERENCE ENGINE
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                Reference Setting
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">
                Digitalisasi formula workbook crosscheck 2021. Pilih objek,
                lengkapi data teknis, lalu review hasil dan calculation trace.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Stat value="1,183" label="line records" />
              <Stat value="1,122" label="fault records" />
              <Stat value="v2021.03" label="rule baseline" />
            </div>
          </div>
        </div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
          <Phase
            number="1"
            title="Data teknis"
            detail="DB, IHS, CT/PT, asset"
            active
          />
          <Phase
            number="2"
            title="Reference calculation"
            detail="Formula dan intermediate"
            active
          />
          <Phase
            number="3"
            title="Actual comparison"
            detail="MVP 1B: actual crosscheck"
            active
          />
        </div>
      </header>

      <section
        className={`rounded-xl border px-4 py-3 ${
          faultContext.status === "ready"
            ? "border-blue-200 bg-blue-50"
            : "border-amber-300 bg-amber-50"
        }`}
      >
        <div className="flex items-start gap-2">
          {faultContext.status === "ready" ? (
            <CheckCircle2 className="h-4 w-4 text-blue-700 mt-0.5" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5" />
          )}
          <div>
            <div className="text-xs font-semibold text-slate-800">
              {faultContext.status === "ready"
                ? `Fault lookup: ${faultContext.scenario.name}`
                : "Fault lookup blocked — Study Scenario belum dipilih"}
            </div>
            <div className="text-[11px] text-slate-600 mt-0.5">
              {faultContext.status === "ready"
                ? `${faultContext.scenario.networkRevisionId} · ${faultContext.scenario.studyMethod} · ${faultContext.scenario.condition}. Historical warning tetap berlaku.`
                : "Pemilihan GI hanya mengganti identitas GI; nilai IHS tidak akan di-autofill sampai scenario dipilih di Study Dashboard."}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <KindCard
          active={kind === "ocr-gfr"}
          icon={<Activity className="h-5 w-5" />}
          title="OCR / GFR"
          subtitle="Penghantar dan kopel"
          description="Pickup, secondary value, pu, serta definite/inverse delay."
          onClick={() => setKind("ocr-gfr")}
        />
        <KindCard
          active={kind === "transformer"}
          icon={<Factory className="h-5 w-5" />}
          title="Proteksi Trafo"
          subtitle="DIFF, REF, OCR, GFR, SBEF"
          description="Reference sisi HV/LV dengan fault sequence network."
          onClick={() => setKind("transformer")}
        />
        <KindCard
          active={kind === "distance"}
          icon={<GitBranch className="h-5 w-5" />}
          title="Distance"
          subtitle="Normal forward"
          description="L1–L4, Z1–Z3, K0, resistive reach, dan timer."
          onClick={() => setKind("distance")}
        />
      </section>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(360px,0.82fr)_minmax(0,1.45fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Input engineering
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Biru = editable · abu-abu = derived dari master
              </p>
            </div>
            <button
              type="button"
              onClick={resetCurrent}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset
            </button>
          </div>

          <div className="p-5">
            {kind === "ocr-gfr" ? (
              <OcrGfrForm
                input={ocrInput}
                onChange={setOcrInput}
                onStation={handleOcrStation}
                onBay={handleOcrBay}
              />
            ) : kind === "transformer" ? (
              <TransformerForm
                input={transformerInput}
                onChange={setTransformerInput}
                onStation={handleTransformerStation}
              />
            ) : (
              <DistanceForm
                base={distanceBase}
                remoteSubstation={remoteSubstation}
                onChange={setDistanceBase}
                onContext={applyDistanceContext}
                onL3={handleDistanceL3}
              />
            )}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-700">
                Lanjut ke MVP 1B
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Bekukan hasil ini sebagai reference, lalu bandingkan dengan
                actual manual/CSV/PDF atau hasil parser Vendor Import 1C.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const distanceRecord =
                  kind === "distance"
                    ? findDistanceRecordForLine(
                        distanceBase.localSubstation,
                        l1
                      )
                    : undefined;
                stageReferenceForVerification({
                  kind,
                  contextLabel: verificationContext,
                  result,
                  databaseBaseline:
                    kind === "ocr-gfr" &&
                    ocrInput.bayType === "LINE" &&
                    ocrInput.databaseRecordId
                      ? buildOcrDatabaseBaseline(ocrInput.databaseRecordId)
                      : kind === "distance" && distanceRecord
                        ? buildDistanceDatabaseBaseline(distanceRecord.id)
                        : undefined,
                });
              }}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Bandingkan actual
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          <ResultPanel result={result} />

          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setShowTrace((value) => !value)}
              className="flex w-full items-center justify-between px-5 py-4 text-left"
            >
              <div className="flex items-center gap-3">
                <span className="rounded-lg bg-slate-100 p-2 text-slate-600">
                  <Calculator className="h-4 w-4" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">
                    Calculation trace
                  </h3>
                  <p className="text-xs text-slate-500">
                    {result.trace.length} langkah · {result.ruleId} ·{" "}
                    {result.ruleVersion}
                  </p>
                </div>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-slate-400 transition-transform ${
                  showTrace ? "rotate-180" : ""
                }`}
              />
            </button>
            {showTrace && (
              <div className="border-t border-slate-200 px-5 py-1">
                {result.trace.map((step, index) => (
                  <div
                    key={step.id}
                    className="grid gap-2 border-b border-slate-100 py-4 last:border-0 md:grid-cols-[28px_1fr_auto]"
                  >
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-50 text-[11px] font-bold text-blue-700">
                      {index + 1}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-slate-800">
                        {step.label}
                      </div>
                      <div className="mt-1 font-mono text-[11px] leading-5 text-slate-500">
                        {step.formula}
                      </div>
                      <div className="mt-1 text-[10px] text-slate-400">
                        Source: {step.source}
                      </div>
                    </div>
                    <div className="text-left md:text-right">
                      <div className="font-mono text-sm font-semibold text-slate-900">
                        {formatValue(step.result, 4)}
                      </div>
                      {step.unit && (
                        <div className="text-[10px] text-slate-400">
                          {step.unit}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">
        <div className="flex gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <strong>Batas MVP:</strong> hasil pada halaman ini adalah reference
            setting. Belum ada keputusan compliance terhadap actual relay atau
            TAP resmi. Parser dan comparison akan masuk setelah rule parity
            disetujui engineer.
          </div>
        </div>
      </div>
    </div>
  );
}

function OcrGfrForm({
  input,
  onChange,
  onStation,
  onBay,
}: {
  input: OcrGfrReferenceInput;
  onChange: (value: OcrGfrReferenceInput) => void;
  onStation: (value: string) => void;
  onBay: (recordId: string) => void;
}) {
  const bayRecords = ocrRecordsForStation(input.substation);
  const bayLabels = Object.fromEntries(
    bayRecords.map((record) => [
      record.id,
      `${record.bay} · CT ${record.ctRatio} · ${record.relay.make} ${record.relay.model}`,
    ])
  );
  return (
    <div className="space-y-5">
      <FormSection title="Object" icon={<Zap className="h-4 w-4" />}>
        <SelectField
          label="Gardu induk"
          value={input.substation}
          options={ocrStationOptions}
          onChange={onStation}
        />
        <SegmentedField
          label="Jenis bay"
          value={input.bayType}
          options={[
            { value: "LINE", label: "Penghantar" },
            { value: "KOPEL", label: "Kopel" },
          ]}
          onChange={(bayType) => {
            if (bayType === "LINE" && !input.databaseRecordId && bayRecords[0]) {
              onBay(bayRecords[0].id);
              return;
            }
            onChange({ ...input, bayType: bayType as "LINE" | "KOPEL" });
          }}
        />
        {input.bayType === "LINE" && (
          <SelectField
            label="Bay penghantar"
            value={input.databaseRecordId ?? ""}
            options={
              bayRecords.length > 0
                ? bayRecords.map((record) => record.id)
                : [""]
            }
            labels={
              bayRecords.length > 0
                ? bayLabels
                : { "": "Belum ada bay setting pada database" }
            }
            onChange={onBay}
          />
        )}
      </FormSection>
      <FormSection title="Primary data" icon={<Activity className="h-4 w-4" />}>
        <FieldGrid>
          <NumberField
            label="CCC / TSA"
            value={input.cccOrTsaA}
            unit="A"
            onChange={(cccOrTsaA) => onChange({ ...input, cccOrTsaA })}
          />
          <NumberField
            label="Operating time"
            value={input.operatingTimeS}
            unit="s"
            onChange={(operatingTimeS) =>
              onChange({ ...input, operatingTimeS })
            }
          />
          <NumberField
            label="CT primary"
            value={input.ctPrimaryA}
            unit="A"
            onChange={(ctPrimaryA) => onChange({ ...input, ctPrimaryA })}
          />
          <NumberField
            label="CT secondary"
            value={input.ctSecondaryA}
            unit="A"
            onChange={(ctSecondaryA) => onChange({ ...input, ctSecondaryA })}
          />
        </FieldGrid>
        <ToggleField
          label="Bus protection tersedia"
          checked={input.hasBusProtection}
          onChange={(hasBusProtection) =>
            onChange({ ...input, hasBusProtection })
          }
        />
      </FormSection>
      <FormSection title="Fault level dari IHS" icon={<ShieldCheck className="h-4 w-4" />}>
        <FieldGrid>
          <NumberField
            label="Tegangan"
            value={input.voltageKv}
            unit="kV"
            derived
            onChange={(voltageKv) => onChange({ ...input, voltageKv })}
          />
          <NumberField
            label="3-phase fault"
            value={input.fault3phA}
            unit="A"
            derived
            onChange={(fault3phA) => onChange({ ...input, fault3phA })}
          />
          <NumberField
            label="1-phase fault"
            value={input.fault1phA}
            unit="A"
            derived
            onChange={(fault1phA) => onChange({ ...input, fault1phA })}
          />
        </FieldGrid>
      </FormSection>
    </div>
  );
}

function TransformerForm({
  input,
  onChange,
  onStation,
}: {
  input: TransformerReferenceInput;
  onChange: (value: TransformerReferenceInput) => void;
  onStation: (value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <FormSection title="Transformer" icon={<Factory className="h-4 w-4" />}>
        <SelectField
          label="Gardu induk"
          value={input.substation}
          options={stationOptions}
          onChange={onStation}
        />
        <TextField
          label="Bay"
          value={input.bayName}
          onChange={(bayName) => onChange({ ...input, bayName })}
        />
        <FieldGrid>
          <NumberField
            label="Daya"
            value={input.powerMva}
            unit="MVA"
            onChange={(powerMva) => onChange({ ...input, powerMva })}
          />
          <NumberField
            label="Impedansi"
            value={input.impedancePercent}
            unit="%"
            onChange={(impedancePercent) =>
              onChange({ ...input, impedancePercent })
            }
          />
          <NumberField
            label="HV"
            value={input.hvKv}
            unit="kV"
            onChange={(hvKv) => onChange({ ...input, hvKv })}
          />
          <NumberField
            label="LV"
            value={input.lvKv}
            unit="kV"
            onChange={(lvKv) => onChange({ ...input, lvKv })}
          />
        </FieldGrid>
        <SelectField
          label="Vector / winding model"
          value={input.winding}
          options={["YYD", "YY_SHELL", "YY_CORE"]}
          labels={{
            YYD: "Yyd",
            YY_SHELL: "Yy shell type",
            YY_CORE: "Yy core type",
          }}
          onChange={(winding) =>
            onChange({
              ...input,
              winding: winding as TransformerReferenceInput["winding"],
            })
          }
        />
        <SelectField
          label="Skema 20 kV"
          value={input.scheme}
          options={[
            "SETTING_UIT_UID",
            "SETTING_PLN_PUSAT",
            "SETTING_ZDT",
            "NON_CASCADE",
          ]}
          labels={{
            SETTING_UIT_UID: "Setting UIT & UID",
            SETTING_PLN_PUSAT: "Setting PLN Pusat",
            SETTING_ZDT: "Setting ZDT",
            NON_CASCADE: "Non Cascade",
          }}
          onChange={(scheme) =>
            onChange({
              ...input,
              scheme: scheme as TransformerReferenceInput["scheme"],
            })
          }
        />
      </FormSection>

      <FormSection title="CT phase" icon={<CircleDot className="h-4 w-4" />}>
        <FieldGrid>
          <NumberField
            label="HV primary"
            value={input.phaseCtHvPrimaryA}
            unit="A"
            onChange={(phaseCtHvPrimaryA) =>
              onChange({ ...input, phaseCtHvPrimaryA })
            }
          />
          <NumberField
            label="HV secondary"
            value={input.phaseCtHvSecondaryA}
            unit="A"
            onChange={(phaseCtHvSecondaryA) =>
              onChange({ ...input, phaseCtHvSecondaryA })
            }
          />
          <NumberField
            label="LV primary"
            value={input.phaseCtLvPrimaryA}
            unit="A"
            onChange={(phaseCtLvPrimaryA) =>
              onChange({ ...input, phaseCtLvPrimaryA })
            }
          />
          <NumberField
            label="LV secondary"
            value={input.phaseCtLvSecondaryA}
            unit="A"
            onChange={(phaseCtLvSecondaryA) =>
              onChange({ ...input, phaseCtLvSecondaryA })
            }
          />
        </FieldGrid>
      </FormSection>

      <FormSection title="NGR & neutral" icon={<ShieldCheck className="h-4 w-4" />}>
        <FieldGrid>
          <NumberField
            label="CT NGR primary"
            value={input.ngrCtPrimaryA}
            unit="A"
            onChange={(ngrCtPrimaryA) =>
              onChange({ ...input, ngrCtPrimaryA })
            }
          />
          <NumberField
            label="CT NGR secondary"
            value={input.ngrCtSecondaryA}
            unit="A"
            onChange={(ngrCtSecondaryA) =>
              onChange({ ...input, ngrCtSecondaryA })
            }
          />
          <NumberField
            label="NGR resistance"
            value={input.ngrOhm}
            unit="Ω"
            onChange={(ngrOhm) => onChange({ ...input, ngrOhm })}
          />
          <NumberField
            label="NGR withstand"
            value={input.ngrWithstandS}
            unit="s"
            onChange={(ngrWithstandS) =>
              onChange({ ...input, ngrWithstandS })
            }
          />
        </FieldGrid>
      </FormSection>

      <FormSection title="Source impedance dari IHS" icon={<Activity className="h-4 w-4" />}>
        <FieldGrid>
          <NumberField
            label="R1"
            value={input.sourceR1Pu}
            unit="pu"
            derived
            onChange={(sourceR1Pu) => onChange({ ...input, sourceR1Pu })}
          />
          <NumberField
            label="X1"
            value={input.sourceX1Pu}
            unit="pu"
            derived
            onChange={(sourceX1Pu) => onChange({ ...input, sourceX1Pu })}
          />
          <NumberField
            label="R0"
            value={input.sourceR0Pu}
            unit="pu"
            derived
            onChange={(sourceR0Pu) => onChange({ ...input, sourceR0Pu })}
          />
          <NumberField
            label="X0"
            value={input.sourceX0Pu}
            unit="pu"
            derived
            onChange={(sourceX0Pu) => onChange({ ...input, sourceX0Pu })}
          />
        </FieldGrid>
      </FormSection>
    </div>
  );
}

function DistanceForm({
  base,
  remoteSubstation,
  onChange,
  onContext,
  onL3,
}: {
  base: {
    localSubstation: string;
    l1Name: string;
    l2Name: string;
    l3Name: string;
    l4Name: string;
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
  remoteSubstation: string;
  onChange: (value: typeof base) => void;
  onContext: (local: string, l1Name: string) => void;
  onL3: (lineName: string) => void;
}) {
  const localLines = connectedLines(lineRecords, base.localSubstation);
  const remoteLines = connectedLines(lineRecords, remoteSubstation, [
    base.l1Name,
  ]);
  const l3End = oppositeStation(findLine(base.l3Name), remoteSubstation);
  const l4Lines = connectedLines(lineRecords, l3End, [
    base.l1Name,
    base.l3Name,
  ]);

  return (
    <div className="space-y-5">
      <FormSection title="Protected object" icon={<Cable className="h-4 w-4" />}>
        <SelectField
          label="GI lokal"
          value={base.localSubstation}
          options={lineStationOptions}
          onChange={(local) => {
            const first = connectedLines(lineRecords, local)[0];
            onContext(local, first?.name ?? "");
          }}
        />
        <SelectField
          label="L1 · protected line"
          value={base.l1Name}
          options={localLines.map((line) => line.name)}
          onChange={(lineName) => onContext(base.localSubstation, lineName)}
        />
        <DerivedLine label="GI lawan" value={remoteSubstation || "Belum terpetakan"} />
      </FormSection>

      <FormSection title="Reach path L1–L4" icon={<GitBranch className="h-4 w-4" />}>
        <LineSelect
          slot="L2"
          description="Impedansi minimum dari GI lawan"
          value={base.l2Name}
          options={remoteLines}
          onChange={(l2Name) => onChange({ ...base, l2Name })}
        />
        <LineSelect
          slot="L3"
          description="Impedansi maksimum dari GI lawan"
          value={base.l3Name}
          options={remoteLines}
          onChange={onL3}
        />
        <LineSelect
          slot="L4"
          description="Impedansi minimum setelah ujung L3"
          value={base.l4Name}
          options={l4Lines}
          onChange={(l4Name) => onChange({ ...base, l4Name })}
        />
        <ToggleField
          label="Ada pembangkit / IBT di GI lawan"
          checked={base.hasGeneratorOrIbtAtRemote}
          onChange={(hasGeneratorOrIbtAtRemote) =>
            onChange({ ...base, hasGeneratorOrIbtAtRemote })
          }
        />
      </FormSection>

      <FormSection title="Instrument transformer" icon={<CircleDot className="h-4 w-4" />}>
        <FieldGrid>
          <NumberField
            label="CCC"
            value={base.cccA}
            unit="A"
            onChange={(cccA) => onChange({ ...base, cccA })}
          />
          <NumberField
            label="CT primary"
            value={base.ctPrimaryA}
            unit="A"
            onChange={(ctPrimaryA) => onChange({ ...base, ctPrimaryA })}
          />
          <NumberField
            label="CT secondary"
            value={base.ctSecondaryA}
            unit="A"
            onChange={(ctSecondaryA) => onChange({ ...base, ctSecondaryA })}
          />
          <NumberField
            label="PT primary"
            value={base.ptPrimaryV}
            unit="V"
            onChange={(ptPrimaryV) => onChange({ ...base, ptPrimaryV })}
          />
          <NumberField
            label="PT secondary"
            value={base.ptSecondaryV}
            unit="V"
            onChange={(ptSecondaryV) => onChange({ ...base, ptSecondaryV })}
          />
        </FieldGrid>
      </FormSection>

      <FormSection title="Remote transformer limit" icon={<Factory className="h-4 w-4" />}>
        <FieldGrid>
          <NumberField
            label="Impedansi"
            value={base.transformerPercentZ}
            unit="%"
            onChange={(transformerPercentZ) =>
              onChange({ ...base, transformerPercentZ })
            }
          />
          <NumberField
            label="Daya"
            value={base.transformerMva}
            unit="MVA"
            onChange={(transformerMva) =>
              onChange({ ...base, transformerMva })
            }
          />
          <NumberField
            label="HV"
            value={base.transformerHvKv}
            unit="kV"
            onChange={(transformerHvKv) =>
              onChange({ ...base, transformerHvKv })
            }
          />
        </FieldGrid>
      </FormSection>
    </div>
  );
}

function ResultPanel({ result }: { result: ReferenceResult }) {
  const groups = groupMetrics(result.metrics);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-50 p-1 text-emerald-600">
              <CheckCircle2 className="h-4 w-4" />
            </span>
            <h2 className="text-sm font-semibold text-slate-900">
              Reference result
            </h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Auto-calculated · full precision retained
          </p>
        </div>
        <span className="w-fit rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-700">
          Not an issued TAP
        </span>
      </div>

      <div className="space-y-5 p-5">
        {Object.entries(groups).map(([group, metrics]) => (
          <div key={group}>
            <div className="mb-2 flex items-center gap-2">
              <div className="h-px flex-1 bg-slate-100" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {group}
              </span>
              <div className="h-px flex-1 bg-slate-100" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {metrics.map((metric) => (
                <MetricCard key={metric.key} metric={metric} />
              ))}
            </div>
          </div>
        ))}

        {result.warnings.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              Engineering review
            </div>
            <ul className="space-y-1.5 text-xs leading-5 text-amber-800">
              {result.warnings.map((warning) => (
                <li key={warning} className="flex gap-2">
                  <span>•</span>
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="rounded-xl bg-slate-50 p-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Assumptions
          </div>
          <ul className="space-y-1 text-xs leading-5 text-slate-600">
            {result.assumptions.map((assumption) => (
              <li key={assumption} className="flex gap-2">
                <span className="text-slate-300">—</span>
                <span>{assumption}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ metric }: { metric: ReferenceMetric }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
      <div className="text-[11px] leading-4 text-slate-500">{metric.label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="font-mono text-lg font-semibold tracking-tight text-slate-950">
          {formatValue(metric.value, metric.precision)}
        </span>
        {metric.unit && (
          <span className="text-[10px] text-slate-400">{metric.unit}</span>
        )}
      </div>
    </div>
  );
}

function KindCard({
  active,
  icon,
  title,
  subtitle,
  description,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  title: string;
  subtitle: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group rounded-2xl border p-4 text-left transition-all ${
        active
          ? "border-blue-500 bg-blue-50 shadow-sm ring-2 ring-blue-100"
          : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`rounded-xl p-2.5 ${
            active
              ? "bg-blue-600 text-white"
              : "bg-slate-100 text-slate-600 group-hover:bg-slate-200"
          }`}
        >
          {icon}
        </span>
        {active && <CheckCircle2 className="h-5 w-5 text-blue-600" />}
      </div>
      <div className="mt-3 text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-0.5 text-xs font-medium text-blue-700">{subtitle}</div>
      <div className="mt-2 text-xs leading-5 text-slate-500">{description}</div>
    </button>
  );
}

function FormSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-700">
        <span className="text-slate-400">{icon}</span>
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function FieldGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function NumberField({
  label,
  value,
  unit,
  derived,
  onChange,
}: {
  label: string;
  value: number;
  unit?: string;
  derived?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div
        className={`flex overflow-hidden rounded-lg border ${
          derived ? "border-slate-200 bg-slate-100" : "border-blue-200 bg-white"
        }`}
      >
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          step="any"
          onChange={(event) => onChange(Number(event.target.value))}
          className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
        />
        {unit && (
          <span className="flex items-center border-l border-inherit px-2 text-[10px] text-slate-400">
            {unit}
          </span>
        )}
      </div>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  labels,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  labels?: Record<string, string>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels?.[option] ?? option}
          </option>
        ))}
      </select>
    </label>
  );
}

function SegmentedField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              value === option.value
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 px-3 py-2.5">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-9 rounded-full transition-colors ${
          checked ? "bg-blue-600" : "bg-slate-300"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </label>
  );
}

function DerivedLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-100 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 text-sm font-medium text-slate-700">{value}</div>
    </div>
  );
}

function LineSelect({
  slot,
  description,
  value,
  options,
  onChange,
}: {
  slot: string;
  description: string;
  value: string;
  options: CrosscheckLineRecord[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-md bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {slot}
        </span>
        <span className="text-[10px] text-slate-500">{description}</span>
      </div>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-blue-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-blue-500"
      >
        <option value="">Tidak tersedia</option>
        {options.map((line) => (
          <option key={`${line.row}:${line.name}`} value={line.name}>
            {line.name} · Z1 {formatValue(line.z1Ohm, 3)} Ω
          </option>
        ))}
      </select>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur">
      <div className="font-mono text-sm font-semibold text-white">{value}</div>
      <div className="mt-0.5 text-[9px] uppercase tracking-wide text-slate-400">
        {label}
      </div>
    </div>
  );
}

function Phase({
  number,
  title,
  detail,
  active,
}: {
  number: string;
  title: string;
  detail: string;
  active?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 bg-white px-5 py-3">
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${
          active
            ? "bg-blue-600 text-white"
            : "border border-slate-300 text-slate-400"
        }`}
      >
        {active ? <CheckCircle2 className="h-4 w-4" /> : number}
      </span>
      <div>
        <div className="text-xs font-semibold text-slate-800">{title}</div>
        <div className="text-[10px] text-slate-400">{detail}</div>
      </div>
      {number !== "3" && (
        <ArrowRight className="ml-auto hidden h-4 w-4 text-slate-300 sm:block" />
      )}
    </div>
  );
}

function transformerInputFromFault(
  fault: CrosscheckFaultRecord | null,
  substation: string
): TransformerReferenceInput {
  return {
    substation,
    bayName: "TRF 2",
    manufacturer: "LAINNYA",
    powerMva: 60,
    impedancePercent: 12,
    winding: "YYD",
    hvKv: fault?.voltageKv ?? 150,
    lvKv: 20,
    phaseCtHvPrimaryA: 300,
    phaseCtHvSecondaryA: 5,
    phaseCtLvPrimaryA: 2000,
    phaseCtLvSecondaryA: 5,
    neutralCtHvPrimaryA: 2000,
    neutralCtHvSecondaryA: 5,
    neutralCtLvPrimaryA: 2000,
    neutralCtLvSecondaryA: 5,
    ngrCtPrimaryA: 2000,
    ngrCtSecondaryA: 5,
    ngrOhm: 12,
    ngrMaxCurrentA: 1000,
    ngrWithstandS: 10,
    scheme: "SETTING_UIT_UID",
    sourceR1Pu: fault?.r1Pu ?? 0.0018,
    sourceX1Pu: fault?.x1Pu ?? 0.0167,
    sourceR2Pu: fault?.r2Pu ?? 0,
    sourceX2Pu: fault?.x2Pu ?? 0.02,
    sourceR0Pu: fault?.r0Pu ?? 0.00618,
    sourceX0Pu: fault?.x0Pu ?? 0.02627,
    ohlR1Ohm: 0.0411,
    ohlX1Ohm: 0.2812,
  };
}

function ocrRecordsForStation(substation: string) {
  const station = normalizeObjectName(substation);
  return OCR_REGISTRY.records
    .filter(
      (record) => normalizeObjectName(record.substation) === station
    )
    .sort((a, b) =>
      `${a.bay} ${a.circuit}`.localeCompare(`${b.bay} ${b.circuit}`)
    );
}

function ocrInputFromRecord(
  record: OcrRecord,
  previous?: OcrGfrReferenceInput
): OcrGfrReferenceInput {
  const substation = normalizeObjectName(record.substation);
  const fault = findFaultRecord(faultRecords, substation);
  const line = findLineForOcrRecord(record);
  const [ctPrimaryA, ctSecondaryA] = parseRatio(record.ctRatio);
  return {
    substation,
    bayType: "LINE",
    bayName: record.bay,
    circuit: record.circuit,
    databaseRecordId: record.id,
    cccOrTsaA:
      lineAmpacityA(line) ??
      previous?.cccOrTsaA ??
      legacyOcr.cccOrTsaA ??
      0,
    ctPrimaryA:
      ctPrimaryA || previous?.ctPrimaryA || legacyOcr.ctPrimaryA || 0,
    ctSecondaryA:
      ctSecondaryA || previous?.ctSecondaryA || legacyOcr.ctSecondaryA || 1,
    hasBusProtection: previous?.hasBusProtection ?? true,
    operatingTimeS:
      previous?.operatingTimeS ?? legacyOcr.operatingTimeS ?? 1,
    voltageKv:
      fault?.voltageKv ??
      previous?.voltageKv ??
      legacyOcr.voltageKv ??
      150,
    fault3phA:
      (fault?.fault3phKa ?? 0) * 1000 ||
      previous?.fault3phA ||
      legacyOcr.fault3phA ||
      0,
    fault1phA:
      (fault?.fault1phKa ?? 0) * 1000 ||
      previous?.fault1phA ||
      legacyOcr.fault1phA ||
      0,
  };
}

function findLineForOcrRecord(record: OcrRecord) {
  const local = normalizeObjectName(record.substation);
  const bay = normalizeObjectName(record.bay);
  const remote = bay.replace(/\s+\d+$/, "");
  const circuit = record.circuit.replace(/\D/g, "");
  return (
    lineRecords.find((line) => {
      const from = normalizeObjectName(line.fromSubstation);
      const to = normalizeObjectName(line.toSubstation);
      const endpoints =
        (from === local && to === remote) ||
        (to === local && from === remote);
      return endpoints && (!circuit || lineCircuit(line.name) === circuit);
    }) ?? null
  );
}

function findDistanceRecordForLine(
  localSubstation: string,
  line: CrosscheckLineRecord | null
) {
  if (!line) return undefined;
  const local = normalizeObjectName(localSubstation);
  const remote = normalizeObjectName(
    oppositeStation(line, localSubstation)
  );
  const circuit = lineCircuit(line.name);
  return LCD_DIST_REGISTRY.records.find((record) => {
    const recordStation = normalizeObjectName(record.substation);
    const recordBay = normalizeObjectName(record.bay);
    const recordCircuit = record.circuit.replace(/\D/g, "");
    return (
      recordStation === local &&
      recordBay.includes(remote) &&
      (!circuit || !recordCircuit || circuit === recordCircuit)
    );
  });
}

function lineAmpacityA(line: CrosscheckLineRecord | null) {
  if (!line) return null;
  const labeled = line.type.match(/\((\d+(?:[.,]\d+)?)\s*A\)/i);
  if (labeled) return Number(labeled[1].replace(",", "."));
  return typeof line.currentRatingKa === "number"
    ? line.currentRatingKa * 1000
    : null;
}

function lineCircuit(name: string) {
  return name.match(/(?:-|#|\s)(\d+)\s*$/)?.[1] ?? "";
}

function parseRatio(value: string): [number, number] {
  const match = value.match(/(\d+(?:\.\d+)?)\s*[/:-]\s*(\d+(?:\.\d+)?)/);
  return match ? [Number(match[1]), Number(match[2])] : [0, 0];
}

function findLine(name: string) {
  return lineRecords.find((line) => line.name === name) ?? null;
}

function byImpedance(a: CrosscheckLineRecord, b: CrosscheckLineRecord) {
  return (a.z1Ohm ?? Number.MAX_VALUE) - (b.z1Ohm ?? Number.MAX_VALUE);
}

function groupMetrics(metrics: ReferenceMetric[]) {
  return metrics.reduce<Record<string, ReferenceMetric[]>>((groups, metric) => {
    groups[metric.group] = [...(groups[metric.group] ?? []), metric];
    return groups;
  }, {});
}

function formatValue(
  value: number | string | null | undefined,
  precision = 3
) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("id-ID", {
    maximumFractionDigits: precision,
    minimumFractionDigits: 0,
  }).format(value);
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b)
  );
}
