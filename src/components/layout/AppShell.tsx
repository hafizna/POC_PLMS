import { useState, type ReactNode } from "react";
import {
  ArrowLeft,
  BookOpen,
  Briefcase,
  Calculator,
  ChevronDown,
  ChevronRight,
  Database,
  FileCheck2,
  FileSearch,
  GitCompareArrows,
  Home,
  Inbox,
  Network,
  PackageOpen,
  ShieldCheck,
} from "lucide-react";
import { useProsetStore, type Tab } from "../../store/useProsetStore";
import { TopBar } from "./TopBar";

type NavItem = {
  id: Tab;
  label: string;
  icon: ReactNode;
  description?: string;
};

// Information architecture follows BUSINESS_PROCESS_BLUEPRINT.md §12:
// navigation follows work (case lifecycle), not implementation components.

const MY_WORK_ITEMS: NavItem[] = [
  {
    id: "cases",
    label: "Setting Cases",
    icon: <Briefcase className="h-4 w-4" />,
    description: "Antrian kerja & lifecycle case",
  },
];

const DATA_FOUNDATION_ITEMS: NavItem[] = [
  { id: "master-data", label: "Asset & Setting Explorer", icon: <Database className="h-4 w-4" /> },
  { id: "network-model", label: "Working Network", icon: <Network className="h-4 w-4" /> },
  { id: "source-index", label: "Dokumen Sumber", icon: <FileSearch className="h-4 w-4" /> },
  { id: "inbox", label: "Data Quality Queue", icon: <Inbox className="h-4 w-4" /> },
];

const LOCAL_AUDIT_ITEMS: NavItem[] = [
  { id: "audit-trail", label: "Local Audit (POC)", icon: <ShieldCheck className="h-4 w-4" /> },
];

// Tools that DO have an implemented, case-gated stage (scoping,
// data_change_preparation, study_preparation, calculation, coordination —
// see SettingCaseDetail.tsx's STAGE_TOOL) are deliberately NOT listed here
// anymore: they're only reachable by opening a Setting Case and clicking
// "Buka <tool>" from its current stage, never directly from the sidebar.
// This was a real source of confusion (same tool reachable two ways, one
// gated and one not) until the case-driven path covered everything P2
// (new_setting) needs — see IMPLEMENTATION_NOTES.md.
//
// P1 crosscheck tools are implemented but deliberately unavailable as direct
// navigation: open them from a Crosscheck Setting Case so the intake manifest
// and saved Verification Run retain their case context.
const COMING_SOON_ITEMS: NavItem[] = [
  {
    id: "comparison",
    label: "Actual Verification",
    icon: <GitCompareArrows className="h-4 w-4" />,
    description: "Buka dari Crosscheck Case: intake/verification",
  },
  {
    id: "vendor-import",
    label: "Vendor Import",
    icon: <PackageOpen className="h-4 w-4" />,
    description: "Buka dari Crosscheck Case: document/readback intake",
  },
  {
    id: "verified-report",
    label: "Verified Report",
    icon: <FileCheck2 className="h-4 w-4" />,
    description: "Buka dari Crosscheck Case: verification evidence",
  },
];

const LEGACY_ITEMS: NavItem[] = [
  { id: "home", label: "Legacy Home", icon: <Home className="h-4 w-4" /> },
  { id: "study-dashboard", label: "Bay List", icon: <BookOpen className="h-4 w-4" /> },
];

// COMING_SOON_ITEMS deliberately excluded: their tabs are case-gated, so
// they shouldn't be reachable directly from the mobile dropdown
// either (unlike the desktop sidebar, a <select> has no way to show
// "disabled, here's why" inline).
const ALL_ITEMS = [
  ...MY_WORK_ITEMS,
  ...DATA_FOUNDATION_ITEMS,
  ...LOCAL_AUDIT_ITEMS,
  ...LEGACY_ITEMS,
];

export function AppShell({ children }: { children: ReactNode }) {
  const tab = useProsetStore((state) => state.currentTab);
  const setTab = useProsetStore((state) => state.setTab);
  const openCaseWizard = useProsetStore((state) => state.openCaseWizard);
  const openedFromCaseId = useProsetStore((state) => state.openedFromCaseId);
  const clearOpenedFromCase = useProsetStore((state) => state.clearOpenedFromCase);
  const setActiveSettingCase = useProsetStore((state) => state.setActiveSettingCase);
  const openedFromCase = useProsetStore((state) =>
    openedFromCaseId
      ? state.settingCases.find((item) => item.id === openedFromCaseId)
      : undefined
  );
  const [comingSoonOpen, setComingSoonOpen] = useState(false);
  const [legacyOpen, setLegacyOpen] = useState(
    LEGACY_ITEMS.some((item) => item.id === tab)
  );

  const backToCase = () => {
    if (openedFromCaseId) {
      setActiveSettingCase(openedFromCaseId);
    }
    clearOpenedFromCase();
    setTab("cases");
  };

  // Manual sidebar/mobile navigation clears the case breadcrumb — it only
  // makes sense while following the "Buka <tool>" link from a specific case.
  const goToTab = (nextTab: Tab) => {
    if (openedFromCaseId) {
      clearOpenedFromCase();
    }
    setTab(nextTab);
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <TopBar />

      <div className="border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Workspace
        </label>
        <select
          value={tab}
          onChange={(event) => goToTab(event.target.value as Tab)}
          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800"
        >
          {ALL_ITEMS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-1">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
          <nav className="flex-1 space-y-6 px-3 py-5" aria-label="Main navigation">
            <section>
              <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                Primary Actions
              </div>
              <div className="space-y-1.5 px-1">
                <button
                  type="button"
                  onClick={() => openCaseWizard("new_setting")}
                  className="flex w-full items-center gap-2 rounded-lg bg-brand-ink px-2.5 py-2 text-left text-sm font-medium text-white shadow-sm hover:bg-black"
                >
                  <Calculator className="h-4 w-4 text-brand-accent" />
                  Targeted Recalculation
                </button>
                <button
                  type="button"
                  onClick={() => openCaseWizard("crosscheck")}
                  className="flex w-full items-center gap-2 rounded-lg border border-brand-accent/40 bg-brand-accent/10 px-2.5 py-2 text-left text-sm font-medium text-brand-accent-dark hover:bg-brand-accent/20"
                >
                  <GitCompareArrows className="h-4 w-4 text-brand-accent-dark" />
                  Cek Setting Aktual
                </button>
              </div>
            </section>

            <NavSection label="My Work">
              {MY_WORK_ITEMS.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={tab === item.id}
                  onClick={() => goToTab(item.id)}
                  prominent
                />
              ))}
            </NavSection>

            <NavSection label="Data Foundation">
              {DATA_FOUNDATION_ITEMS.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={tab === item.id}
                  onClick={() => goToTab(item.id)}
                />
              ))}
            </NavSection>

            <NavSection label="Governance">
              {LOCAL_AUDIT_ITEMS.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={tab === item.id}
                  onClick={() => goToTab(item.id)}
                />
              ))}
            </NavSection>

            <div>
              <button
                type="button"
                onClick={() => setComingSoonOpen((open) => !open)}
                className="mb-1 flex w-full items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 hover:text-slate-600"
                aria-expanded={comingSoonOpen}
              >
                <span>Case-gated Tools</span>
                {comingSoonOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
              {comingSoonOpen && (
                <div className="space-y-0.5">
                  {COMING_SOON_ITEMS.map((item) => (
                    <div
                      key={item.id}
                      title={item.description}
                      className="cursor-not-allowed rounded-lg px-2 py-1.5 text-xs text-slate-300"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="text-slate-300">{item.icon}</span>
                        <span className="font-medium">{item.label}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <button
                type="button"
                onClick={() => setLegacyOpen((open) => !open)}
                className="mb-1 flex w-full items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 hover:text-slate-600"
                aria-expanded={legacyOpen}
              >
                <span>Legacy</span>
                {legacyOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
              {legacyOpen && (
                <div className="space-y-0.5">
                  {LEGACY_ITEMS.map((item) => (
                    <NavButton
                      key={item.id}
                      item={item}
                      active={tab === item.id}
                      onClick={() => goToTab(item.id)}
                      compact
                    />
                  ))}
                </div>
              )}
            </div>
          </nav>

          <div className="border-t border-slate-200 px-5 py-4">
            <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
              Case-driven
            </div>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              E1/O1: recalculation dan actual crosscheck selalu dibuka melalui
              case aktif agar baseline, perubahan, evidence, dan keputusan tetap terikat.
            </p>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          {openedFromCaseId && tab !== "cases" && (
            <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 sm:px-6 lg:px-8">
              <p className="min-w-0 truncate text-xs text-amber-900">
                Dibuka dari Case{" "}
                <span className="font-semibold">
                  {openedFromCase ? openedFromCase.title : openedFromCaseId}
                </span>{" "}
                —{" "}
                {tab === "source-index"
                  ? openedFromCase?.baseline
                    ? "dokumen baru ditautkan sebagai evidence perubahan tanpa mengubah frozen baseline."
                    : "upload dokumen opsional; kembali ke Case untuk membekukan baseline bila tidak ada source baru."
                  : tab === "inbox"
                    ? "keputusan topology disimpan per case + relation dan tidak berlaku sebagai bulk approval."
                    : tab === "calculation" || tab === "coverage" || tab === "comparison" || tab === "vendor-import"
                      ? "hasil yang disimpan di sini otomatis ter-link ke case ini."
                      : "tool ini belum otomatis menyimpan hasil ke case tersebut."}
              </p>
              <button
                type="button"
                onClick={backToCase}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Kembali ke Case
              </button>
            </div>
          )}

          <main
            className={`mx-auto w-full flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-7 ${
              tab === "reference-setting"
                ? "max-w-[1520px]"
                : tab === "coverage"
                  ? "max-w-[1760px]"
                  : "max-w-[1280px]"
            }`}
          >
            {children}
          </main>
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-white px-6 py-3 text-xs text-slate-500">
        PLMS · E1 pilot: targeted recalculation Distance/LCD · full design from zero dan live Calculation Run masih terkunci.
      </footer>
    </div>
  );
}

function NavSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
        {label}
      </div>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function NavButton({
  item,
  active,
  onClick,
  prominent = false,
  compact = false,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
  prominent?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg text-left transition-colors ${
        compact ? "px-2 py-1.5 text-xs" : "px-2.5 py-2"
      } ${
        active
          ? prominent
            ? "bg-brand-ink text-white shadow-sm"
            : "bg-brand-accent/10 text-brand-accent-dark"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={active && prominent ? "text-brand-accent" : "text-slate-400"}>
          {item.icon}
        </span>
        <span className="font-medium">{item.label}</span>
      </div>
      {item.description && !compact && (
        <div className={`ml-6 mt-0.5 text-[10px] ${active && prominent ? "text-slate-400" : "text-slate-400"}`}>
          {item.description}
        </div>
      )}
    </button>
  );
}
