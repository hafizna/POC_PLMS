import { useMemo, useState } from "react";
import {
  Database,
  GitBranch,
  HardDrive,
  Pencil,
  RadioTower,
  ShieldCheck,
} from "lucide-react";
import { ULTG_INVENTORY_NODES } from "../../domain/seed-network-registry";
import { normalizeStationName } from "../../domain/normalization";
import {
  INVENTORY_MASTER_CASE_ID,
  networkLinesFromGraph,
  networkNodesFromGraph,
  relayAssetsFromGraph,
} from "../../domain/network-graph";
import { useProsetStore } from "../../store/useProsetStore";
import { ctRatioText, parseCtRatio, parseVtRatio, vtRatioText } from "../../domain/instrument-transformers";
import { getConfirmedMasterNetwork } from "../../domain/study-network";

type MasterTab = "substations" | "relations" | "relays" | "functions";

export function MasterDataView() {
  const [activeTab, setActiveTab] = useState<MasterTab>("substations");
  const networkGraphOverrides = useProsetStore((s) => s.networkGraphOverrides);
  const ctVtOverrides = useProsetStore((s) => s.ctVtOverrides);
  const setTab = useProsetStore((s) => s.setTab);

  const effectiveNetworkGraph = useMemo(
    () => getConfirmedMasterNetwork(networkGraphOverrides[INVENTORY_MASTER_CASE_ID]),
    [networkGraphOverrides]
  );

  const nodes = useMemo(
    () => networkNodesFromGraph(effectiveNetworkGraph),
    [effectiveNetworkGraph]
  );
  const lines = useMemo(
    () => networkLinesFromGraph(effectiveNetworkGraph),
    [effectiveNetworkGraph]
  );
  const relays = useMemo(
    () => relayAssetsFromGraph(effectiveNetworkGraph),
    [effectiveNetworkGraph]
  );
  const protectionFunctions = effectiveNetworkGraph.protectionFunctions;

  // Seed inventory plus any substation confirmed via the graph builder (Inbox)
  // that isn't in the seed yet — otherwise a newly-confirmed GI (e.g. from
  // buildGraphForUltg) would silently never appear as its own row here, even
  // though it's already "modeled" in the effective network graph.
  const allSubstationNodes = useMemo(() => {
    const seedKeys = new Set(ULTG_INVENTORY_NODES.map((n) => normalizeStationName(n.name)));
    const extra = nodes.filter((n) => !seedKeys.has(normalizeStationName(n.name)));
    return [...ULTG_INVENTORY_NODES, ...extra];
  }, [nodes]);

  const tabs: { id: MasterTab; label: string; count: number; icon: React.ReactNode }[] = [
    { id: "substations", label: "GI/GIS", count: allSubstationNodes.length, icon: <RadioTower className="w-3.5 h-3.5" /> },
    { id: "relations", label: "Line Relations", count: lines.length, icon: <GitBranch className="w-3.5 h-3.5" /> },
    { id: "relays", label: "Relay & IED", count: relays.length, icon: <HardDrive className="w-3.5 h-3.5" /> },
    { id: "functions", label: "Protection Functions", count: protectionFunctions.length, icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="bg-white border border-slate-200 rounded-xl p-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-slate-100 border border-slate-200 p-2">
              <Database className="w-5 h-5 text-slate-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Master Data Registry</h2>
              <p className="text-xs text-slate-500 mt-0.5 max-w-2xl">
                Data master GI, line relation, relay IED, dan protection function dari ULTG Durikosambi.
                Data ini menjadi sumber untuk semua study.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setTab("network-graph-editor")}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Network Builder
          </button>
        </div>

        {/* Summary tiles */}
        <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryTile label="GI/GIS" value={allSubstationNodes.length} sub="master nodes" tone="blue" />
          <SummaryTile label="Lines" value={lines.length} sub="modeled relations" tone="emerald" />
          <SummaryTile label="IED" value={relays.length} sub="relay assets" tone="amber" />
          <SummaryTile label="Functions" value={protectionFunctions.length} sub="DIST/LCD/OCR/GFR" tone="purple" />
        </div>
      </section>

      {/* Tab switcher */}
      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
              activeTab === tab.id
                ? "bg-blue-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            {tab.icon}
            {tab.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              activeTab === tab.id ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
            }`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {activeTab === "substations" && (
          <SubstationsTable nodes={allSubstationNodes} corridorNodes={nodes} />
        )}
        {activeTab === "relations" && (
          <RelationsTable lines={lines} nodes={nodes} />
        )}
        {activeTab === "relays" && (
          <RelaysTable relays={relays} ctVtOverrides={ctVtOverrides} />
        )}
        {activeTab === "functions" && (
          <FunctionsTable functions={protectionFunctions} relays={relays} />
        )}
      </section>
    </div>
  );
}

function SubstationsTable({
  nodes: allNodes,
  corridorNodes,
}: {
  nodes: typeof ULTG_INVENTORY_NODES;
  corridorNodes: ReturnType<typeof networkNodesFromGraph>;
}) {
  return (
    <>
      <div className="border-b border-slate-200 px-4 py-2.5 bg-slate-50">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">GI/GIS/GISTET — ULTG Durikosambi</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-white border-b border-slate-200 text-xs text-slate-500">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Code</th>
              <th className="text-left px-4 py-2 font-medium">Name</th>
              <th className="text-left px-4 py-2 font-medium">Type</th>
              <th className="text-left px-4 py-2 font-medium">Voltage</th>
              <th className="text-left px-4 py-2 font-medium">Model Status</th>
            </tr>
          </thead>
          <tbody>
            {allNodes.map((node) => {
              const nodeNorm = normalizeStationName(node.name);
              const inCorridor = corridorNodes.some((cn) => {
                const cnNorm = normalizeStationName(cn.name);
                return cn.id === node.id || cnNorm === nodeNorm || cnNorm.includes(nodeNorm) || nodeNorm.includes(cnNorm);
              });
              return (
                <tr key={node.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                  <td className="px-4 py-2 font-semibold text-slate-900">{node.shortCode}</td>
                  <td className="px-4 py-2 text-slate-700">{node.name}</td>
                  <td className="px-4 py-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">
                      {node.type}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">{node.voltageKv} kV</td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        inCorridor
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
                      {inCorridor ? "modeled" : "node only"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function RelationsTable({
  lines,
  nodes,
}: {
  lines: ReturnType<typeof networkLinesFromGraph>;
  nodes: ReturnType<typeof networkNodesFromGraph>;
}) {
  return (
    <>
      <div className="border-b border-slate-200 px-4 py-2.5 bg-slate-50">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">Line Relations</h3>
      </div>
      {lines.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-slate-500">
          Belum ada line relation. Tambahkan via Network Builder.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">From</th>
                <th className="text-left px-4 py-2 font-medium">To</th>
                <th className="text-left px-4 py-2 font-medium">Circuit</th>
                <th className="text-left px-4 py-2 font-medium">Relay</th>
                <th className="text-left px-4 py-2 font-medium">Functions</th>
                <th className="text-left px-4 py-2 font-medium">X (Ω)</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const from = nodes.find((n) => n.id === line.fromNodeId);
                const to = nodes.find((n) => n.id === line.toNodeId);
                return (
                  <tr key={line.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <div className="font-semibold text-slate-900">{from?.shortCode ?? line.fromNodeId}</div>
                      <div className="text-[10px] text-slate-500">{line.fromBay}</div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-semibold text-slate-900">{to?.shortCode ?? line.toNodeId}</div>
                      <div className="text-[10px] text-slate-500">{line.toBay}</div>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">{line.circuit || "-"}</td>
                    <td className="px-4 py-2 text-xs text-slate-600">{line.relayMain || "-"}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {line.protectionFunctions.map((fn) => (
                          <span key={fn} className="text-[10px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700">
                            {fn}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs font-mono text-slate-600">
                      {line.lineXOhm?.toFixed(3) ?? "-"}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                        line.lifecycleStatus === "approved"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                      }`}>
                        {line.lifecycleStatus ?? "unknown"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function RelaysTable({
  relays,
  ctVtOverrides,
}: {
  relays: ReturnType<typeof relayAssetsFromGraph>;
  ctVtOverrides: ReturnType<typeof useProsetStore.getState>["ctVtOverrides"];
}) {
  return (
    <>
      <div className="border-b border-slate-200 px-4 py-2.5 bg-slate-50">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">Relay & IED Assets</h3>
      </div>
      {relays.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-slate-500">
          Belum ada relay/IED terdaftar.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">GI</th>
                <th className="text-left px-4 py-2 font-medium">Bay</th>
                <th className="text-left px-4 py-2 font-medium">Make</th>
                <th className="text-left px-4 py-2 font-medium">Model</th>
                <th className="text-left px-4 py-2 font-medium">Function Group</th>
                <th className="text-left px-4 py-2 font-medium">CT Ratio</th>
                <th className="text-left px-4 py-2 font-medium">VT Ratio</th>
              </tr>
            </thead>
            <tbody>
              {relays.map((relay) => {
                const override = ctVtOverrides[relay.id];
                const ct = override?.ct ?? parseCtRatio(relay.ctRatio);
                const vt = override?.vt ?? parseVtRatio(relay.vtRatio);
                return (
                  <tr key={relay.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                    <td className="px-4 py-2 font-semibold text-slate-900">{relay.nodeId.toUpperCase()}</td>
                    <td className="px-4 py-2 text-xs text-slate-700">{relay.bay}</td>
                    <td className="px-4 py-2 text-xs text-slate-700">{relay.make}</td>
                    <td className="px-4 py-2 text-xs text-slate-700">{relay.model}</td>
                    <td className="px-4 py-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700">
                        {relay.functionGroup}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs font-mono text-slate-600">
                      {ctRatioText(ct, relay.ctRatio)}
                      {override?.ct && <span className="ml-1 text-[10px] text-cyan-600">reviewed</span>}
                    </td>
                    <td className="px-4 py-2 text-xs font-mono text-slate-600">
                      {vtRatioText(vt, relay.vtRatio)}
                      {override?.vt && <span className="ml-1 text-[10px] text-cyan-600">reviewed</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function FunctionsTable({
  functions,
  relays,
}: {
  functions: { id: string; relayIedId: string; function: string }[];
  relays: ReturnType<typeof relayAssetsFromGraph>;
}) {
  return (
    <>
      <div className="border-b border-slate-200 px-4 py-2.5 bg-slate-50">
        <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">Protection Functions</h3>
      </div>
      {functions.length === 0 ? (
        <div className="px-4 py-12 text-center text-sm text-slate-500">
          Belum ada protection function terdaftar.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Function</th>
                <th className="text-left px-4 py-2 font-medium">Relay IED</th>
                <th className="text-left px-4 py-2 font-medium">Bay</th>
                <th className="text-left px-4 py-2 font-medium">ID</th>
              </tr>
            </thead>
            <tbody>
              {functions.map((fn) => {
                const relay = relays.find((r) => r.id === fn.relayIedId);
                return (
                  <tr key={fn.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <span className="text-xs px-2 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 font-medium">
                        {fn.function}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-700">
                      {relay ? `${relay.make} ${relay.model}` : fn.relayIedId}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">{relay?.bay ?? "-"}</td>
                    <td className="px-4 py-2 text-[10px] font-mono text-slate-400">{fn.id}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SummaryTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: number;
  sub: string;
  tone: "blue" | "emerald" | "amber" | "purple";
}) {
  const toneClass = {
    blue: "bg-blue-50 border-blue-200",
    emerald: "bg-emerald-50 border-emerald-200",
    amber: "bg-amber-50 border-amber-200",
    purple: "bg-purple-50 border-purple-200",
  }[tone];
  return (
    <div className={`border rounded-lg p-3 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-900">{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{sub}</div>
    </div>
  );
}
