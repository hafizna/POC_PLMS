import { useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Fingerprint,
  GitBranch,
  LockKeyhole,
} from "lucide-react";
import { useProsetStore } from "../../store/useProsetStore";
import {
  buildCaseStudyPackageBinding,
  deriveStudyRequirementProfile,
} from "../../domain/case-study-package";
import type { SettingCase } from "../../domain/setting-case";

export function StudyBindingPanel({ settingCase }: { settingCase: SettingCase }) {
  const scenarios = useProsetStore((state) => state.studyScenarios);
  const snapshots = useProsetStore((state) => state.sourceSnapshots);
  const persona = useProsetStore((state) => state.currentPersona);
  const savePackage = useProsetStore(
    (state) => state.saveSettingCaseStudyPackageBinding
  );
  const [scenarioIds, setScenarioIds] = useState<string[]>([]);

  const impacts = settingCase.impactAssessments ?? [];
  const latestImpact = impacts[impacts.length - 1];
  const revisions = settingCase.proposedDataRevisions ?? [];
  const proposedRevision =
    revisions.find((item) => item.id === latestImpact?.proposedRevisionId) ??
    revisions[revisions.length - 1];
  const packages = settingCase.studyPackageBindings ?? [];
  const latestPackage = packages[packages.length - 1];
  const requirement = latestImpact
    ? deriveStudyRequirementProfile(settingCase, latestImpact)
    : null;

  const preview = useMemo(() => {
    if (!latestImpact) return null;
    return buildCaseStudyPackageBinding({
      settingCase,
      impactAssessment: latestImpact,
      proposedRevision,
      scenarioIds,
      scenarios,
      snapshots,
      version: packages.length + 1,
      id: "preview_package",
      boundAt: settingCase.updatedAt,
      boundBy: persona,
    });
  }, [
    latestImpact,
    packages.length,
    persona,
    proposedRevision,
    scenarioIds,
    scenarios,
    settingCase,
    snapshots,
  ]);

  const toggleScenario = (id: string) => {
    setScenarioIds((selected) =>
      selected.includes(id)
        ? selected.filter((item) => item !== id)
        : [...selected, id]
    );
  };

  return (
    <section className="mt-4 overflow-hidden rounded-lg border border-line bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-panel px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-blue-700" />
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-ink">
              Study Scenario Package
            </p>
          </div>
          <p className="mt-1 text-xs text-ink-3">
            Kondisi wajib diturunkan dari case dan fungsi terdampak; bukan daftar
            scenario universal untuk semua pekerjaan.
          </p>
        </div>
        {latestPackage && (
          <span
            className={`rounded border px-2 py-1 font-mono text-[10px] font-bold uppercase ${
              latestPackage.status === "compatible"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            latest v{latestPackage.version} · {latestPackage.status}
          </span>
        )}
      </div>

      {requirement && (
        <div className="border-b border-line bg-slate-50 px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Requirement
              label="Basis"
              value={requirement.basis.replace(/_/g, " ")}
            />
            <Requirement
              label="Kondisi wajib"
              value={requirement.requiredConditions.join(", ") || "tidak ada"}
            />
            <Requirement
              label="Direkomendasikan"
              value={requirement.recommendedConditions.join(", ") || "—"}
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-600">
            {requirement.excludesWorkOutageCondition
              ? "Kondisi padam selama pekerjaan tidak termasuk karena case ini untuk setting permanen post-commission."
              : "Package memakai temporary emergency topology dan mewajibkan restoration."}
          </p>
        </div>
      )}

      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            Pilih scenario per kondisi
          </p>
          <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
            {scenarios.length === 0 && (
              <div className="rounded border border-dashed border-line p-4 text-xs text-ink-4">
                Belum ada scenario pada registry.
              </div>
            )}
            {scenarios.map((scenario) => {
              const checked = scenarioIds.includes(scenario.id);
              return (
                <label
                  key={scenario.id}
                  className={`flex cursor-pointer items-start gap-2 rounded border p-2.5 ${
                    checked
                      ? "border-blue-400 bg-blue-50"
                      : "border-line bg-white"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleScenario(scenario.id)}
                    className="mt-0.5 h-4 w-4"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-ink">
                      {scenario.name}
                    </div>
                    <div className="mt-0.5 font-mono text-[9.5px] text-ink-4">
                      {scenario.condition} · {scenario.status} ·{" "}
                      {scenario.networkRevisionId}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
          <button
            type="button"
            disabled={scenarioIds.length === 0 || !preview}
            onClick={() => savePackage(settingCase.id, scenarioIds)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            <LockKeyhole className="h-3.5 w-3.5" />
            Simpan evaluasi package
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-ink-4">
            Package blocked tetap append-only. Hanya package terbaru yang lengkap
            dan compatible membuka Targeted Recalculation.
          </p>
        </div>

        <div>
          {preview && (
            <>
              <div
                className={`flex items-center gap-2 rounded-md border px-3 py-2.5 ${
                  preview.status === "compatible"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-red-200 bg-red-50 text-red-800"
                }`}
              >
                {preview.status === "compatible" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}
                <span className="text-xs font-semibold">
                  {preview.status === "compatible"
                    ? `${preview.scenarioBindings.length} scenario compatible`
                    : `${preview.issues.length} package issue`}
                </span>
              </div>
              <div className="mt-2 space-y-1.5">
                {preview.issues.map((issue, index) => (
                  <div
                    key={`${issue.code}_${index}`}
                    className="flex items-start gap-2 border-l-2 border-red-500 bg-red-50 px-3 py-2 text-xs text-red-800"
                  >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>
                      <div>{issue.message}</div>
                      <div className="mt-0.5 font-mono text-[9px] uppercase text-red-500">
                        {issue.code}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {packages.length > 0 && (
        <div className="border-t border-line px-4 py-3">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-3">
            Append-only package history
          </p>
          <div className="mt-2 space-y-1.5">
            {[...packages].reverse().map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded border border-line bg-[#f7f9fc] px-3 py-2 text-[11px]"
              >
                <span className="font-mono font-bold">v{item.version}</span>
                <span className="font-medium text-ink">
                  {item.scenarioBindings
                    .map((entry) => entry.scenario.condition)
                    .join(" + ") || "empty"}
                </span>
                <span
                  className={
                    item.status === "compatible"
                      ? "text-emerald-700"
                      : "text-red-700"
                  }
                >
                  {item.status}
                </span>
                <span className="ml-auto inline-flex items-center gap-1 font-mono text-[9.5px] text-ink-4">
                  <Fingerprint className="h-3 w-3" />
                  {item.fingerprint.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function Requirement({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-4">
        {label}
      </div>
      <div className="mt-0.5 text-xs font-semibold text-ink">{value}</div>
    </div>
  );
}
