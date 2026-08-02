import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Download,
  FileCode2,
  FileText,
  Loader2,
  ScanText,
  ShieldCheck,
  Upload,
  XCircle,
} from "lucide-react";
import {
  extractPdfText,
  extractTapDocumentIdentity,
  extractTapFields,
  type OcrProgress,
  type TapDocumentIdentity,
} from "../../lib/ocr";
import {
  compareReferenceToActual,
  demoActualText,
  mapManualParameter,
  parameterDefinitions,
  parseActualSettingText,
  type NormalizedActualParameter,
  type ToleranceProfile,
  type UnmappedActualParameter,
  type ValueBasis,
  type VerificationRowStatus,
  type VerificationSourceKind,
} from "../../domain/setting-verification";
import { useProsetStore } from "../../store/useProsetStore";

export function ActualVerificationView() {
  const reference = useProsetStore(
    (state) => state.verificationReferenceDraft
  );
  const importedDraft = useProsetStore(
    (state) => state.vendorImportHandoffDraft
  );
  const openedFromCaseId = useProsetStore((state) => state.openedFromCaseId);
  const saveVerificationRun = useProsetStore((state) => state.saveVerificationRun);
  const caseImportedDraft =
    !openedFromCaseId || importedDraft?.caseId === openedFromCaseId
      ? importedDraft
      : null;
  const setTab = useProsetStore((state) => state.setTab);
  const [sourceKind, setSourceKind] =
    useState<VerificationSourceKind>(
      caseImportedDraft ? "vendor-import" : "manual"
    );
  const [currentBasis, setCurrentBasis] = useState<ValueBasis>("secondary");
  const [impedanceBasis, setImpedanceBasis] =
    useState<ValueBasis>("secondary");
  const [profile, setProfile] =
    useState<ToleranceProfile>("engineering");
  const [referenceBasis, setReferenceBasis] = useState<
    "database" | "calculated"
  >(reference?.databaseBaseline ? "database" : "calculated");
  const [editorText, setEditorText] = useState(
    caseImportedDraft?.normalizedText ?? ""
  );
  const [parsedText, setParsedText] = useState(
    caseImportedDraft?.normalizedText ?? ""
  );
  const [fileName, setFileName] = useState(
    caseImportedDraft?.sourceFileName ?? ""
  );
  const [savedRunId, setSavedRunId] = useState("");
  const [dispositions, setDispositions] = useState<Record<string, {
    action: "accept_as_found" | "reset_required" | "reference_correction" | "investigation";
    note?: string;
    decidedAt: string;
  }>>({});
  const [manualParameters, setManualParameters] = useState<
    NormalizedActualParameter[]
  >([]);
  const [busyLabel, setBusyLabel] = useState("");
  const [activeGroup, setActiveGroup] = useState("ALL");
  const [pdfSummary, setPdfSummary] = useState<{
    method: string;
    pageCount: number;
    averageConfidence?: number;
    fieldCount: number;
  } | null>(null);
  const [pdfIdentity, setPdfIdentity] =
    useState<TapDocumentIdentity | null>(null);
  const activeReferenceResult =
    referenceBasis === "database" && reference?.databaseBaseline
      ? reference.databaseBaseline.result
      : reference?.result;

  const parsed = useMemo(() => {
    if (!reference || !parsedText.trim()) return null;
    return parseActualSettingText(parsedText, {
      referenceKind: reference.kind,
      currentBasis,
      impedanceBasis,
    });
  }, [reference, parsedText, currentBasis, impedanceBasis]);

  const actualParameters = useMemo(() => {
    const automatic = parsed?.parameters ?? [];
    const manualIds = new Set(manualParameters.map((parameter) => parameter.id));
    return [
      ...automatic.filter((parameter) => !manualIds.has(parameter.id)),
      ...manualParameters,
    ];
  }, [parsed, manualParameters]);

  const report = useMemo(() => {
    if (!reference || !activeReferenceResult || !parsed) return null;
    return compareReferenceToActual(activeReferenceResult, actualParameters, {
      kind: reference.kind,
      profile,
      currentBasis,
      impedanceBasis,
    });
  }, [
    reference,
    activeReferenceResult,
    parsed,
    actualParameters,
    profile,
    currentBasis,
    impedanceBasis,
  ]);
  const discrepancyRows = report?.rows.filter(
    (row) => row.status === "mismatch" || row.status === "missing-actual"
  ) ?? [];
  const unresolvedDispositionCount = discrepancyRows.filter(
    (row) => !dispositions[row.id]
  ).length;
  useEffect(() => setSavedRunId(""), [report, dispositions]);

  const definitions = useMemo(
    () =>
      reference
        ? parameterDefinitions(
            activeReferenceResult ?? reference.result,
            reference.kind,
            {
            currentBasis,
            impedanceBasis,
            }
          )
        : [],
    [reference, activeReferenceResult, currentBasis, impedanceBasis]
  );

  const manuallyMappedSourceKeys = new Set(
    manualParameters.map(
      (parameter) => `${parameter.sourceLine}:${parameter.rawName}`
    )
  );
  const remainingUnmapped =
    parsed?.unmapped.filter(
      (parameter) =>
        !manuallyMappedSourceKeys.has(
          `${parameter.sourceLine}:${parameter.rawName}`
        )
    ) ?? [];
  const groups = report
    ? Array.from(new Set(report.rows.map((row) => row.group)))
    : [];
  const visibleRows =
    activeGroup === "ALL"
      ? report?.rows ?? []
      : report?.rows.filter((row) => row.group === activeGroup) ?? [];
  const relayIdentityMismatch =
    pdfIdentity &&
    reference?.databaseBaseline &&
    pdfIdentity.relayModels.length > 0 &&
    !pdfIdentity.relayModels.some((model) =>
      normalizeRelayLabel(reference.databaseBaseline?.relayLabel ?? "").includes(
        normalizeRelayLabel(model)
      )
    );

  if (!reference) {
    return (
      <div className="mx-auto max-w-3xl">
        <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-slate-950 to-indigo-950 px-6 py-6 text-white">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-indigo-300">
              MVP 1B · ACTUAL VERIFICATION
            </div>
            <h1 className="mt-2 text-2xl font-semibold">Actual vs Reference</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              Verification selalu dimulai dari hasil reference 1A yang sudah
              diketahui input, formula, dan rule version-nya.
            </p>
          </div>
          <div className="p-8 text-center">
            <CircleDashed className="mx-auto h-10 w-10 text-slate-300" />
            <h2 className="mt-4 text-base font-semibold text-slate-900">
              Belum ada reference yang dibekukan
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
              Hitung OCR/GFR, trafo, atau Distance di MVP 1A, kemudian pilih
              “Bandingkan actual”.
            </p>
            <button
              type="button"
              onClick={() => setTab("reference-setting")}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-brand-ink px-4 py-2 text-sm font-semibold text-white hover:bg-black"
            >
              <ArrowLeft className="h-4 w-4" />
              Buka Reference Setting
            </button>
          </div>
        </header>
      </div>
    );
  }

  const parseEditor = () => {
    setManualParameters([]);
    setDispositions({});
    setSavedRunId("");
    setParsedText(editorText);
    setActiveGroup("ALL");
  };

  const loadDemo = () => {
    const demo = demoActualText(
      reference.kind,
      activeReferenceResult ?? reference.result
    );
    setEditorText(demo);
    setParsedText(demo);
    setFileName("demo-actual-setting.csv");
    setSourceKind("csv");
    setManualParameters([]);
    setDispositions({});
    setSavedRunId("");
    setActiveGroup("ALL");
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setManualParameters([]);
    setBusyLabel("");
    setPdfSummary(null);
    setPdfIdentity(null);
    setDispositions({});
    setSavedRunId("");
    try {
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        setSourceKind("tap-pdf");
        setBusyLabel("Membaca TAP PDF…");
        const extracted = await extractPdfText(
          file,
          (progress) => setBusyLabel(progressLabel(progress)),
          { maxPages: 12 }
        );
        const fields = extractTapFields(extracted.fullText);
        setPdfIdentity(extractTapDocumentIdentity(extracted.fullText));
        const fieldLines = fields
          .map(
            (field) =>
              `${field.field}=${field.value}${field.unit ? ` ${field.unit}` : ""}`
          )
          .join("\n");
        const combined = [
          "# NORMALIZED CANDIDATES",
          fieldLines || "# Tidak ada kandidat setting yang ditemukan",
          "",
          "# RAW DOCUMENT EXTRACTION",
          extracted.fullText,
        ].join("\n");
        const confidences = extracted.pages
          .map((page) => page.confidence)
          .filter((value): value is number => typeof value === "number");
        setPdfSummary({
          method:
            extracted.method === "ocr"
              ? "Scanned PDF · dual-pass OCR"
              : "PDF text layer",
          pageCount: extracted.pageCount,
          averageConfidence:
            confidences.length > 0
              ? confidences.reduce((sum, value) => sum + value, 0) /
                confidences.length
              : undefined,
          fieldCount: fields.length,
        });
        setEditorText(combined);
        setParsedText(combined);
      } else {
        setSourceKind("csv");
        setBusyLabel("Membaca CSV/text…");
        const text = await file.text();
        setEditorText(text);
        setParsedText(text);
      }
      setActiveGroup("ALL");
    } catch (error) {
      setEditorText(
        `# File gagal dibaca\n# ${(error as Error).message}\n# Export ulang ke text/CSV atau gunakan paste manual.`
      );
      setParsedText("");
    } finally {
      setBusyLabel("");
    }
  };

  const addManualMapping = (
    raw: UnmappedActualParameter,
    parameterId: string
  ) => {
    const mapped = mapManualParameter(raw, parameterId);
    if (!mapped) return;
    setManualParameters((current) => [
      ...current.filter((parameter) => parameter.id !== parameterId),
      mapped,
    ]);
  };

  const exportReport = () => {
    if (!report) return;
    const payload = {
      schema: "plms.actual-verification.v1",
      generatedAt: new Date().toISOString(),
      reference: {
        kind: reference.kind,
        context: reference.contextLabel,
        basis: referenceBasis,
        ruleId: (activeReferenceResult ?? reference.result).ruleId,
        ruleVersion: (activeReferenceResult ?? reference.result).ruleVersion,
        databaseSource: reference.databaseBaseline?.sourceRef,
        stagedAt: reference.stagedAt,
      },
      source: {
        fileName: fileName || "manual-input",
        kind: sourceKind,
        vendor: parsed?.vendor,
        format: parsed?.format,
      },
      toleranceProfile: profile,
      currentBasis,
      impedanceBasis,
      report,
      unmapped: remainingUnmapped,
      dispositions,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `plms-verification-${reference.kind}-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const saveReportToCase = () => {
    if (!report || !openedFromCaseId || unresolvedDispositionCount > 0) return;
    const id = saveVerificationRun({
      caseId: openedFromCaseId,
      sourceFileName: fileName || "manual-input",
      sourceKind,
      adapterId: caseImportedDraft?.adapterId,
      evidenceAuthority:
        sourceKind === "tap-pdf" || caseImportedDraft?.adapterId === "tap-pdf-profile-v1"
          ? "issued_document"
          : caseImportedDraft?.evidenceAuthority ?? "derived_candidate",
      acquisitionChecksumSha256:
        caseImportedDraft?.acquisitionManifest?.checksumSha256,
      acquisitionManifest: caseImportedDraft?.acquisitionManifest,
      referenceContext: reference.contextLabel,
      toleranceProfile: profile,
      report,
      unmappedCount: remainingUnmapped.length,
      dispositions,
    });
    setSavedRunId(id);
  };

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950 px-6 py-5 text-white">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-300">
                <ShieldCheck className="h-4 w-4" />
                MVP 1B · ACTUAL VERIFICATION
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                Actual vs Reference
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-300">
                Masukkan actual secara manual, PDF, CSV, atau gunakan hasil
                normalisasi Vendor Import 1C; lalu bandingkan terhadap 1A.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3">
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                Frozen reference
              </div>
              <div className="mt-1 max-w-md truncate text-sm font-semibold">
                {reference.contextLabel}
              </div>
              <div className="mt-0.5 text-[10px] text-slate-400">
                {(activeReferenceResult ?? reference.result).ruleId} ·{" "}
                {(activeReferenceResult ?? reference.result).ruleVersion}
              </div>
            </div>
          </div>
        </div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-4">
          <WorkflowStep number="1" label="Reference" detail="Frozen dari 1A" done />
          <WorkflowStep
            number="2"
            label="Actual source"
            detail="Manual / PDF / CSV / 1C"
            done={Boolean(parsed)}
          />
          <WorkflowStep
            number="3"
            label="Normalize"
            detail="Alias & basis review"
            done={Boolean(parsed && remainingUnmapped.length === 0)}
          />
          <WorkflowStep
            number="4"
            label="Verify"
            detail="Tolerance & decision"
            done={Boolean(report)}
          />
        </div>
      </header>

      <section className="grid gap-5 xl:grid-cols-[minmax(380px,0.85fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          <Panel
            title="1. Reference & comparison basis"
            subtitle="Basis harus sama dengan yang ditampilkan relay/TAP."
          >
            <div className="rounded-xl border border-brand-accent/40 bg-brand-accent/10 p-3">
              <div className="text-xs font-semibold text-brand-accent-dark">
                {referenceBasis === "database" &&
                reference.databaseBaseline
                  ? reference.databaseBaseline.label
                  : reference.contextLabel}
              </div>
              <div className="mt-1 text-[11px] text-brand-accent-dark">
                {(activeReferenceResult ?? reference.result).metrics.length}{" "}
                comparable metrics · staged{" "}
                {formatDate(reference.stagedAt)}
              </div>
              {referenceBasis === "database" &&
                reference.databaseBaseline && (
                  <div className="mt-2 rounded-lg border border-brand-accent/40 bg-white/70 px-2.5 py-2 text-[10px] leading-4 text-brand-accent-dark">
                    <div className="font-semibold">
                      {reference.databaseBaseline.relayLabel}
                    </div>
                    <div>
                      {reference.databaseBaseline.sourceRef} ·{" "}
                      {reference.databaseBaseline.source ===
                      "setting-db-issued"
                        ? "issued/TAP setting"
                        : "installed setting"}
                    </div>
                  </div>
                )}
              <button
                type="button"
                onClick={() => setTab("reference-setting")}
                className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-accent-dark hover:text-brand-ink"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Ubah reference di 1A
              </button>
            </div>
            {reference.databaseBaseline && (
              <div className="mt-3">
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Comparison reference
                </div>
                <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      setReferenceBasis("database");
                      setManualParameters([]);
                    }}
                    className={`rounded-md px-3 py-2 text-[11px] font-semibold ${
                      referenceBasis === "database"
                        ? "bg-white text-brand-accent-dark shadow-sm"
                        : "text-slate-500"
                    }`}
                  >
                    Setting database
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReferenceBasis("calculated");
                      setManualParameters([]);
                    }}
                    className={`rounded-md px-3 py-2 text-[11px] font-semibold ${
                      referenceBasis === "calculated"
                        ? "bg-white text-brand-accent-dark shadow-sm"
                        : "text-slate-500"
                    }`}
                  >
                    Engineering calculation
                  </button>
                </div>
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-3">
              {reference.kind !== "transformer" &&
                referenceBasis !== "database" && (
                <SelectField
                  label={
                    reference.kind === "distance"
                      ? "Impedance basis"
                      : "Current basis"
                  }
                  value={
                    reference.kind === "distance"
                      ? impedanceBasis
                      : currentBasis
                  }
                  onChange={(value) => {
                    if (reference.kind === "distance")
                      setImpedanceBasis(value as ValueBasis);
                    else setCurrentBasis(value as ValueBasis);
                    setManualParameters([]);
                  }}
                  options={[
                    { value: "secondary", label: "Secondary / relay" },
                    { value: "primary", label: "Primary" },
                  ]}
                />
              )}
              <SelectField
                label="Tolerance profile"
                value={profile}
                onChange={(value) =>
                  setProfile(value as ToleranceProfile)
                }
                options={[
                  { value: "engineering", label: "Engineering" },
                  { value: "strict", label: "Strict / exact" },
                  { value: "commissioning", label: "Commissioning" },
                ]}
              />
            </div>
          </Panel>

          <Panel
            title="2. Actual document"
            subtitle="File diproses lokal di browser dan tidak diunggah ke server."
          >
            <div className="grid grid-cols-3 gap-2">
              <SourceButton
                active={sourceKind === "csv" || sourceKind === "vendor-import"}
                icon={<FileCode2 className="h-4 w-4" />}
                label={sourceKind === "vendor-import" ? "From 1C" : "CSV"}
                onClick={() => setSourceKind("csv")}
              />
              <SourceButton
                active={sourceKind === "tap-pdf"}
                icon={<FileText className="h-4 w-4" />}
                label="TAP PDF"
                onClick={() => setSourceKind("tap-pdf")}
              />
              <SourceButton
                active={sourceKind === "manual"}
                icon={<ScanText className="h-4 w-4" />}
                label="Paste"
                onClick={() => setSourceKind("manual")}
              />
            </div>

            <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-xs font-semibold text-slate-700 hover:border-brand-accent/50 hover:bg-brand-accent/10">
              {busyLabel ? (
                <Loader2 className="h-4 w-4 animate-spin text-brand-accent-dark" />
              ) : (
                <Upload className="h-4 w-4 text-brand-accent-dark" />
              )}
              {busyLabel || fileName || "Pilih .csv, .txt, atau .pdf"}
              <input
                type="file"
                className="hidden"
                accept=".txt,.csv,.pdf,application/pdf"
                disabled={Boolean(busyLabel)}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
            </label>

            {pdfSummary && (
              <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[10px] sm:grid-cols-4">
                <div>
                  <div className="uppercase tracking-wide text-slate-400">
                    Extraction
                  </div>
                  <div className="mt-0.5 font-semibold text-slate-700">
                    {pdfSummary.method}
                  </div>
                </div>
                <div>
                  <div className="uppercase tracking-wide text-slate-400">
                    Pages
                  </div>
                  <div className="mt-0.5 font-semibold text-slate-700">
                    {pdfSummary.pageCount}
                  </div>
                </div>
                <div>
                  <div className="uppercase tracking-wide text-slate-400">
                    OCR confidence
                  </div>
                  <div className="mt-0.5 font-semibold text-slate-700">
                    {pdfSummary.averageConfidence === undefined
                      ? "text layer"
                      : `${pdfSummary.averageConfidence.toFixed(0)}%`}
                  </div>
                </div>
                <div>
                  <div className="uppercase tracking-wide text-slate-400">
                    Setting fields
                  </div>
                  <div
                    className={`mt-0.5 font-semibold ${
                      pdfSummary.fieldCount > 0
                        ? "text-emerald-700"
                        : "text-amber-700"
                    }`}
                  >
                    {pdfSummary.fieldCount} detected
                  </div>
                </div>
              </div>
            )}
            {pdfIdentity &&
              (pdfIdentity.documentNumber ||
                pdfIdentity.station ||
                pdfIdentity.bayDirection ||
                pdfIdentity.relayModels.length > 0) && (
                <div className="mt-2 rounded-xl border border-slate-200 bg-white p-3 text-[10px]">
                  <div className="font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Document identity review
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div>
                      <span className="text-slate-400">Object</span>
                      <div className="font-semibold text-slate-800">
                        {pdfIdentity.station || "GI belum terdeteksi"}
                        {pdfIdentity.bayDirection
                          ? ` -> ${pdfIdentity.bayDirection}`
                          : ""}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-400">Relay / function</span>
                      <div className="font-semibold text-slate-800">
                        {pdfIdentity.relayModels.join(", ") ||
                          "Model belum terdeteksi"}
                        {pdfIdentity.functions.length > 0
                          ? ` · ${pdfIdentity.functions.join(" + ")}`
                          : ""}
                      </div>
                    </div>
                    {pdfIdentity.documentNumber && (
                      <div className="sm:col-span-2">
                        <span className="text-slate-400">Document</span>
                        <div className="font-mono font-semibold text-slate-800">
                          {pdfIdentity.documentNumber}
                        </div>
                      </div>
                    )}
                  </div>
                  {relayIdentityMismatch && (
                    <div className="mt-2 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Model relay pada dokumen berbeda dari record database
                      terpilih. Kemungkinan dokumen historis sebelum penggantian
                      relay; review identitas aset sebelum memutuskan compliance.
                    </div>
                  )}
                </div>
              )}

            <textarea
              value={editorText}
              onChange={(event) => {
                setEditorText(event.target.value);
                if (sourceKind !== "manual") setSourceKind("manual");
              }}
              rows={11}
              spellCheck={false}
              placeholder={"OC pickup=1.024 A sec\nOC TMS=0.2917\nGF pickup=0.171 A sec\nGF TMS=0.5875"}
              className="mt-3 w-full resize-y rounded-xl border border-slate-300 bg-slate-950 px-3 py-2 font-mono text-[11px] leading-5 text-slate-100 outline-none focus:border-brand-accent"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={parseEditor}
                disabled={!editorText.trim() || Boolean(busyLabel)}
                className="rounded-lg bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:bg-black disabled:cursor-not-allowed disabled:opacity-40"
              >
                Normalize setting
              </button>
              <button
                type="button"
                onClick={loadDemo}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Load benchmark demo
              </button>
            </div>
          </Panel>
        </div>

        <div className="space-y-4">
          {!parsed ? (
            <div className="grid min-h-[420px] place-items-center rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
              <div>
                <CircleDashed className="mx-auto h-10 w-10 text-slate-300" />
                <h2 className="mt-4 text-sm font-semibold text-slate-900">
                  Menunggu actual setting
                </h2>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">
                  Pilih file atau gunakan benchmark demo. Mapping dan comparison
                  akan muncul di sini.
                </p>
              </div>
            </div>
          ) : (
            <>
              <Panel
                title="3. Normalization review"
                subtitle={`${parsed.vendor} · ${parsed.format} · ${parsed.sourceLineCount} source lines`}
                right={
                  <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700">
                    {actualParameters.length} mapped
                  </span>
                }
              >
                {parsed.warnings.length > 0 && (
                  <div className="mb-3 space-y-1">
                    {parsed.warnings.map((warning) => (
                      <div
                        key={warning}
                        className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"
                      >
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {warning}
                      </div>
                    ))}
                  </div>
                )}

                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.12em] text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Raw parameter</th>
                        <th className="px-3 py-2 font-semibold">Canonical</th>
                        <th className="px-3 py-2 font-semibold">Value</th>
                        <th className="px-3 py-2 font-semibold">Confidence</th>
                      </tr>
                    </thead>
                    <tbody>
                      {actualParameters.map((parameter) => (
                        <tr
                          key={`${parameter.id}:${parameter.sourceLine}`}
                          className="border-t border-slate-100"
                        >
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-800">
                              {parameter.rawName}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              line {parameter.sourceLine}
                            </div>
                          </td>
                          <td className="px-3 py-2 font-mono text-brand-accent-dark">
                            {parameter.id}
                          </td>
                          <td className="px-3 py-2 font-mono text-slate-700">
                            {parameter.value} {parameter.unit}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                                parameter.confidence === "high"
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-amber-200 bg-amber-50 text-amber-700"
                              }`}
                            >
                              {parameter.confidence}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {remainingUnmapped.length > 0 && (
                  <div className="mt-4">
                    <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-800">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      {remainingUnmapped.length} parameter perlu mapping manual
                    </div>
                    <div className="space-y-2">
                      {remainingUnmapped.map((raw) => (
                        <ManualMappingRow
                          key={`${raw.sourceLine}:${raw.rawName}`}
                          raw={raw}
                          definitions={definitions}
                          onMap={addManualMapping}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </Panel>

              {report && (
                <Panel
                  title="4. Verification result"
                  subtitle={
                    referenceBasis === "database"
                      ? "Setting database vs normalized actual document"
                      : "Engineering calculation vs normalized actual document"
                  }
                  right={
                    <div className="flex flex-wrap gap-2">
                      {openedFromCaseId && (
                        <button
                          type="button"
                          onClick={saveReportToCase}
                          disabled={unresolvedDispositionCount > 0 || Boolean(savedRunId)}
                          title={unresolvedDispositionCount > 0 ? `${unresolvedDispositionCount} discrepancy belum didisposisi` : undefined}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          {savedRunId ? "Saved to case" : "Save verification run"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={exportReport}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        <Download className="h-3.5 w-3.5" />
                        Export evidence
                      </button>
                    </div>
                  }
                >
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                    <DecisionCard decision={report.decision} />
                    <MetricCard
                      label="Match"
                      value={report.summary.match}
                      tone="emerald"
                    />
                    <MetricCard
                      label="Tolerance"
                      value={report.summary["within-tolerance"]}
                      tone="amber"
                    />
                    <MetricCard
                      label="Mismatch"
                      value={report.summary.mismatch}
                      tone="red"
                    />
                    <MetricCard
                      label="Coverage"
                      value={`${report.coveragePercent.toFixed(0)}%`}
                      tone="slate"
                    />
                  </div>

                  <div className="mt-4 flex flex-wrap gap-1 border-b border-slate-200">
                    <GroupTab
                      label="All"
                      active={activeGroup === "ALL"}
                      onClick={() => setActiveGroup("ALL")}
                    />
                    {groups.map((group) => (
                      <GroupTab
                        key={group}
                        label={group}
                        active={activeGroup === group}
                        onClick={() => setActiveGroup(group)}
                      />
                    ))}
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-left text-xs">
                      <thead className="text-[10px] uppercase tracking-[0.12em] text-slate-500">
                        <tr>
                          <th className="px-3 py-2 font-semibold">Parameter</th>
                          <th className="px-3 py-2 font-semibold">Reference</th>
                          <th className="px-3 py-2 font-semibold">Actual</th>
                          <th className="px-3 py-2 font-semibold">Delta</th>
                          <th className="px-3 py-2 font-semibold">Tolerance</th>
                          <th className="px-3 py-2 font-semibold">Status</th>
                          <th className="px-3 py-2 font-semibold">Disposition</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleRows.map((row) => (
                          <tr
                            key={row.id}
                            className={`border-t border-slate-100 ${
                              row.status === "mismatch"
                                ? "bg-red-50/60"
                                : row.status === "within-tolerance"
                                  ? "bg-amber-50/50"
                                  : ""
                            }`}
                          >
                            <td className="px-3 py-2">
                              <div className="font-medium text-slate-900">
                                {row.label}
                              </div>
                              <div className="font-mono text-[10px] text-slate-400">
                                {row.id}
                              </div>
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-700">
                              {displayValue(row.referenceValue)}{" "}
                              <span className="text-slate-400">{row.unit}</span>
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-700">
                              {row.actualValue === null
                                ? "—"
                                : displayValue(row.actualValue)}{" "}
                              <span className="text-slate-400">{row.unit}</span>
                            </td>
                            <td className="px-3 py-2 font-mono text-slate-600">
                              {row.delta === null
                                ? "—"
                                : `${formatSigned(row.delta)}${
                                    row.deltaPercent === null
                                      ? ""
                                      : ` (${formatSigned(row.deltaPercent)}%)`
                                  }`}
                            </td>
                            <td className="px-3 py-2 text-[11px] text-slate-500">
                              {row.toleranceLabel}
                            </td>
                            <td className="px-3 py-2">
                              <StatusBadge status={row.status} />
                            </td>
                            <td className="px-3 py-2">
                              {row.status === "mismatch" || row.status === "missing-actual" ? (
                                <div className="min-w-44 space-y-1">
                                  <select
                                    value={dispositions[row.id]?.action ?? ""}
                                    onChange={(event) => {
                                      const action = event.target.value as
                                        | "accept_as_found"
                                        | "reset_required"
                                        | "reference_correction"
                                        | "investigation";
                                      setDispositions((current) => ({
                                        ...current,
                                        [row.id]: {
                                          action,
                                          note: current[row.id]?.note,
                                          decidedAt: new Date().toISOString(),
                                        },
                                      }));
                                      setSavedRunId("");
                                    }}
                                    className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-[10px]"
                                  >
                                    <option value="" disabled>Pilih tindakan…</option>
                                    <option value="reset_required">Reset required</option>
                                    <option value="accept_as_found">Accept as found</option>
                                    <option value="reference_correction">Correct reference</option>
                                    <option value="investigation">Investigate</option>
                                  </select>
                                  {dispositions[row.id] && (
                                    <input
                                      value={dispositions[row.id].note ?? ""}
                                      onChange={(event) => {
                                        const note = event.target.value;
                                        setDispositions((current) => ({
                                          ...current,
                                          [row.id]: { ...current[row.id], note },
                                        }));
                                        setSavedRunId("");
                                      }}
                                      placeholder="Catatan (opsional)"
                                      className="w-full rounded border border-slate-300 px-2 py-1 text-[10px]"
                                    />
                                  )}
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-400">Tidak perlu</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Panel>
              )}
            </>
          )}
        </div>
      </section>

      <div className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-[11px] leading-5 text-slate-600">
        1B bertanggung jawab pada semantic comparison dan keputusan tolerance.
        Parsing format proprietary berada di Vendor Import 1C; 1B menerima
        manual/CSV, basic PDF intake, atau normalized handoff dari 1C.
      </div>
    </div>
  );
}

function WorkflowStep({
  number,
  label,
  detail,
  done,
}: {
  number: string;
  label: string;
  detail: string;
  done: boolean;
}) {
  return (
    <div className="flex items-center gap-3 bg-white px-4 py-3">
      <span
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
          done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
        }`}
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : number}
      </span>
      <div>
        <div className="text-xs font-semibold text-slate-800">{label}</div>
        <div className="text-[10px] text-slate-500">{detail}</div>
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
  right,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>
        </div>
        {right}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label>
      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </span>
      <span className="relative mt-1 block">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-lg border border-slate-300 bg-white px-3 py-2 pr-8 text-xs font-medium text-slate-700 outline-none focus:border-brand-accent"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
      </span>
    </label>
  );
}

function SourceButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center gap-1.5 rounded-lg border px-2 py-2 text-[10px] font-semibold ${
        active
          ? "border-brand-accent/40 bg-brand-accent/10 text-brand-accent-dark"
          : "border-slate-200 text-slate-500 hover:bg-slate-50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ManualMappingRow({
  raw,
  definitions,
  onMap,
}: {
  raw: UnmappedActualParameter;
  definitions: Array<{ id: string; label: string; group: string }>;
  onMap: (raw: UnmappedActualParameter, id: string) => void;
}) {
  const [selected, setSelected] = useState("");
  return (
    <div className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 sm:grid-cols-[1fr_minmax(180px,0.8fr)_auto] sm:items-center">
      <div className="min-w-0">
        <div className="truncate text-[11px] font-semibold text-amber-900">
          {raw.rawName} = {raw.rawValue}
        </div>
        <div className="text-[10px] text-amber-700">line {raw.sourceLine}</div>
      </div>
      <select
        value={selected}
        onChange={(event) => setSelected(event.target.value)}
        className="min-w-0 rounded border border-amber-300 bg-white px-2 py-1.5 text-[11px] text-slate-700"
      >
        <option value="">Pilih canonical parameter…</option>
        {definitions.map((definition) => (
          <option key={definition.id} value={definition.id}>
            {definition.group} · {definition.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!selected}
        onClick={() => onMap(raw, selected)}
        className="rounded border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-40"
      >
        Map
      </button>
    </div>
  );
}

function DecisionCard({
  decision,
}: {
  decision: "PASS" | "REVIEW" | "FAIL";
}) {
  const styles = {
    PASS: "border-emerald-200 bg-emerald-50 text-emerald-800",
    REVIEW: "border-amber-200 bg-amber-50 text-amber-800",
    FAIL: "border-red-200 bg-red-50 text-red-800",
  }[decision];
  const icon = {
    PASS: <CheckCircle2 className="h-4 w-4" />,
    REVIEW: <AlertTriangle className="h-4 w-4" />,
    FAIL: <XCircle className="h-4 w-4" />,
  }[decision];
  return (
    <div className={`rounded-xl border p-3 ${styles}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
        {icon}
        Decision
      </div>
      <div className="mt-1 text-xl font-bold">{decision}</div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "emerald" | "amber" | "red" | "slate";
}) {
  const styles = {
    emerald: "border-emerald-200 bg-emerald-50",
    amber: "border-amber-200 bg-amber-50",
    red: "border-red-200 bg-red-50",
    slate: "border-slate-200 bg-slate-50",
  }[tone];
  return (
    <div className={`rounded-xl border p-3 ${styles}`}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
    </div>
  );
}

function GroupTab({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b-2 px-3 py-2 text-[11px] font-semibold ${
        active
          ? "border-brand-accent-dark text-brand-accent-dark"
          : "border-transparent text-slate-500 hover:text-slate-800"
      }`}
    >
      {label}
    </button>
  );
}

function StatusBadge({ status }: { status: VerificationRowStatus }) {
  const config: Record<
    VerificationRowStatus,
    { label: string; className: string; icon: ReactNode }
  > = {
    match: {
      label: "MATCH",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
      icon: <CheckCircle2 className="h-3 w-3" />,
    },
    "within-tolerance": {
      label: "TOLERANCE",
      className: "border-amber-200 bg-amber-50 text-amber-700",
      icon: <AlertTriangle className="h-3 w-3" />,
    },
    mismatch: {
      label: "MISMATCH",
      className: "border-red-200 bg-red-50 text-red-700",
      icon: <XCircle className="h-3 w-3" />,
    },
    "missing-actual": {
      label: "MISSING",
      className: "border-slate-200 bg-slate-50 text-slate-600",
      icon: <CircleDashed className="h-3 w-3" />,
    },
  };
  const item = config[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold ${item.className}`}
    >
      {item.icon}
      {item.label}
    </span>
  );
}

function progressLabel(progress: OcrProgress) {
  if (progress.phase === "loading") return "Memuat PDF engine…";
  if (progress.phase === "text-layer")
    return `Membaca text layer ${progress.pageNumber ?? "?"}/${progress.pageCount ?? "?"}…`;
  if (progress.phase === "ocr-rendering")
    return `Menyiapkan OCR ${progress.pageNumber ?? "?"}/${progress.pageCount ?? "?"}…`;
  if (progress.phase === "ocr-recognizing")
    return `OCR ${Math.round((progress.pageProgress ?? 0) * 100)}%…`;
  return "Menyelesaikan ekstraksi…";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function displayValue(value: number | string | null) {
  if (typeof value === "number") {
    return new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: 6,
    }).format(value);
  }
  return value ?? "—";
}

function formatSigned(value: number) {
  const rounded = Math.abs(value) < 1e-9 ? 0 : value;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(4)}`;
}

function normalizeRelayLabel(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "");
}
