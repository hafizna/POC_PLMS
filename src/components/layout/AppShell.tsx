import { ReactNode, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Calculator,
  ChevronDown,
  ChevronRight,
  Database,
  FileCheck2,
  FileSearch,
  GitCompareArrows,
  Home,
  Inbox,
  Layers,
  Library,
  Pencil,
  Route,
  ShieldCheck,
  Network,
} from "lucide-react";
import { useProsetStore, type Study } from "../../store/useProsetStore";
import { TopBar } from "./TopBar";
import { NETWORK_CASES } from "../../domain/seed-network-registry";
import { buildUnifiedNetwork } from "../../domain/unified";
import {
  getEffectiveMiniNmm,
  INVENTORY_MASTER_CASE_ID,
  mergeMasterRelationsIntoCase,
  networkLinesFromMiniNmm,
  networkNodesFromMiniNmm,
} from "../../domain/mini-nmm";
import {
  LCD_DIST_REGISTRY,
  mapLcdDistCandidatesToLines,
} from "../../domain/lcd-dist-import";
import {
  OCR_REGISTRY,
  mapOcrCandidatesToLines,
  summarizeOcrMismatch,
} from "../../domain/ocr-import";
import { buildCaseScopePredicate } from "../../domain/matcher";

type Tab =
  | "home"
  | "master-data"
  | "study-dashboard"
  | "network-model"
  | "mini-nmm-editor"
  | "source-index"
  | "inbox"
  | "line-registry"
  | "calculation"
  | "comparison"
  | "coverage"
  | "verified-report"
  | "audit-trail";

// Study sub-menu items
const STUDY_ITEMS: { id: Tab; label: string; icon: ReactNode; showBadge?: boolean }[] = [
  { id: "study-dashboard", label: "Bay List", icon: <BookOpen className="w-3.5 h-3.5" /> },
  { id: "network-model", label: "Working Network", icon: <Network className="w-3.5 h-3.5" /> },
  { id: "inbox", label: "Data Mapping Inbox", icon: <Inbox className="w-3.5 h-3.5" />, showBadge: true },
  { id: "line-registry", label: "Setting Register", icon: <Library className="w-3.5 h-3.5" /> },
  { id: "calculation", label: "Calculation", icon: <Calculator className="w-3.5 h-3.5" /> },
  { id: "comparison", label: "Comparison", icon: <GitCompareArrows className="w-3.5 h-3.5" /> },
  { id: "coverage", label: "Coverage Check", icon: <Route className="w-3.5 h-3.5" /> },
  { id: "verified-report", label: "Verified Report", icon: <FileCheck2 className="w-3.5 h-3.5" /> },
];

export function AppShell({ children }: { children: ReactNode }) {
  const tab = useProsetStore((s) => s.currentTab);
  const setTab = useProsetStore((s) => s.setTab);
  const decisions = useProsetStore((s) => s.candidateDecisions);
  const activeCaseId = useProsetStore((s) => s.activeNetworkCaseId);
  const miniNmmOverrides = useProsetStore((s) => s.miniNmmOverrides);
  const studies = useProsetStore((s) => s.studies);
  const activeStudyId = useProsetStore((s) => s.activeStudyId);
  const setActiveStudy = useProsetStore((s) => s.setActiveStudy);

  const [expandedStudyId, setExpandedStudyId] = useState<string | null>(activeStudyId);

  useEffect(() => {
    if (activeStudyId) setExpandedStudyId(activeStudyId);
  }, [activeStudyId]);

  const inboxCount = useMemo(() => {
    const activeCase = NETWORK_CASES.find((c) => c.id === activeCaseId) ?? NETWORK_CASES[0];
    const inventoryCase =
      NETWORK_CASES.find((c) => c.id === INVENTORY_MASTER_CASE_ID) ?? activeCase;
    const fallbackMiniNmm = buildUnifiedNetwork(activeCase);
    const masterFallbackMiniNmm = buildUnifiedNetwork(inventoryCase);
    const masterMiniNmm = getEffectiveMiniNmm(
      INVENTORY_MASTER_CASE_ID,
      miniNmmOverrides[INVENTORY_MASTER_CASE_ID],
      masterFallbackMiniNmm
    );
    const miniNmm = mergeMasterRelationsIntoCase(
      getEffectiveMiniNmm(activeCase.id, miniNmmOverrides[activeCase.id], fallbackMiniNmm),
      masterMiniNmm
    );
    const nodes = miniNmm ? networkNodesFromMiniNmm(miniNmm) : activeCase.nodes;
    const lines = miniNmm ? networkLinesFromMiniNmm(miniNmm) : activeCase.lines;
    const inScope = buildCaseScopePredicate(nodes);
    const lcd = mapLcdDistCandidatesToLines(LCD_DIST_REGISTRY.records, nodes, lines)
      .filter((c) => inScope({ substation: c.substation, bay: c.bay }))
      .filter((c) => (decisions[`lcd:${c.recordId}`]?.status ?? "imported") === "imported").length;
    const ocrCandidates = mapOcrCandidatesToLines(OCR_REGISTRY.records, nodes, lines);
    const ocr = ocrCandidates
      .filter((c) => {
        const record = OCR_REGISTRY.records.find((r) => r.id === c.recordId);
        return record && inScope({ substation: record.substation, bay: record.bay });
      })
      .filter((c) => (decisions[`ocr:${c.recordId}`]?.status ?? "imported") === "imported").length;
    const drift = OCR_REGISTRY.records
      .filter((r) => ocrCandidates.some((c) => c.recordId === r.id && c.matchStatus !== "unmatched"))
      .filter((r) => summarizeOcrMismatch(r).hasFunctionalRisk).length;
    return lcd + ocr + drift;
  }, [activeCaseId, decisions, miniNmmOverrides]);

  // Check if current tab is a study-scoped tab
  const isStudyTab = STUDY_ITEMS.some((item) => item.id === tab);

  const handleStudyClick = (study: Study) => {
    setActiveStudy(study.id);
    setTab("study-dashboard");
    if (expandedStudyId === study.id) {
      // Already expanded, toggle collapse
      setExpandedStudyId(null);
    } else {
      setExpandedStudyId(study.id);
    }
  };

  const handleStudyItemClick = (studyId: string, itemTab: Tab) => {
    setActiveStudy(studyId);
    setTab(itemTab);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <TopBar />
      <div className="flex-1 flex">
        <aside className="w-56 shrink-0 bg-slate-50 border-r border-slate-200 py-4 flex flex-col">
          <nav className="flex-1 space-y-1">
            {/* Home */}
            <div className="px-2 mb-3">
              <NavButton
                active={tab === "home"}
                onClick={() => setTab("home")}
                icon={<Home className="w-4 h-4" />}
                label="Home"
              />
            </div>

            {/* Master Data */}
            <div className="px-2 mb-1">
              <div className="px-2 mb-1 text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                Master Data
              </div>
              <NavButton
                active={tab === "master-data"}
                onClick={() => setTab("master-data")}
                icon={<Database className="w-4 h-4" />}
                label="GI & Network"
              />
              <NavButton
                active={tab === "mini-nmm-editor"}
                onClick={() => setTab("mini-nmm-editor")}
                icon={<Pencil className="w-4 h-4" />}
                label="Network Builder"
              />
              <NavButton
                active={tab === "source-index"}
                onClick={() => setTab("source-index")}
                icon={<FileSearch className="w-4 h-4" />}
                label="Source Documents"
              />
            </div>

            {/* Studies */}
            <div className="px-2 mt-3">
              <div className="px-2 mb-1 text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                Studies
              </div>

              {studies.length === 0 ? (
                <div className="px-2 py-3 text-xs text-slate-400 italic">
                  No studies yet
                </div>
              ) : (
                studies.map((study) => {
                  const isExpanded = expandedStudyId === study.id;
                  const isActiveStudy = study.id === activeStudyId;
                  return (
                    <div key={study.id} className="mb-0.5">
                      {/* Study header */}
                      <button
                        type="button"
                        onClick={() => handleStudyClick(study)}
                        className={`w-full text-left px-2 py-1.5 text-xs flex items-center gap-1.5 rounded-md transition-colors ${
                          isActiveStudy && isStudyTab
                            ? "bg-blue-50 text-blue-700"
                            : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                      >
                        {isExpanded ? (
                          <ChevronDown className="w-3 h-3 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3 h-3 shrink-0" />
                        )}
                        <BookOpen className="w-3.5 h-3.5 shrink-0" />
                        <span className="flex-1 truncate font-medium">{study.name}</span>
                        {isActiveStudy && (
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                        )}
                      </button>

                      {/* Study sub-items */}
                      {isExpanded && (
                        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-200 pl-2">
                          {STUDY_ITEMS.map((item) => {
                            const isActive = tab === item.id && study.id === activeStudyId;
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => handleStudyItemClick(study.id, item.id)}
                                className={`w-full text-left px-2 py-1.5 text-[11px] flex items-center gap-2 rounded-md transition-colors ${
                                  isActive
                                    ? "bg-blue-100 text-blue-800 font-medium"
                                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                                }`}
                              >
                                {item.icon}
                                <span className="flex-1">{item.label}</span>
                                {item.showBadge && inboxCount > 0 && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-700 font-semibold">
                                    {inboxCount}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* New Study button */}
              <button
                type="button"
                onClick={() => setTab("home")}
                className="w-full mt-1 text-left px-2 py-1.5 text-[11px] flex items-center gap-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
              >
                <span className="text-xs">+</span>
                <span>New Study</span>
              </button>
            </div>

            {/* Governance */}
            <div className="px-2 mt-3">
              <div className="px-2 mb-1 text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                Governance
              </div>
              <NavButton
                active={tab === "audit-trail"}
                onClick={() => setTab("audit-trail")}
                icon={<ShieldCheck className="w-4 h-4" />}
                label="Audit Trail"
              />
            </div>
          </nav>

          <div className="px-4 mt-4 pt-4 border-t border-slate-200">
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <Layers className="w-3 h-3" />
              <span>POC v0.2 — frontend only</span>
            </div>
          </div>
        </aside>
        <main className={`flex-1 px-6 py-6 mx-auto w-full ${tab === "coverage" ? "max-w-[1760px]" : "max-w-[1280px]"}`}>
          {children}
        </main>
      </div>
      <footer className="border-t border-slate-200 px-6 py-3 text-xs text-slate-500 bg-white">
        PLMS POC v0.2 | Anchor data: PT PLN (Persero) TJBB doc TJBB/01/04/2019/155 (Durikosambi - Daan Mogot Sirkit 1, Aug 2019). Other data synthetic for demonstration.
      </footer>
    </div>
  );
}

function NavButton({
  active,
  onClick,
  icon,
  label,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-2 py-2 text-sm flex items-center gap-2.5 rounded-md transition-colors ${
        active
          ? "bg-blue-50 text-blue-700 font-medium"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      {icon}
      <span className="flex-1">{label}</span>
      {badge != null && badge > 0 && (
        <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-amber-300 bg-amber-50 text-amber-700 font-semibold">
          {badge}
        </span>
      )}
    </button>
  );
}
