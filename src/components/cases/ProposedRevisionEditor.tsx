import { AlertTriangle, CheckCircle2, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  proposedFieldDefinitionsForChangeItems,
} from "../../domain/case-proposed-revision";
import { useProsetStore } from "../../store/useProsetStore";
import type { SettingCase } from "../../domain/setting-case";

export function ProposedRevisionEditor({ settingCase }: { settingCase: SettingCase }) {
  const saveRevision = useProsetStore((state) => state.saveSettingCaseProposedRevision);
  const sourceIntakeRecords = useProsetStore((state) => state.sourceIntakeRecords);
  const baseline = settingCase.baseline;
  const revisions = settingCase.proposedDataRevisions ?? [];
  const latest = revisions[revisions.length - 1];
  const definitions = useMemo(
    () =>
      proposedFieldDefinitionsForChangeItems(
        settingCase.changeItems,
        settingCase.primaryReason
      ),
    [settingCase.changeItems, settingCase.primaryReason]
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (latest?.fieldChanges ?? []).map((item) => [
        item.fieldKey,
        String(item.proposedValue),
      ])
    )
  );
  const [targetEntityId, setTargetEntityId] = useState(
    latest?.targetEntityId ??
      settingCase.protectedScope.subjectLineId ??
      settingCase.protectedScope.subjectBayId ??
      ""
  );
  const [targetLabel, setTargetLabel] = useState(
    latest?.targetLabel ?? settingCase.protectedScope.subjectLabel ?? ""
  );
  const [assumptions, setAssumptions] = useState(latest?.assumptions ?? "");
  const [sourceEvidenceIds, setSourceEvidenceIds] = useState<string[]>(
    latest?.sourceEvidenceIds
      ? [...latest.sourceEvidenceIds]
      : [...settingCase.links.sourceIntakeIds]
  );
  const linkedEvidence = useMemo(
    () =>
      settingCase.links.sourceIntakeIds.map((sourceId) => {
        const record = sourceIntakeRecords.find((item) => item.id === sourceId);
        const baselineEvidence = baseline?.evidence.find(
          (item) => item.sourceIntakeId === sourceId
        );
        return {
          id: sourceId,
          fileName: record?.fileName ?? baselineEvidence?.fileName ?? sourceId,
          frozen: Boolean(baselineEvidence),
        };
      }),
    [baseline, settingCase.links.sourceIntakeIds, sourceIntakeRecords]
  );
  const linkedEvidenceKey = settingCase.links.sourceIntakeIds.join("|");

  // Returning from Source Index should immediately expose newly linked change
  // evidence without discarding checkbox choices already made in this draft.
  useEffect(() => {
    setSourceEvidenceIds((current) => [
      ...current,
      ...settingCase.links.sourceIntakeIds.filter((id) => !current.includes(id)),
    ]);
    // linkedEvidenceKey represents the immutable list values, not its array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedEvidenceKey]);

  if (!baseline) return null;

  const save = () => {
    saveRevision(settingCase.id, {
      targetEntityId,
      targetLabel,
      sourceEvidenceIds,
      values,
      assumptions,
    });
  };

  return (
    <section className="mt-4 rounded-lg border border-line bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-2">
            Proposed Data Revision
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-3">
            Kinds:{" "}
            <span className="font-mono font-semibold text-ink">
              {(latest?.kinds ?? []).join(", ") || "diturunkan dari change items"}
            </span>
            . Setiap simpan membuat versi immutable baru; data aktif tidak diubah.
          </p>
        </div>
        {latest && (
          <span
            className={`rounded border px-2 py-1 font-mono text-[10px] font-bold uppercase ${
              latest.status === "ready_for_impact"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-amber-300 bg-amber-50 text-amber-700"
            }`}
          >
            v{latest.version} · {latest.status.replace(/_/g, " ")}
          </span>
        )}
      </div>

      {latest && latest.validation.errors.length > 0 && (
        <div className="mt-3 space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3">
          {latest.validation.errors.map((error) => (
            <div key={error} className="flex items-start gap-2 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          ))}
        </div>
      )}
      {latest?.validation.valid && (
        <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          <CheckCircle2 className="h-4 w-4" />
          Lengkap secara struktur dan siap masuk impact analysis. Validasi engineering
          dilakukan pada stage berikutnya.
        </div>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs font-medium text-slate-600">Target entity ID</label>
          <input
            value={targetEntityId}
            onChange={(event) => setTargetEntityId(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-slate-600">Target label</label>
          <input
            value={targetLabel}
            onChange={(event) => setTargetLabel(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        {definitions.map((definition) => {
          const before = latest?.fieldChanges.find(
            (item) => item.fieldKey === definition.key
          )?.beforeValue;
          return (
            <div key={definition.key}>
              <label className="text-xs font-medium text-slate-600">
                {definition.label}
                {definition.required ? " *" : ""}
              </label>
              <div className="mt-1 flex">
                <input
                  type={definition.valueType === "number" ? "number" : "text"}
                  step={definition.valueType === "number" ? "any" : undefined}
                  value={values[definition.key] ?? ""}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      [definition.key]: event.target.value,
                    }))
                  }
                  className="min-w-0 flex-1 rounded-l-md border border-slate-300 px-3 py-2 text-sm"
                />
                {definition.unit && (
                  <span className="grid min-w-14 place-items-center rounded-r-md border border-l-0 border-slate-300 bg-slate-50 px-2 text-xs text-slate-500">
                    {definition.unit}
                  </span>
                )}
              </div>
              {before !== undefined && (
                <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                  baseline: {before} {definition.unit}
                </div>
              )}
            </div>
          );
        })}
        <div className="sm:col-span-2">
          <label className="text-xs font-medium text-slate-600">
            Asumsi / batasan
          </label>
          <textarea
            rows={2}
            value={assumptions}
            onChange={(event) => setAssumptions(event.target.value)}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="mt-4">
        <div className="text-xs font-medium text-slate-600">
          Evidence perubahan yang ditautkan ke case
        </div>
        <p className="mt-1 text-[11px] leading-4 text-slate-500">
          Evidence boleh ditambahkan setelah baseline dibekukan. Dokumen baru mendukung
          usulan perubahan dan tidak mengubah snapshot baseline.
        </p>
        {linkedEvidence.length === 0 ? (
          <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Belum ada evidence perubahan. Buka <span className="font-semibold">Dokumen Perubahan</span>,
            stage minimal satu source, lalu kembali ke case ini.
          </div>
        ) : (
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          {linkedEvidence.map((evidence) => {
            const checked = sourceEvidenceIds.includes(evidence.id);
            return (
              <label
                key={evidence.id}
                className="flex items-center gap-2 rounded-md border border-slate-200 px-2.5 py-2 text-xs"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() =>
                    setSourceEvidenceIds((current) =>
                      checked
                        ? current.filter((id) => id !== evidence.id)
                        : [...current, evidence.id]
                    )
                  }
                />
                <span className="min-w-0 flex-1 truncate">{evidence.fileName}</span>
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${
                    evidence.frozen
                      ? "border-slate-300 bg-slate-100 text-slate-600"
                      : "border-blue-200 bg-blue-50 text-blue-700"
                  }`}
                >
                  {evidence.frozen ? "baseline" : "change"}
                </span>
              </label>
            );
          })}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-3">
        <span className="text-[11px] text-slate-500">
          Save tetap diperbolehkan saat belum lengkap agar draft dan kekurangannya
          tercatat.
        </span>
        <button
          type="button"
          onClick={save}
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          <Save className="h-3.5 w-3.5" /> Simpan versi baru
        </button>
      </div>

      {revisions.length > 0 && (
        <div className="mt-4 border-t border-line pt-3">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
            Revision history
          </div>
          <div className="mt-2 space-y-1.5">
            {[...revisions].reverse().map((revision) => (
              <div
                key={revision.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-[11px]"
              >
                <span className="font-mono font-bold text-slate-800">
                  v{revision.version}
                </span>
                <span
                  className={
                    revision.status === "ready_for_impact"
                      ? "text-emerald-700"
                      : "text-amber-700"
                  }
                >
                  {revision.status.replace(/_/g, " ")}
                </span>
                <span className="text-slate-500">
                  {revision.fieldChanges.length} field change
                </span>
                <span className="ml-auto font-mono text-slate-400">
                  {revision.fingerprint.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
