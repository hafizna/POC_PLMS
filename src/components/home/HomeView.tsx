import { useMemo, useState } from "react";
import {
  BookOpen,
  Calculator,
  ChevronRight,
  Layers,
  Plus,
  Route,
  Zap,
} from "lucide-react";
import { ULTG_INVENTORY_NODES } from "../../domain/seed-network-registry";
import { INVENTORY_MASTER_CASE_ID } from "../../domain/network-graph";
import { useProsetStore, type Study, type Tab } from "../../store/useProsetStore";
import { normalizeStationName } from "../../domain/normalization";
import { StudyWizard } from "../study/StudyWizard";
import { getConfirmedMasterNetwork } from "../../domain/study-network";

export function HomeView() {
  const studies = useProsetStore((s) => s.studies);
  const activeStudyId = useProsetStore((s) => s.activeStudyId);
  const setActiveStudy = useProsetStore((s) => s.setActiveStudy);
  const setTab = useProsetStore((s) => s.setTab);
  const selectLine = useProsetStore((s) => s.selectLine);
  const networkGraphOverrides = useProsetStore((s) => s.networkGraphOverrides);

  const [showCreateModal, setShowCreateModal] = useState(false);

  // Master data summary — merge corridor + inventory for totals
  const masterNetworkGraph = useMemo(
    () => getConfirmedMasterNetwork(networkGraphOverrides[INVENTORY_MASTER_CASE_ID]),
    [networkGraphOverrides]
  );
  const totalRelations = masterNetworkGraph.lineRelations.length;
  const totalIEDs = masterNetworkGraph.relayIeds.length;
  const allInventoryGIs = masterNetworkGraph.substations.length;

  const openStudy = (studyId: string) => {
    setActiveStudy(studyId);
    setTab("study-dashboard");
  };

  return (
    <div className="space-y-6">
      {/* Hero header */}
      <section className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 px-6 py-8 text-white">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PHBhdGggZD0iTTAgMGg0MHY0MEgweiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />
        <div className="relative flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-500/20 border border-amber-500/30 p-2">
                <Zap className="w-6 h-6 text-amber-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight">Protection Lifecycle Management</h1>
                <p className="text-sm text-slate-300 mt-0.5">
                  Kelola study proteksi, hitung setting, dan validasi coverage penghantar transmisi.
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors shadow-lg shadow-blue-600/20"
          >
            <Plus className="w-4 h-4" />
            New Study
          </button>
        </div>

        <div className="relative mt-6 grid grid-cols-3 gap-4">
          <HeroTile label="GI di Master" value={allInventoryGIs} sub={`${totalIEDs} relay IED terdaftar`} />
          <HeroTile label="Line Relations" value={totalRelations} sub="confirmed master edges" />
          <HeroTile label="Active Studies" value={studies.filter((s) => s.status === "active").length} sub="sedang berjalan" />
        </div>
      </section>

      {/* Active Studies */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">Studies</h2>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="text-xs px-3 py-1.5 rounded-md border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            New Study
          </button>
        </div>

        {studies.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-6 py-12 text-center">
            <BookOpen className="w-10 h-10 text-slate-300 mx-auto" />
            <div className="mt-3 text-sm text-slate-500">Belum ada study. Buat study baru untuk mulai analisis proteksi.</div>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              <Plus className="w-4 h-4" />
              Buat Study Pertama
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {studies.map((study) => (
              <StudyCard
                key={study.id}
                study={study}
                isActive={study.id === activeStudyId}
                onOpen={() => openStudy(study.id)}
                setTab={setTab}
                setActiveStudy={setActiveStudy}
                selectLine={selectLine}
              />
            ))}
          </div>
        )}
      </section>

      {/* Master Data Summary — compact GI list */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3 bg-slate-50 flex items-center justify-between">
          <div>
            <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">Master Data — GI/GIS Terdaftar</h3>
            <div className="text-[10px] text-slate-500 mt-0.5">
              Data master ULTG Durikosambi. Kelola di menu Master Data.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setTab("master-data")}
            className="text-xs px-3 py-1.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
          >
            <Layers className="w-3.5 h-3.5" />
            Buka Master Data
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-white border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Code</th>
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Voltage</th>
                <th className="text-left px-4 py-2 font-medium">In Studies</th>
              </tr>
            </thead>
            <tbody>
              {ULTG_INVENTORY_NODES.map((node) => {
                const usedIn = studies.filter((s) =>
                  s.substationIds.some(
                    (sid) =>
                      sid === node.id ||
                      normalizeStationName(sid) === normalizeStationName(node.name)
                  )
                );
                return (
                  <tr key={node.id} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                    <td className="px-4 py-2 font-semibold text-slate-900">{node.shortCode}</td>
                    <td className="px-4 py-2 text-slate-700">{node.name}</td>
                    <td className="px-4 py-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-600">{node.type}</span>
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-600">{node.voltageKv} kV</td>
                    <td className="px-4 py-2">
                      {usedIn.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {usedIn.map((s) => (
                            <span key={s.id} className="text-[10px] px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 truncate max-w-24">
                              {s.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {showCreateModal && (
        <StudyWizard onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}

function StudyCard({
  study,
  isActive,
  onOpen,
  setTab,
  setActiveStudy,
  selectLine,
}: {
  study: Study;
  isActive: boolean;
  onOpen: () => void;
  setTab: (tab: Tab) => void;
  setActiveStudy: (id: string) => void;
  selectLine: (lineId: string) => void;
}) {
  const statusClass =
    study.status === "active"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : study.status === "completed"
        ? "border-blue-200 bg-blue-50 text-blue-700"
        : "border-slate-200 bg-slate-50 text-slate-600";

  return (
    <div
      className={`rounded-xl border bg-white p-4 transition-all hover:shadow-md ${
        isActive ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-200"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-semibold text-slate-900">{study.name}</h3>
            <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${statusClass}`}>
              {study.status}
            </span>
            {isActive && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-600 text-white">
                active
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{study.description}</p>
          {study.subjectLabel && (
            <div className="mt-2 inline-flex rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">
              Subject: {study.subjectLabel}
            </div>
          )}
          <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
            <span>{study.substationIds.length} GI</span>
            <span>·</span>
            <span>Created {formatDate(study.createdAt)}</span>
            <span>·</span>
            <span>Updated {formatDate(study.updatedAt)}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <QuickButton
            icon={<Calculator className="w-3.5 h-3.5" />}
            label="Calculation"
            onClick={() => {
              setActiveStudy(study.id);
              if (study.subjectLineId) selectLine(study.subjectLineId);
              setTab("calculation");
            }}
          />
          <QuickButton
            icon={<Route className="w-3.5 h-3.5" />}
            label="Coverage"
            onClick={() => {
              setActiveStudy(study.id);
              if (study.subjectLineId) selectLine(study.subjectLineId);
              setTab("coverage");
            }}
          />
          <button
            type="button"
            onClick={onOpen}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
          >
            Open
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function QuickButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors"
    >
      {icon}
    </button>
  );
}

function HeroTile({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 px-4 py-3 backdrop-blur-sm">
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
      <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>
    </div>
  );
}

function formatDate(value: string) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleDateString("id-ID", { year: "numeric", month: "short", day: "2-digit" });
  } catch {
    return value;
  }
}
