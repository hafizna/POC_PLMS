import {
  AlertTriangle,
  CheckCircle2,
  GitBranch,
  RadioTower,
  Save,
  ShieldAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  buildCaseImpactAssessment,
  type StudyDisposition,
} from "../../domain/case-impact-readiness";
import type { SettingCase } from "../../domain/setting-case";
import { useProsetStore } from "../../store/useProsetStore";

const STUDY_LABEL: Record<StudyDisposition, string> = {
  new_study_required: "Study baru wajib",
  approved_scenario_reuse_candidate: "Kandidat reuse scenario approved",
  not_required: "Study tidak diperlukan",
  engineering_decision_required: "Perlu keputusan engineering",
};

export function ImpactReadinessPanel({ settingCase }: { settingCase: SettingCase }) {
  const saveAssessment = useProsetStore(
    (state) => state.saveSettingCaseImpactAssessment
  );
  const baseline = settingCase.baseline;
  const revisions = settingCase.proposedDataRevisions ?? [];
  const latestRevision = revisions[revisions.length - 1];
  const assessments = settingCase.impactAssessments ?? [];
  const latestAssessment = assessments[assessments.length - 1];
  const [confirmed, setConfirmed] = useState(
    latestAssessment?.confirmation.confirmed ?? false
  );
  const [confirmationNote, setConfirmationNote] = useState(
    latestAssessment?.confirmation.note ?? ""
  );
  const [studyDisposition, setStudyDisposition] = useState<
    StudyDisposition | ""
  >(latestAssessment?.study.selectedDisposition ?? "");

  const preview = useMemo(() => {
    if (!baseline) return null;
    return buildCaseImpactAssessment({
      settingCase,
      baseline,
      proposedRevision: latestRevision,
      assessmentInput: {
        confirmed,
        confirmationNote,
        selectedStudyDisposition: studyDisposition || undefined,
      },
      version: assessments.length + 1,
      id: "preview",
      evaluatedAt: "preview",
      evaluatedBy: "preview",
    });
  }, [
    assessments.length,
    baseline,
    confirmationNote,
    confirmed,
    latestRevision,
    settingCase,
    studyDisposition,
  ]);

  if (!baseline || !preview) return null;

  const blockers = preview.issues.filter((item) => item.severity === "blocker");
  const warnings = preview.issues.filter((item) => item.severity === "warning");
  const hardStudyRule =
    preview.study.suggestedDisposition === "new_study_required";

  const save = () => {
    saveAssessment(settingCase.id, {
      confirmed,
      confirmationNote,
      selectedStudyDisposition: studyDisposition || undefined,
    });
  };

  return (
    <section className="mt-4 rounded-lg border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-2">
            Impact & Data Readiness
          </p>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-ink-3">
            Dependency matrix v1 menurunkan endpoint, fungsi proteksi, kebutuhan study,
            dan blocker dari baseline serta proposed revision. Hasilnya belum merupakan
            approval engineering.
          </p>
        </div>
        {latestAssessment && (
          <span
            className={`rounded border px-2 py-1 font-mono text-[10px] font-bold uppercase ${
              latestAssessment.status === "blocked"
                ? "border-red-200 bg-red-50 text-red-700"
                : latestAssessment.status === "draft_confirmation"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            v{latestAssessment.version} · {latestAssessment.status.replace(/_/g, " ")}
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-brand-accent-dark" />
            <h3 className="text-sm font-semibold text-ink">
              Affected endpoints ({preview.endpoints.length})
            </h3>
          </div>
          <div className="mt-2 overflow-hidden rounded-md border border-line">
            {preview.endpoints.length === 0 ? (
              <div className="p-3 text-xs text-slate-500">
                Endpoint belum dapat diturunkan.
              </div>
            ) : (
              preview.endpoints.map((endpoint) => (
                <div
                  key={endpoint.bayId}
                  className="grid gap-1 border-b border-line-2 px-3 py-2.5 text-xs last:border-b-0 sm:grid-cols-[90px_1fr_1fr]"
                >
                  <span className="font-mono font-bold uppercase text-brand-accent-dark">
                    {endpoint.role}
                  </span>
                  <div>
                    <div className="font-semibold text-ink">
                      {endpoint.substationLabel} · {endpoint.bayLabel}
                    </div>
                    <div className="text-slate-500">
                      {endpoint.relayLabel ?? "relay belum terpetakan"}
                    </div>
                  </div>
                  <div className="text-slate-500">
                    <div>{endpoint.ownerUnit ?? "owner belum ditetapkan"}</div>
                    <div className="font-mono text-[10px]">
                      {endpoint.requiredAction.replace(/_/g, " ")}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <RadioTower className="h-4 w-4 text-violet-600" />
            <h3 className="text-sm font-semibold text-ink">
              Fungsi terdampak ({preview.protectionFunctions.length})
            </h3>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {preview.protectionFunctions.map((item) => (
              <span
                key={item.function}
                className={`rounded-full border px-2.5 py-1 font-mono text-[10px] ${
                  item.source === "installed"
                    ? "border-violet-200 bg-violet-50 text-violet-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
                title={`${item.source}: ${item.reasons.join(", ")}`}
              >
                {item.function} · {item.source}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className="rounded-md border border-brand-accent/40 bg-brand-accent/10 p-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-brand-accent-dark">
              <ShieldAlert className="h-4 w-4" /> Study disposition
            </div>
            <div className="mt-1 text-xs text-brand-accent-dark">
              Saran sistem: {STUDY_LABEL[preview.study.suggestedDisposition]}
            </div>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-[11px] text-brand-accent-dark">
              {preview.study.rationale.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <select
              value={
                hardStudyRule ? "new_study_required" : studyDisposition
              }
              disabled={hardStudyRule}
              onChange={(event) =>
                setStudyDisposition(event.target.value as StudyDisposition | "")
              }
              className="mt-3 w-full rounded-md border border-brand-accent/40 bg-white px-2.5 py-2 text-xs disabled:bg-brand-accent/20"
            >
              <option value="">— pilih keputusan study —</option>
              <option value="new_study_required">Study baru wajib</option>
              <option value="approved_scenario_reuse_candidate">
                Kandidat reuse scenario approved
              </option>
              <option value="not_required">Study tidak diperlukan</option>
            </select>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <ReadinessCount label="Blocker" value={blockers.length} tone="red" />
            <ReadinessCount label="Warning" value={warnings.length} tone="amber" />
          </div>
        </div>
      </div>

      {(blockers.length > 0 || warnings.length > 0) && (
        <div className="mt-4 space-y-1.5">
          {[...blockers, ...warnings].map((issue) => (
            <div
              key={issue.id}
              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
                issue.severity === "blocker"
                  ? "border-red-200 bg-red-50 text-red-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <div>{issue.message}</div>
                {issue.resolutionHint && (
                  <div className="mt-0.5 text-[11px] opacity-80">
                    {issue.resolutionHint}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
        <label className="flex items-start gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            className="mt-0.5"
          />
          Saya mengonfirmasi endpoint dan fungsi di atas sebagai scope impact awal.
          Konfirmasi ini tidak menghapus blocker data.
        </label>
        <textarea
          rows={2}
          value={confirmationNote}
          onChange={(event) => setConfirmationNote(event.target.value)}
          placeholder="Catatan konfirmasi / koreksi scope"
          className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs"
        />
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
        <div className="flex items-center gap-2 text-xs">
          {preview.status === "ready_for_study" ||
          preview.status === "ready_without_study" ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-amber-600" />
          )}
          Preview status:{" "}
          <span className="font-mono font-bold">
            {preview.status.replace(/_/g, " ")}
          </span>
        </div>
        <button
          type="button"
          onClick={save}
          className="inline-flex items-center gap-1.5 rounded-md bg-brand-ink px-3.5 py-2 text-xs font-semibold text-white hover:bg-black"
        >
          <Save className="h-3.5 w-3.5" /> Simpan assessment
        </button>
      </div>

      {assessments.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
            Assessment history
          </div>
          <div className="mt-2 space-y-1.5">
            {[...assessments].reverse().map((assessment) => (
              <div
                key={assessment.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px]"
              >
                <span className="font-mono font-bold">v{assessment.version}</span>
                <span>{assessment.status.replace(/_/g, " ")}</span>
                <span>{assessment.endpoints.length} endpoint</span>
                <span>
                  {
                    assessment.issues.filter((item) => item.severity === "blocker")
                      .length
                  }{" "}
                  blocker
                </span>
                <span className="ml-auto font-mono text-slate-400">
                  {assessment.fingerprint.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ReadinessCount({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "red" | "amber";
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        tone === "red"
          ? "border-red-200 bg-red-50"
          : "border-amber-200 bg-amber-50"
      }`}
    >
      <div
        className={`font-mono text-xl font-bold ${
          tone === "red" ? "text-red-700" : "text-amber-700"
        }`}
      >
        {value}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-slate-500">
        {label}
      </div>
    </div>
  );
}
