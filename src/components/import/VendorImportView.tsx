import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Download,
  ExternalLink,
  FileCode2,
  FileText,
  Filter,
  Layers3,
  Loader2,
  Search,
  Upload,
} from "lucide-react";
import { extractPdfText, extractTapFields, type OcrProgress } from "../../lib/ocr";
import {
  VENDOR_IMPORT_ADAPTERS,
  adaptTapPdfFields,
  adaptRioXrioResult,
  parseMicomCourierSet,
  vendorImportToVerificationText,
  type VendorImportParameter,
  type VendorImportResult,
} from "../../domain/vendor-import";
import { parseRioOrXrio } from "../../domain/rio-xrio-import";
import { useProsetStore } from "../../store/useProsetStore";
import {
  RELAY_CATALOG,
  assetsForModel,
  manualForRelayModel,
  parserReadinessForModel,
  type RelayModelCatalogEntry,
} from "../../domain/relay-catalog";

type ResultFilter = "all" | "canonical" | "review";

export function VendorImportView() {
  const stageForVerification = useProsetStore(
    (state) => state.stageVendorImportForVerification
  );
  const reference = useProsetStore(
    (state) => state.verificationReferenceDraft
  );
  const [result, setResult] = useState<VendorImportResult | null>(null);
  const [busyLabel, setBusyLabel] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("ALL");
  const [filter, setFilter] = useState<ResultFilter>("all");
  const [catalogQuery, setCatalogQuery] = useState("");
  const [selectedModelKey, setSelectedModelKey] = useState(
    `${RELAY_CATALOG.modelCatalog[0]?.brand}|${RELAY_CATALOG.modelCatalog[0]?.model}`
  );
  const [fileChecksum, setFileChecksum] = useState("");
  const [deviceIdentity, setDeviceIdentity] = useState("");
  const [activeSettingGroup, setActiveSettingGroup] = useState("");
  const [toolName, setToolName] = useState("");
  const [toolVersion, setToolVersion] = useState("");
  const [readAt, setReadAt] = useState("");

  const groups = useMemo(
    () =>
      result
        ? Array.from(
            new Set(result.parameters.map((parameter) => parameter.functionGroup))
          ).sort()
        : [],
    [result]
  );

  const visible = useMemo(() => {
    if (!result) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return result.parameters.filter((parameter) => {
      if (group !== "ALL" && parameter.functionGroup !== group) return false;
      if (filter === "canonical" && !parameter.canonicalKey) return false;
      if (
        filter === "review" &&
        parameter.decodeStatus !== "review" &&
        parameter.confidence !== "review"
      )
        return false;
      if (!normalizedQuery) return true;
      return [
        parameter.address,
        parameter.rawName,
        parameter.canonicalKey,
        parameter.functionGroup,
        String(parameter.value),
      ].some((value) => value?.toLowerCase().includes(normalizedQuery));
    });
  }, [result, query, group, filter]);
  const visibleModels = useMemo(() => {
    const normalized = catalogQuery.trim().toLowerCase();
    if (!normalized) return RELAY_CATALOG.modelCatalog;
    return RELAY_CATALOG.modelCatalog.filter((entry) =>
      [
        entry.brand,
        entry.model,
        ...entry.functions,
        ...entry.bayKinds,
      ].some((value) => value.toLowerCase().includes(normalized))
    );
  }, [catalogQuery]);
  const selectedModel = RELAY_CATALOG.modelCatalog.find(
    (entry) => `${entry.brand}|${entry.model}` === selectedModelKey
  );

  const handleFile = async (file: File) => {
    setResult(null);
    setError("");
    setBusyLabel("Mendeteksi format…");
    setGroup("ALL");
    setFilter("all");
    setFileChecksum("");
    try {
      let imported: VendorImportResult;
      const bytes = new Uint8Array(await file.arrayBuffer());
      setFileChecksum(await sha256Hex(bytes));
      if (/\.set$/i.test(file.name)) {
        setBusyLabel("Mendekode MiCOM Courier record…");
        imported = parseMicomCourierSet(
          bytes,
          file.name
        );
      } else if (/\.(?:rio|xrio|xml)$/i.test(file.name)) {
        setBusyLabel("Membaca distance zones RIO/XRIOâ€¦");
        const text = new TextDecoder().decode(bytes);
        const parsed = parseRioOrXrio(text);
        if (!parsed) throw new Error("Struktur RIO/XRIO tidak dikenali oleh adapter.");
        imported = adaptRioXrioResult(parsed, file.name, text);
      } else if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        setBusyLabel("Mengekstrak TAP PDF…");
        const extracted = await extractPdfText(
          file,
          (progress) => setBusyLabel(progressLabel(progress)),
          { maxPages: 16 }
        );
        imported = adaptTapPdfFields(
          extractTapFields(extracted.fullText),
          file.name,
          extracted.fullText
        );
        imported.metadata.extractionMethod = extracted.method;
        imported.metadata.pageCount = String(extracted.pageCount);
      } else {
        throw new Error(
          "Format yang diterima: MiCOM .set, .rio, .xrio/.xml, atau TAP PDF."
        );
      }
      setResult(imported);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusyLabel("");
    }
  };

  const exportCanonical = () => {
    if (!result) return;
    downloadJson(
      result,
      `plms-import-${safeFileStem(result.sourceFileName)}-${Date.now()}.json`
    );
  };

  const handoff = () => {
    if (!result) return;
    const manifestComplete = [
      deviceIdentity,
      activeSettingGroup,
      toolName,
      toolVersion,
      readAt,
      fileChecksum,
    ].every((value) => value.trim());
    const isTapDocument = result.adapterId === "tap-pdf-profile-v1";
    stageForVerification({
      sourceFileName: result.sourceFileName,
      adapterId: result.adapterId,
      sourceFormat: result.sourceFormat,
      vendor: result.vendor,
      model: result.model,
      normalizedText: vendorImportToVerificationText(result),
      evidenceAuthority:
        manifestComplete && !isTapDocument
          ? "actual_readback"
          : "derived_candidate",
      ...(manifestComplete && !isTapDocument
        ? {
            acquisitionManifest: {
              deviceIdentity: deviceIdentity.trim(),
              activeGroup: activeSettingGroup.trim(),
              toolName: toolName.trim(),
              toolVersion: toolVersion.trim(),
              readAt: new Date(readAt).toISOString(),
              checksumSha256: fileChecksum,
            },
          }
        : {}),
    });
  };

  return (
    <div className="space-y-5">
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-slate-950 via-indigo-950 to-blue-950 px-6 py-6 text-white">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-blue-300">
                <Layers3 className="h-4 w-4" />
                MVP 1C · VENDOR IMPORT
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                Vendor & TAP ingestion
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
                Baca format sumber dengan adapter tervalidasi, pertahankan raw
                value, lalu normalisasi ke schema PLMS sebelum crosscheck.
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs">
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                Boundary
              </div>
              <div className="mt-1 font-semibold text-white">
                1C parses · 1B compares
              </div>
              <div className="mt-1 text-[10px] text-slate-400">
                Tidak menghitung recommended setting
              </div>
            </div>
          </div>
        </div>
        <div className="grid gap-px bg-slate-200 sm:grid-cols-3">
          <WorkflowStep
            number="1"
            label="Detect"
            detail="Signature, vendor & model"
            done={Boolean(result)}
          />
          <WorkflowStep
            number="2"
            label="Decode"
            detail="Raw + canonical value"
            done={Boolean(result?.coverage.decodedRecords)}
          />
          <WorkflowStep
            number="3"
            label="Handoff"
            detail="Normalized intake ke 1B"
            done={false}
          />
        </div>
      </header>

      <RelayCatalogPanel
        query={catalogQuery}
        onQueryChange={setCatalogQuery}
        models={visibleModels}
        selectedModel={selectedModel}
        onSelectModel={(entry) =>
          setSelectedModelKey(`${entry.brand}|${entry.model}`)
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {VENDOR_IMPORT_ADAPTERS.map((adapter) => (
          <div
            key={adapter.id}
            className={`rounded-xl border bg-white p-4 shadow-sm ${
              adapter.status === "available"
                ? "border-emerald-200"
                : "border-slate-200"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div
                className={`rounded-lg p-2 ${
                  adapter.id.includes("pdf")
                    ? "bg-amber-50 text-amber-700"
                    : "bg-indigo-50 text-indigo-700"
                }`}
              >
                {adapter.id.includes("pdf") ? (
                  <FileText className="h-4 w-4" />
                ) : (
                  <FileCode2 className="h-4 w-4" />
                )}
              </div>
              <span
                className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${
                  adapter.status === "available"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
              >
                {adapter.status}
              </span>
            </div>
            <div className="mt-3 text-sm font-semibold text-slate-900">
              {adapter.label}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500">
              {adapter.vendor}
            </div>
            <p className="mt-2 text-[10px] leading-4 text-slate-500">
              {adapter.coverage}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(330px,0.7fr)_minmax(0,1.5fr)]">
        <div className="space-y-4">
          <Panel
            title="1. Source document"
            subtitle="Pemrosesan berlangsung lokal di browser."
          >
            <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-6 text-center hover:border-blue-400 hover:bg-blue-50">
              {busyLabel ? (
                <Loader2 className="h-7 w-7 animate-spin text-blue-600" />
              ) : (
                <Upload className="h-7 w-7 text-blue-600" />
              )}
              <span className="mt-3 text-sm font-semibold text-slate-800">
                {busyLabel || "Pilih .set, .rio/.xrio/.xml, atau TAP .pdf"}
              </span>
              <span className="mt-1 max-w-xs text-[10px] leading-4 text-slate-500">
                File relay ditangani adapter vendor. PDF melewati text
                extraction/OCR dan document profile.
              </span>
              <input
                type="file"
                accept=".set,.rio,.xrio,.xml,.pdf,application/pdf"
                disabled={Boolean(busyLabel)}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleFile(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            {error && (
              <div className="mt-3 flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {error}
              </div>
            )}
            {result && result.adapterId !== "tap-pdf-profile-v1" && (
              <div className="mt-4 space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
                    Acquisition manifest
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-blue-700">
                    Lengkapi semua field agar file berwenang sebagai actual readback.
                    Tanpa manifest, hasil tetap masuk sebagai derived candidate.
                  </p>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <ManifestInput label="Device / relay identity" value={deviceIdentity} onChange={setDeviceIdentity} />
                  <ManifestInput label="Active setting group" value={activeSettingGroup} onChange={setActiveSettingGroup} />
                  <ManifestInput label="Official vendor tool" value={toolName} onChange={setToolName} />
                  <ManifestInput label="Tool version" value={toolVersion} onChange={setToolVersion} />
                  <label className="text-[10px] text-slate-600">
                    Read from IED at
                    <input type="datetime-local" value={readAt} onChange={(event) => setReadAt(event.target.value)} className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-xs" />
                  </label>
                  <div className="text-[10px] text-slate-600">
                    SHA-256
                    <div className="mt-1 truncate rounded-lg border border-blue-200 bg-white px-2 py-2 font-mono text-[9px]" title={fileChecksum}>{fileChecksum || "calculatingâ€¦"}</div>
                  </div>
                </div>
              </div>
            )}
          </Panel>

          <Panel
            title="2. Import contract"
            subtitle="Output 1C tetap berguna di luar crosscheck."
          >
            <div className="space-y-3 text-[11px]">
              <ContractRow label="Raw preservation">
                Nama, alamat, raw encoding, dan unit sumber disimpan.
              </ContractRow>
              <ContractRow label="Canonical identity">
                Parameter yang dikenal memperoleh key lintas-dokumen.
              </ContractRow>
              <ContractRow label="Explicit review">
                Record yang belum masuk library tidak dibuang atau ditebak.
              </ContractRow>
            </div>
          </Panel>
        </div>

        {!result ? (
          <div className="grid min-h-[480px] place-items-center rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div>
              <FileCode2 className="mx-auto h-10 w-10 text-slate-300" />
              <h2 className="mt-4 text-sm font-semibold text-slate-900">
                Menunggu dokumen vendor
              </h2>
              <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-slate-500">
                Upload satu file untuk melihat model relay, coverage parser,
                canonical mapping, dan record yang masih perlu review.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <Panel
              title="3. Decode summary"
              subtitle={`${result.sourceFileName} · ${result.sourceFormat}`}
              right={
                <button
                  type="button"
                  onClick={exportCanonical}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export JSON
                </button>
              }
            >
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Metric label="Model" value={result.model ?? "Unknown"} />
                <Metric
                  label="Decoded"
                  value={`${result.coverage.decodedRecords}/${result.coverage.totalRecords}`}
                />
                <Metric
                  label="Canonical"
                  value={result.coverage.canonicalRecords}
                />
                <Metric label="Review" value={result.coverage.reviewRecords} />
              </div>
              <div className="mt-3 space-y-1.5">
                {result.diagnostics.map((diagnostic, index) => (
                  <div
                    key={`${diagnostic.level}:${index}`}
                    className={`flex gap-2 rounded-lg border px-3 py-2 text-[10px] ${
                      diagnostic.level === "error"
                        ? "border-red-200 bg-red-50 text-red-700"
                        : diagnostic.level === "warning"
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-blue-200 bg-blue-50 text-blue-700"
                    }`}
                  >
                    {diagnostic.level === "info" ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    )}
                    {diagnostic.message}
                  </div>
                ))}
              </div>
            </Panel>

            <Panel
              title="4. Parameter library"
              subtitle={`${visible.length} record sesuai filter`}
              right={
                <button
                  type="button"
                  onClick={handoff}
                  disabled={result.coverage.decodedRecords === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
                >
                  Kirim ke Crosscheck 1B
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              }
            >
              {!reference && (
                <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-800">
                  Hasil import dapat dikirim sekarang, tetapi 1B memerlukan
                  reference yang dibekukan dari 1A sebelum comparison berjalan.
                </div>
              )}
              <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_140px]">
                <label className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Cari address, parameter, value…"
                    className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500"
                  />
                </label>
                <Select
                  value={group}
                  onChange={setGroup}
                  options={[
                    { value: "ALL", label: "Semua function" },
                    ...groups.map((item) => ({ value: item, label: item })),
                  ]}
                />
                <Select
                  value={filter}
                  onChange={(value) => setFilter(value as ResultFilter)}
                  options={[
                    { value: "all", label: "All records" },
                    { value: "canonical", label: "Canonical" },
                    { value: "review", label: "Needs review" },
                  ]}
                  icon={<Filter className="h-3.5 w-3.5" />}
                />
              </div>

              <div className="mt-3 max-h-[540px] overflow-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-50 text-[9px] uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Address</th>
                      <th className="px-3 py-2 font-semibold">Source parameter</th>
                      <th className="px-3 py-2 font-semibold">Canonical key</th>
                      <th className="px-3 py-2 font-semibold">Value</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.slice(0, 500).map((parameter, index) => (
                      <ParameterRow
                        key={`${parameter.address}:${parameter.rawName}:${index}`}
                        parameter={parameter}
                      />
                    ))}
                  </tbody>
                </table>
                {visible.length > 500 && (
                  <div className="border-t border-slate-200 bg-slate-50 px-3 py-2 text-center text-[10px] text-slate-500">
                    Menampilkan 500 dari {visible.length} record. Gunakan filter
                    untuk mempersempit hasil.
                  </div>
                )}
              </div>
            </Panel>
          </div>
        )}
      </section>

      <div className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-[11px] leading-5 text-slate-600">
        Scope 1C berhenti pada ingestion dan normalisasi. Library ini sengaja
        menyimpan parameter seperti load blinder, power swing, logic, dan
        autoreclose agar kelak bisa menjadi fondasi mapping antar-model, tetapi
        konversi setting bukan keputusan otomatis pada MVP ini.
      </div>
    </div>
  );
}

function RelayCatalogPanel({
  query,
  onQueryChange,
  models,
  selectedModel,
  onSelectModel,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  models: RelayModelCatalogEntry[];
  selectedModel?: RelayModelCatalogEntry;
  onSelectModel: (entry: RelayModelCatalogEntry) => void;
}) {
  const summary = RELAY_CATALOG.summary;
  const selectedAssets = selectedModel
    ? assetsForModel(selectedModel.brand, selectedModel.model)
    : [];
  const manual = selectedModel
    ? manualForRelayModel(selectedModel.model)
    : undefined;
  const parser = selectedModel
    ? parserReadinessForModel(selectedModel.model)
    : undefined;

  return (
    <Panel
      title="Installed relay catalog"
      subtitle={`${summary.sourceWorkbook} · ${summary.sourceSheets.length} source sheets`}
      right={
        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
          Populated from UPT workbook
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">
        <Metric label="Relay assets" value={summary.assetCount} />
        <Metric label="Model families" value={summary.modelCount} />
        <Metric label="ULTG" value={summary.ultgCount} />
        <Metric label="Stations" value={summary.stationCount} />
        <Metric label="With serial" value={summary.withSerialCount} />
        <Metric
          label="DIgSILENT match"
          value={summary.digsilentMatchedCount}
        />
        <Metric
          label="Join candidates"
          value={summary.digsilentCandidateCount}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
        <div>
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Cari brand, model, fungsi, atau jenis bay…"
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-xs outline-none focus:border-blue-500"
            />
          </label>
          <div className="mt-2 max-h-[420px] overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[660px] text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-50 text-[9px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">Brand / model</th>
                  <th className="px-3 py-2 font-semibold">Assets</th>
                  <th className="px-3 py-2 font-semibold">Bay type</th>
                  <th className="px-3 py-2 font-semibold">Observed functions</th>
                  <th className="px-3 py-2 font-semibold">Manual</th>
                </tr>
              </thead>
              <tbody>
                {models.map((entry) => {
                  const active =
                    selectedModel?.brand === entry.brand &&
                    selectedModel?.model === entry.model;
                  const modelManual = manualForRelayModel(entry.model);
                  return (
                    <tr
                      key={`${entry.brand}:${entry.model}`}
                      onClick={() => onSelectModel(entry)}
                      className={`cursor-pointer border-t border-slate-100 ${
                        active ? "bg-blue-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-900">
                          {entry.model}
                        </div>
                        <div className="text-[9px] text-slate-500">
                          {entry.brand} · {entry.stationCount} station
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono font-semibold text-slate-700">
                        {entry.assetCount}
                      </td>
                      <td className="px-3 py-2 text-[10px] text-slate-600">
                        {entry.bayKinds.map(displayToken).join(", ")}
                      </td>
                      <td className="px-3 py-2 text-[10px] text-slate-600">
                        {entry.functions.slice(0, 3).map(displayToken).join(", ")}
                        {entry.functions.length > 3
                          ? ` +${entry.functions.length - 3}`
                          : ""}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[9px] font-semibold ${
                            modelManual
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-slate-200 bg-slate-50 text-slate-500"
                          }`}
                        >
                          {modelManual ? "linked" : "pending"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          {!selectedModel ? (
            <div className="grid min-h-52 place-items-center text-xs text-slate-500">
              Pilih model untuk melihat aset.
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {selectedModel.brand}
                  </div>
                  <h3 className="mt-1 text-lg font-semibold text-slate-950">
                    {selectedModel.model}
                  </h3>
                  <div className="mt-1 text-[10px] text-slate-500">
                    {selectedModel.assetCount} assets ·{" "}
                    {selectedModel.stationCount} stations ·{" "}
                    {selectedModel.technologies.join(", ") || "technology N/A"}
                  </div>
                </div>
                {parser && (
                  <span
                    title={parser.detail}
                    className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase ${
                      parser.status === "validated"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : parser.status === "candidate"
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    {parser.label}
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2">
                <CatalogFact
                  label="Bay coverage"
                  value={selectedModel.bayKinds.map(displayToken).join(", ")}
                />
                <CatalogFact
                  label="Observed function"
                  value={selectedModel.functions.map(displayToken).join(", ")}
                />
              </div>

              <div
                className={`mt-3 rounded-lg border p-3 ${
                  manual
                    ? "border-emerald-200 bg-emerald-50"
                    : "border-amber-200 bg-amber-50"
                }`}
              >
                {manual ? (
                  <>
                    <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                      Official manual candidate
                    </div>
                    <a
                      href={manual.url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-emerald-900 hover:underline"
                    >
                      {manual.title}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <div className="mt-1 text-[9px] text-emerald-800">
                      {manual.documentReference} · {manual.note}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-amber-700">
                      Manual pending
                    </div>
                    <div className="mt-1 text-[10px] text-amber-800">
                      Model sudah terinventarisasi, tetapi manual resmi belum
                      dikurasi. Firmware/order code harus dikumpulkan sebelum
                      memilih manual.
                    </div>
                  </>
                )}
              </div>

              <div className="mt-3 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-white">
                <table className="w-full min-w-[540px] text-left text-[10px]">
                  <thead className="sticky top-0 bg-slate-50 text-[9px] uppercase tracking-[0.1em] text-slate-500">
                    <tr>
                      <th className="px-2.5 py-2">Location / bay</th>
                      <th className="px-2.5 py-2">Serial</th>
                      <th className="px-2.5 py-2">Role</th>
                      <th className="px-2.5 py-2">DIgSILENT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedAssets.slice(0, 80).map((asset) => (
                      <tr
                        key={asset.assetId}
                        className="border-t border-slate-100"
                      >
                        <td className="px-2.5 py-2">
                          <div className="font-semibold text-slate-800">
                            {asset.stationRaw}
                          </div>
                          <div className="text-[9px] text-slate-500">
                            {asset.ultg} · {asset.bayRaw}
                          </div>
                        </td>
                        <td className="px-2.5 py-2 font-mono text-slate-600">
                          {asset.serial ?? "—"}
                        </td>
                        <td className="px-2.5 py-2 text-slate-600">
                          {asset.roles.join(", ")}
                        </td>
                        <td className="px-2.5 py-2">
                          <DigsilentBadge
                            status={asset.digsilentMatch.status}
                            confidence={asset.digsilentMatch.confidence}
                            reason={asset.digsilentMatch.reason}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="mt-3 text-[9px] leading-4 text-slate-500">
        “Observed function” berasal dari sheet tempat relay ditemukan, bukan
        klaim bahwa seluruh fungsi tersebut aktif. Manual berstatus candidate
        sampai firmware, order code, dan edition perangkat dikonfirmasi.
      </div>
    </Panel>
  );
}

function CatalogFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-[10px] leading-4 text-slate-700">{value}</div>
    </div>
  );
}

// Action-oriented tooltip per status — a raw "unmatched"/"candidate" label
// tells an engineer something is wrong but not what to do about it. The two
// non-matched statuses need different actions: "unmatched" means this GI has
// no entry at all in the DIgSILENT line database (commonly a site energized
// after the 2021 snapshot) — the fix is registering/uploading its topology,
// not fixing a name. "candidate" means the GI IS in the database but the
// name match is ambiguous (e.g. multiple parallel circuits/sites scoring
// equally) — the fix is a naming/alias review, not new data.
const DIGSILENT_STATUS_GUIDANCE: Record<string, string> = {
  matched:
    "Bay ini sudah ter-anchor otomatis ke database DIgSILENT (nama & sirkit cocok jelas).",
  candidate:
    "Nama GI ditemukan di database DIgSILENT tapi ada lebih dari satu kandidat yang cocok — perlu peninjauan manual sebelum bay ini bisa dipakai untuk audit/setting otomatis.",
  unmatched:
    "GI ini TIDAK ditemukan di database DIgSILENT sama sekali (kemungkinan site baru pasca snapshot terakhir). Perlu registrasi ulang / upload topologi baru untuk GI ini sebelum bay-nya bisa diproses otomatis.",
  "not-applicable":
    "Bay ini bukan bay penghantar (line) — pencocokan DIgSILENT tidak berlaku.",
};

function DigsilentBadge({
  status,
  confidence,
  reason,
}: {
  status: string;
  confidence: number;
  reason?: string;
}) {
  const style =
    status === "matched"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "candidate"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : status === "unmatched"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-slate-200 bg-slate-50 text-slate-500";
  const guidance = DIGSILENT_STATUS_GUIDANCE[status];
  const title = [guidance, reason].filter(Boolean).join(" — ");
  return (
    <span
      className={`rounded-full border px-1.5 py-0.5 text-[8px] font-bold uppercase ${style}`}
      title={title || undefined}
    >
      {status}
      {confidence > 0 ? ` ${Math.round(confidence * 100)}%` : ""}
    </span>
  );
}

function displayToken(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function ParameterRow({ parameter }: { parameter: VendorImportParameter }) {
  const review =
    parameter.decodeStatus === "review" || parameter.confidence === "review";
  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2 font-mono text-[10px] text-slate-500">
        {parameter.address ?? "—"}
      </td>
      <td className="px-3 py-2">
        <div className="font-medium text-slate-800">{parameter.rawName}</div>
        <div className="max-w-xs truncate font-mono text-[9px] text-slate-400">
          {parameter.functionGroup} · {parameter.rawValue}
        </div>
      </td>
      <td className="px-3 py-2 font-mono text-[10px] text-blue-700">
        {parameter.canonicalKey ?? "—"}
      </td>
      <td className="px-3 py-2 font-mono text-slate-700">
        {String(parameter.value)}{" "}
        <span className="text-slate-400">{parameter.unit}</span>
      </td>
      <td className="px-3 py-2">
        <span
          className={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase ${
            review
              ? "border-amber-200 bg-amber-50 text-amber-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          {review ? "review" : "mapped"}
        </span>
      </td>
    </tr>
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
        className={`grid h-7 w-7 place-items-center rounded-full text-xs font-bold ${
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

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-bold text-slate-900">
        {value}
      </div>
    </div>
  );
}

function ContractRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="border-l-2 border-blue-300 pl-3">
      <div className="font-semibold text-slate-800">{label}</div>
      <div className="mt-0.5 leading-4 text-slate-500">{children}</div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  icon,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  icon?: ReactNode;
}) {
  return (
    <label className="relative">
      {icon && (
        <span className="pointer-events-none absolute left-3 top-2.5 text-slate-400">
          {icon}
        </span>
      )}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full appearance-none rounded-lg border border-slate-300 py-2 pr-8 text-xs text-slate-700 outline-none focus:border-blue-500 ${
          icon ? "pl-9" : "pl-3"
        }`}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
    </label>
  );
}

function ManifestInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-[10px] text-slate-600">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-xs"
      />
    </label>
  );
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes.slice().buffer as ArrayBuffer
  );
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function progressLabel(progress: OcrProgress) {
  if (progress.phase === "loading") return "Memuat PDF engine…";
  if (progress.phase === "text-layer")
    return `Text layer ${progress.pageNumber ?? "?"}/${progress.pageCount ?? "?"}…`;
  if (progress.phase === "ocr-rendering")
    return `Menyiapkan OCR ${progress.pageNumber ?? "?"}/${progress.pageCount ?? "?"}…`;
  if (progress.phase === "ocr-recognizing")
    return `OCR ${Math.round((progress.pageProgress ?? 0) * 100)}%…`;
  return "Menyelesaikan normalisasi…";
}

function safeFileStem(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function downloadJson(payload: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
