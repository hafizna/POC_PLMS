import { useMemo } from "react";
import { useProsetStore } from "../../store/useProsetStore";
import { CorridorDiagram } from "./CorridorDiagram";
import { ZoneParameterPanel } from "./ZoneParameterPanel";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { BranchSelector } from "./BranchSelector";
import { RXPlaneModal } from "./RXPlaneModal";
import { runGraphCoordinationChecks } from "../../lib/graph-coordination";
import { NETWORK_CASES } from "../../domain/seed-network-registry";
import {
  getEffectiveNetworkGraph,
  INVENTORY_MASTER_CASE_ID,
  mergeMasterRelationsIntoCase,
} from "../../domain/network-graph";
import { buildUnifiedNetwork } from "../../domain/unified";

export function CoverageView() {
  const corridors = useProsetStore((s) => s.corridors);
  const activeCorridorId = useProsetStore((s) => s.activeCorridorId);
  const activeCaseId = useProsetStore((s) => s.activeNetworkCaseId);
  const activeLineId = useProsetStore((s) => s.activeNetworkLineId);
  const networkGraphOverrides = useProsetStore((s) => s.networkGraphOverrides);

  const activeCorridor =
    corridors.find((c) => c.id === activeCorridorId) ?? corridors[0];
  const activeCase = NETWORK_CASES.find((item) =>
    item.lines.some((line) => line.id === activeLineId)
  ) ?? NETWORK_CASES.find((item) => item.id === activeCaseId) ?? NETWORK_CASES[0];
  const activeLine = activeCase?.lines.find((line) => line.id === activeLineId);
  const fromNode = activeLine
    ? activeCase?.nodes.find((node) => node.id === activeLine.fromNodeId)
    : null;
  const toNode = activeLine
    ? activeCase?.nodes.find((node) => node.id === activeLine.toNodeId)
    : null;

  // Coordination diagnostics now run against the same UnifiedNetwork graph
  // CalculationView/VerifiedReportView use (graph-coordination.ts, lapis 2),
  // not the legacy Topology/Corridor model — CorridorDiagram below still
  // reads the legacy model for its d3 visualization, which is a separate,
  // not-yet-migrated piece (see IMPLEMENTATION_NOTES.md).
  const inventoryCase =
    NETWORK_CASES.find((item) => item.id === INVENTORY_MASTER_CASE_ID) ?? activeCase;
  const fallbackNetworkGraph = useMemo(() => buildUnifiedNetwork(activeCase), [activeCase]);
  const masterFallbackNetworkGraph = useMemo(
    () => buildUnifiedNetwork(inventoryCase),
    [inventoryCase]
  );
  const masterNetworkGraph = useMemo(
    () =>
      getEffectiveNetworkGraph(
        INVENTORY_MASTER_CASE_ID,
        networkGraphOverrides[INVENTORY_MASTER_CASE_ID],
        masterFallbackNetworkGraph
      ),
    [networkGraphOverrides, masterFallbackNetworkGraph]
  );
  const networkGraph = useMemo(
    () =>
      mergeMasterRelationsIntoCase(
        getEffectiveNetworkGraph(activeCase.id, networkGraphOverrides[activeCase.id], fallbackNetworkGraph),
        masterNetworkGraph
      ),
    [activeCase.id, networkGraphOverrides, fallbackNetworkGraph, masterNetworkGraph]
  );
  const diagnostics = useMemo(
    () => (networkGraph ? runGraphCoordinationChecks(networkGraph) : []),
    [networkGraph]
  );
  const hasRelaySettings = Boolean(networkGraph?.relaySettings?.length);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_430px] gap-6">
      <div className="space-y-4">
        {activeLine && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-900 flex items-center justify-between gap-3 flex-wrap">
            <div>
              Context from Line Registry:{" "}
              <span className="font-semibold">
                {fromNode?.shortCode} - {toNode?.shortCode} {activeLine.circuit}
              </span>
              <span className="text-blue-700">
                {" "}
                | {activeLine.relayMain} | Xline{" "}
                {activeLine.lineXOhm?.toFixed(3) ?? "?"} ohm
              </span>
            </div>
            <span className="text-blue-700">
              Topology derived from network graph via seed-corridor adapter.
            </span>
          </div>
        )}
        <div className="bg-white border border-slate-200 rounded-lg p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Active Corridor
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Multi-bay distance protection coordination view. Click any relay
                in the diagram to drill into its R-X plane.
              </p>
              <p className="text-[11px] text-amber-700 mt-1">
                Diagram visual ini masih pakai model legacy (Topology/Corridor,
                1D linear) — belum graph-aware. Diagnostics di bawah sudah
                berjalan di atas UnifiedNetwork/RelaySetting (graph-coordination.ts).
              </p>
            </div>
            <BranchSelector />
          </div>
          <CorridorDiagram corridor={activeCorridor} />
        </div>
        {hasRelaySettings ? (
          <DiagnosticsPanel diagnostics={diagnostics} />
        ) : (
          <div className="bg-white border border-amber-200 rounded-lg p-4 text-xs text-amber-800">
            Belum ada RelaySetting (Z1/Z2/Z3) untuk network ini — graph builder
            belum mengisi relay identity/zone data untuk case ini, jadi
            coordination diagnostics belum bisa dihitung.
          </div>
        )}
      </div>
      <div className="space-y-4">
        <ZoneParameterPanel />
      </div>
      <RXPlaneModal />
    </div>
  );
}
