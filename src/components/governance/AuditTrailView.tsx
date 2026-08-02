import { RotateCcw, ShieldCheck } from "lucide-react";
import { useProsetStore, type AuditEvent } from "../../store/useProsetStore";

const actionClass: Record<AuditEvent["action"], string> = {
  source_intake_add: "bg-cyan-50 text-cyan-700 border-cyan-200",
  source_intake_remove: "bg-slate-50 text-slate-600 border-slate-200",
  candidate_decision: "bg-blue-50 text-blue-700 border-blue-200",
  candidate_reset: "bg-slate-50 text-slate-600 border-slate-200",
  study_created: "bg-emerald-50 text-emerald-700 border-emerald-200",
  study_deleted: "bg-red-50 text-red-700 border-red-200",
  study_selected: "bg-indigo-50 text-indigo-700 border-indigo-200",
  study_scope_revised: "bg-amber-50 text-amber-700 border-amber-200",
  study_scenario_selected: "bg-blue-50 text-blue-700 border-blue-200",
  engineering_change_set_created: "bg-violet-50 text-violet-700 border-violet-200",
  line_selected: "bg-indigo-50 text-indigo-700 border-indigo-200",
  zone_updated: "bg-amber-50 text-amber-700 border-amber-200",
  relay_reset: "bg-slate-50 text-slate-600 border-slate-200",
  reset_edits: "bg-red-50 text-red-700 border-red-200",
  network_graph_add: "bg-emerald-50 text-emerald-700 border-emerald-200",
  network_graph_remove: "bg-orange-50 text-orange-700 border-orange-200",
  network_graph_reset: "bg-red-50 text-red-700 border-red-200",
  ct_vt_update: "bg-cyan-50 text-cyan-700 border-cyan-200",
  ct_vt_clear: "bg-slate-50 text-slate-600 border-slate-200",
  pdf_tap_promote: "bg-violet-50 text-violet-700 border-violet-200",
  pdf_tap_unpromote: "bg-slate-50 text-slate-600 border-slate-200",
  calculation_snapshot_add: "bg-emerald-50 text-emerald-700 border-emerald-200",
  calculation_snapshot_remove: "bg-slate-50 text-slate-600 border-slate-200",
  targeted_calculation_run_created:
    "bg-emerald-50 text-emerald-700 border-emerald-200",
  coordination_check_add: "bg-emerald-50 text-emerald-700 border-emerald-200",
  coordination_check_remove: "bg-slate-50 text-slate-600 border-slate-200",
  reference_verification_staged: "bg-indigo-50 text-indigo-700 border-indigo-200",
  vendor_import_staged: "bg-blue-50 text-blue-700 border-blue-200",
  verification_run_saved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  setting_case_created: "bg-emerald-50 text-emerald-700 border-emerald-200",
  setting_case_baseline_frozen: "bg-indigo-50 text-indigo-700 border-indigo-200",
  setting_case_proposed_revision_saved: "bg-cyan-50 text-cyan-700 border-cyan-200",
  setting_case_impact_assessed: "bg-orange-50 text-orange-700 border-orange-200",
  setting_case_study_bound: "bg-cyan-50 text-cyan-700 border-cyan-200",
  setting_case_study_package_bound:
    "bg-teal-50 text-teal-700 border-teal-200",
  setting_case_stage_changed: "bg-violet-50 text-violet-700 border-violet-200",
  setting_case_updated: "bg-amber-50 text-amber-700 border-amber-200",
  setting_case_linked: "bg-cyan-50 text-cyan-700 border-cyan-200",
};

export function AuditTrailView() {
  const events = useProsetStore((s) => s.auditEvents);
  const clearAuditEvents = useProsetStore((s) => s.clearAuditEvents);

  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-blue-50 border border-blue-200 p-2">
              <ShieldCheck className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Audit Trail</h2>
              <p className="text-xs text-slate-500 mt-0.5 max-w-3xl">
                Local governance log untuk keputusan workflow penting. Ini masih frontend-only, tetapi menjadi blueprint audit trail backend PLMS.
              </p>
            </div>
          </div>
          {events.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (confirm("Clear local audit trail?")) clearAuditEvents();
              }}
              className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear local log
            </button>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <SummaryTile label="Total events" value={events.length} />
          <SummaryTile label="Candidate decisions" value={events.filter((e) => e.action === "candidate_decision").length} />
          <SummaryTile label="Network Graph changes" value={events.filter((e) => e.action.startsWith("network_graph")).length} />
          <SummaryTile label="Zone edits" value={events.filter((e) => e.action === "zone_updated").length} />
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-2 bg-slate-50 flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">Event Log</h3>
          <span className="text-[10px] text-slate-500">latest 250 local events</span>
        </div>
        {events.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-500">
            Belum ada audit event. Approve mapping, quick-add relation, edit zone, atau select line untuk mulai mengisi log.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {events.map((event) => (
              <div key={event.id} className="px-4 py-3 grid grid-cols-1 lg:grid-cols-[180px_180px_1fr] gap-3">
                <div>
                  <div className="text-xs font-semibold text-slate-800">{formatDateTime(event.at)}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5">{event.actor}</div>
                </div>
                <div>
                  <span className={`inline-flex text-[10px] uppercase tracking-wider border rounded px-2 py-0.5 ${actionClass[event.action]}`}>
                    {event.action.replace(/_/g, " ")}
                  </span>
                  {event.scope && <div className="text-[10px] text-slate-400 mt-1 font-mono">{event.scope}</div>}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900">{event.summary}</div>
                  <div className="text-xs text-slate-500 mt-0.5 break-words">
                    {event.targetId && <span className="font-mono">{event.targetId}</span>}
                    {event.targetId && event.detail ? " | " : ""}
                    {event.detail}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-xl font-semibold text-slate-900 mt-1">{value}</div>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
