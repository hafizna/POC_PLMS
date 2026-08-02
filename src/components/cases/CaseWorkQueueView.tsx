import { useMemo, useState } from "react";
import { Calculator, GitCompareArrows, Plus } from "lucide-react";
import { useProsetStore } from "../../store/useProsetStore";
import {
  CASE_TYPE_LABEL,
  isOpenCase,
  PROCESS_CODE,
  type SettingCase,
  type SettingCaseType,
} from "../../domain/setting-case";
import { SettingCaseWizard } from "./SettingCaseWizard";
import { SettingCaseDetail, StatusBadge } from "./SettingCaseDetail";

type QueueFilter = "open" | "closed" | "all";

export function CaseWorkQueueView() {
  const settingCases = useProsetStore((s) => s.settingCases);
  const activeSettingCaseId = useProsetStore((s) => s.activeSettingCaseId);
  const setActiveSettingCase = useProsetStore((s) => s.setActiveSettingCase);
  const caseWizardRequest = useProsetStore((s) => s.caseWizardRequest);
  const clearCaseWizardRequest = useProsetStore((s) => s.clearCaseWizardRequest);

  const [filter, setFilter] = useState<QueueFilter>("open");
  const [detailOpen, setDetailOpen] = useState(false);
  const [localWizardType, setLocalWizardType] = useState<SettingCaseType | null>(null);

  const wizardType = caseWizardRequest?.caseType ?? localWizardType;
  const activeCase = settingCases.find((item) => item.id === activeSettingCaseId);

  const filtered = useMemo(() => {
    if (filter === "all") return settingCases;
    if (filter === "open") return settingCases.filter(isOpenCase);
    return settingCases.filter((item) => !isOpenCase(item));
  }, [filter, settingCases]);

  const openCount = settingCases.filter(isOpenCase).length;
  const baselineCount = settingCases.filter((item) => Boolean(item.baseline)).length;
  const proposalReadyCount = settingCases.filter((item) => {
    const revisions = item.proposedDataRevisions ?? [];
    return revisions[revisions.length - 1]?.status === "ready_for_impact";
  }).length;
  const impactCount = settingCases.filter(
    (item) => (item.impactAssessments ?? []).length > 0
  ).length;
  const compatibleStudyCount = settingCases.filter((item) => {
    const bindings = item.studyPackageBindings ?? [];
    return bindings[bindings.length - 1]?.status === "compatible";
  }).length;

  const closeWizard = () => {
    clearCaseWizardRequest();
    setLocalWizardType(null);
  };

  const handleCaseCreated = (caseId: string) => {
    setActiveSettingCase(caseId);
    setDetailOpen(true);
  };

  const openDetail = (settingCase: SettingCase) => {
    setActiveSettingCase(settingCase.id);
    setDetailOpen(true);
  };

  if (detailOpen && activeCase) {
    return (
      <>
        <SettingCaseDetail settingCase={activeCase} onBack={() => setDetailOpen(false)} />
        {wizardType && (
          <SettingCaseWizard
            initialCaseType={wizardType}
            preset={caseWizardRequest?.preset}
            onClose={closeWizard}
            onCreated={handleCaseCreated}
          />
        )}
      </>
    );
  }

  return (
    <div>
      {/* masthead */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className="font-mono text-xs font-bold tracking-[0.06em] text-amber-600">
          MY WORK
        </span>
        <h1 className="font-display text-[34px] font-bold leading-tight tracking-[-0.015em] text-ink">
          Setting Cases
        </h1>
        <span className="ml-auto font-mono text-[12.5px] text-ink-3">
          antrian kerja · lifecycle setting proteksi
        </span>
      </div>
      <div className="mb-5 mt-3 h-[2.5px] bg-ink" />

      <p className="mb-6 max-w-4xl text-[15px] leading-[1.62] text-ink-2">
        Sprint 4.1 menjalankan <b className="font-semibold text-ink">flow authority,
        evidence mode, activation contract, serta Study Scenario Package</b>. Kondisi
        study diturunkan per case; approval tidak mengaktifkan data sebelum commissioning.
        E1 memfokuskan gerbang <b className="font-semibold text-ink">Targeted Recalculation</b>:
        hanya blok Distance/LCD terdampak yang dihitung ulang dari issued baseline.
      </p>

      {/* primary actions + KPI */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setLocalWizardType("new_setting")}
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-[13px] font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          <Calculator className="h-4 w-4" /> Targeted Recalculation
        </button>
        <button
          type="button"
          onClick={() => setLocalWizardType("crosscheck")}
          className="inline-flex items-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-[13px] font-semibold text-ink-2 hover:border-blue-300 hover:text-blue-700"
        >
          <GitCompareArrows className="h-4 w-4" /> Crosscheck Actual Setting
        </button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Kpi lead value={openCount} label="Case terbuka" />
        <Kpi value={baselineCount} label="Baseline beku" />
        <Kpi value={proposalReadyCount} label="Proposal structurally ready" />
        <Kpi value={impactCount} label="Impact assessed" />
        <Kpi value={compatibleStudyCount} label="Study compatible" />
      </div>

      {/* queue */}
      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <div className="flex items-center justify-between border-b border-line bg-panel px-4 py-2.5">
          <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-2">
            Antrian Kerja
          </span>
          <div className="flex items-center gap-1">
            {(["open", "closed", "all"] as QueueFilter[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={`rounded px-2.5 py-1 font-mono text-[11px] ${
                  filter === option
                    ? "bg-ink font-bold text-white"
                    : "text-ink-3 hover:bg-line-2"
                }`}
              >
                {option === "open" ? "TERBUKA" : option === "closed" ? "SELESAI" : "SEMUA"}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="px-4 py-14 text-center">
            <p className="text-sm text-ink-3">
              {settingCases.length === 0
                ? "Belum ada Setting Case. Mulai dari intent bisnis, bukan layar formula:"
                : "Tidak ada case pada filter ini."}
            </p>
            {settingCases.length === 0 && (
              <button
                type="button"
                onClick={() => setLocalWizardType("new_setting")}
                className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white"
              >
                <Plus className="h-3.5 w-3.5" /> Buat case pertama
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr>
                  <Th className="w-14 pl-4">Proses</Th>
                  <Th>Case</Th>
                  <Th className="hidden md:table-cell">Subject</Th>
                  <Th className="w-40">Stage</Th>
                  <Th className="w-36 pr-4 text-right">Diperbarui</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => openDetail(item)}
                    className="cursor-pointer border-b border-line-2 last:border-b-0 hover:bg-[#f5f8fd]"
                  >
                    <td className="py-2.5 pl-4">
                      <span className="rounded bg-ink px-1.5 py-0.5 font-mono text-[10px] font-bold text-white">
                        {PROCESS_CODE[item.caseType]}
                      </span>
                    </td>
                    <td className="max-w-0 py-2.5 pr-3" style={{ width: "38%" }}>
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-ink">{item.title}</span>
                        {item.urgency !== "normal" && (
                          <span className="shrink-0 font-mono text-[10px] font-bold uppercase text-red-600">
                            {item.urgency}
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[11px] text-ink-3">
                        {CASE_TYPE_LABEL[item.caseType]}
                      </div>
                    </td>
                    <td className="hidden max-w-0 truncate py-2.5 pr-3 font-mono text-[11.5px] text-ink-2 md:table-cell">
                      {item.protectedScope.subjectLabel ?? "—"}
                    </td>
                    <td className="py-2.5 pr-3">
                      <StatusBadge stage={item.stage} />
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono text-[11px] tabular-nums text-ink-3">
                      {new Date(item.updatedAt).toLocaleString("id-ID", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="mt-4 border-t border-line pt-3 text-[12.5px] leading-[1.65] text-ink-2">
        <b className="text-ink">Boundary E1.</b> Routing P1–P5 membedakan
        document audit/readback, permanent/temporary, serta commissioning activation.
        Targeted Recalculation bersifat case-gated; live run belum dapat dibuat sampai
        data readiness dan adapter eksekusi 2B.4 tersedia.
        Coordination, approval execution, issuance, dan verification belum diklaim selesai.
      </p>

      {wizardType && (
        <SettingCaseWizard
          initialCaseType={wizardType}
          preset={caseWizardRequest?.preset}
          onClose={closeWizard}
          onCreated={handleCaseCreated}
        />
      )}
    </div>
  );
}

function Kpi({
  value,
  label,
  lead = false,
  tone,
}: {
  value: number;
  label: string;
  lead?: boolean;
  tone?: "gold";
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        lead ? "border-[#b9d0fa] bg-[#eaf1fe]" : "border-line bg-white"
      }`}
    >
      <div
        className={`font-mono text-[23px] font-bold leading-none tracking-[-0.02em] tabular-nums ${
          tone === "gold" ? "text-amber-600" : lead ? "text-blue-600" : "text-ink"
        }`}
      >
        {value}
      </div>
      <div className="mt-1.5 font-mono text-[10px] uppercase leading-[1.35] tracking-[0.08em] text-ink-3">
        {label}
      </div>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`border-b border-line pb-2 pt-2.5 pr-3 text-left font-mono text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-3 ${className}`}
    >
      {children}
    </th>
  );
}
