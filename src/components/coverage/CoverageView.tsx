import { useMemo } from "react";
import { useProsetStore } from "../../store/useProsetStore";
import { CorridorDiagram } from "./CorridorDiagram";
import { ZoneParameterPanel } from "./ZoneParameterPanel";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { BranchSelector } from "./BranchSelector";
import { RXPlaneModal } from "./RXPlaneModal";
import { runCoordinationChecks } from "../../lib/coordination-checks";
import { NETWORK_CASES } from "../../domain/seed-network-registry";

export function CoverageView() {
  const topology = useProsetStore((s) => s.topology);
  const corridors = useProsetStore((s) => s.corridors);
  const activeCorridorId = useProsetStore((s) => s.activeCorridorId);
  const activeLineId = useProsetStore((s) => s.activeNetworkLineId);
  const getEffectiveRelay = useProsetStore((s) => s.getEffectiveRelay);
  const overrides = useProsetStore((s) => s.relayOverrides);

  const activeCorridor =
    corridors.find((c) => c.id === activeCorridorId) ?? corridors[0];
  const activeCase = NETWORK_CASES.find((item) =>
    item.lines.some((line) => line.id === activeLineId)
  );
  const activeLine = activeCase?.lines.find((line) => line.id === activeLineId);
  const fromNode = activeLine
    ? activeCase?.nodes.find((node) => node.id === activeLine.fromNodeId)
    : null;
  const toNode = activeLine
    ? activeCase?.nodes.find((node) => node.id === activeLine.toNodeId)
    : null;

  // Re-run diagnostics whenever overrides or corridor change.
  const diagnostics = useMemo(
    () => runCoordinationChecks(topology, activeCorridor, getEffectiveRelay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topology, activeCorridor, overrides]
  );

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
              Topology derived from mini-NMM via seed-corridor adapter.
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
            </div>
            <BranchSelector />
          </div>
          <CorridorDiagram corridor={activeCorridor} />
        </div>
        <DiagnosticsPanel diagnostics={diagnostics} />
      </div>
      <div className="space-y-4">
        <ZoneParameterPanel />
      </div>
      <RXPlaneModal />
    </div>
  );
}
