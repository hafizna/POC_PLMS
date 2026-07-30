import { Pencil } from "lucide-react";
import { NETWORK_CASES } from "../../domain/seed-network-registry";
import { getEffectiveNetworkGraph } from "../../domain/network-graph";
import { useProsetStore } from "../../store/useProsetStore";
import { NetworkGraphEditor } from "./NetworkGraphEditor";

export function NetworkGraphEditorView() {
  const activeCaseId = useProsetStore((s) => s.activeNetworkCaseId);
  const setActiveCase = useProsetStore((s) => s.setActiveNetworkCase);
  const activeCase =
    NETWORK_CASES.find((item) => item.id === activeCaseId) ?? NETWORK_CASES[0];
  const override = useProsetStore((s) => s.networkGraphOverrides[activeCase.id]);
  const networkGraph = getEffectiveNetworkGraph(activeCase.id, override);

  return (
    <div className="space-y-4">
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-blue-50 border border-blue-200 p-2">
              <Pencil className="w-5 h-5 text-blue-600" />
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
            className="bg-white text-sm px-3 py-1.5 rounded border border-slate-300 focus:border-blue-500 focus:outline-none"
          >
            {NETWORK_CASES.filter((item) => item.scope === "corridor").map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
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
