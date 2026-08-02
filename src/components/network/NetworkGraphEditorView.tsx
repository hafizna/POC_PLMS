import { Pencil } from "lucide-react";
import { NETWORK_CASES } from "../../domain/seed-network-registry";
import {
  INVENTORY_MASTER_CASE_ID,
  getEffectiveNetworkGraph,
  mergeMasterRelationsIntoCase,
} from "../../domain/network-graph";
import { useProsetStore } from "../../store/useProsetStore";
import { NetworkGraphEditor } from "./NetworkGraphEditor";

export function NetworkGraphEditorView() {
  const activeCaseId = useProsetStore((s) => s.activeNetworkCaseId);
  const setActiveCase = useProsetStore((s) => s.setActiveNetworkCase);
  const activeCase =
    NETWORK_CASES.find((item) => item.id === activeCaseId) ?? NETWORK_CASES[0];
  const inventoryCase =
    NETWORK_CASES.find((item) => item.id === INVENTORY_MASTER_CASE_ID) ?? activeCase;
  const override = useProsetStore((s) => s.networkGraphOverrides[activeCase.id]);
  const masterOverride = useProsetStore((s) => s.networkGraphOverrides[INVENTORY_MASTER_CASE_ID]);
  const baseNetworkGraph = getEffectiveNetworkGraph(activeCase.id, override);
  // Same merge every other consumer view already does (NetworkModelView,
  // StudyDashboardView, CalculationView, etc.) — without this, GI confirmed
  // via Graph Builder into the master inventory override never showed up
  // here, since this view previously read only its own case's override.
  const masterNetworkGraph = getEffectiveNetworkGraph(inventoryCase.id, masterOverride);
  const networkGraph = mergeMasterRelationsIntoCase(baseNetworkGraph, masterNetworkGraph);

  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-brand-accent/10 border border-brand-accent/40 p-2">
              <Pencil className="w-5 h-5 text-brand-accent-dark" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Network Builder</h2>
              <p className="text-xs text-slate-500 mt-0.5 max-w-3xl">
                Maintenance data sementara untuk melengkapi Working Network: tambah GI/GIS, relation, bay, terminal default, dan IED.
                Untuk pilot backend, halaman ini akan menjadi form master data/staging, bukan tempat hitung setting.
              </p>
            </div>
          </div>
          <select
            value={activeCase.id}
            onChange={(e) => setActiveCase(e.target.value)}
            className="bg-white text-sm px-3 py-1.5 rounded border border-slate-300 focus:border-brand-accent focus:outline-none"
          >
            {NETWORK_CASES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
                {item.id === INVENTORY_MASTER_CASE_ID ? " (master inventory)" : ""}
              </option>
            ))}
          </select>
        </div>
      </section>

      {networkGraph ? (
        <NetworkGraphEditor caseId={activeCase.id} networkGraph={networkGraph} override={override} />
      ) : (
        <section className="bg-white border border-dashed border-slate-300 rounded-lg p-6 text-center text-sm text-slate-500">
          Case ini belum punya network graph seed. Tambah substation di seed code, atau pilih case lain.
        </section>
      )}
    </div>
  );
}
