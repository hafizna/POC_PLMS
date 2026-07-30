import { useState, type ReactNode } from "react";
import {
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
  Library,
  Network,
  PackageOpen,
  Pencil,
  Route,
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
  { id: "master-data", label: "Data Teknis", icon: <Database className="h-4 w-4" /> },
  { id: "network-model", label: "Working Network", icon: <Network className="h-4 w-4" /> },
  { id: "source-index", label: "Dokumen Sumber", icon: <FileSearch className="h-4 w-4" /> },
  { id: "inbox", label: "Data Quality Queue", icon: <Inbox className="h-4 w-4" /> },
];

const LOCAL_AUDIT_ITEMS: NavItem[] = [
  { id: "audit-trail", label: "Local Audit (POC)", icon: <ShieldCheck className="h-4 w-4" /> },
];

const EXISTING_TOOL_ITEMS: NavItem[] = [
  { id: "line-registry", label: "Setting Register (POC)", icon: <Library className="h-4 w-4" /> },
  { id: "reference-setting", label: "Reference Setting (POC)", icon: <Calculator className="h-4 w-4" /> },
  { id: "calculation", label: "Calculation (POC)", icon: <Calculator className="h-4 w-4" /> },
  { id: "comparison", label: "Actual Verification (POC)", icon: <GitCompareArrows className="h-4 w-4" /> },
  { id: "coverage", label: "Coordination / Coverage (POC)", icon: <Route className="h-4 w-4" /> },
  { id: "network-graph-editor", label: "Network Builder (POC)", icon: <Pencil className="h-4 w-4" /> },
  { id: "vendor-import", label: "Vendor Import (POC)", icon: <PackageOpen className="h-4 w-4" /> },
  { id: "verified-report", label: "Verified Report (POC)", icon: <FileCheck2 className="h-4 w-4" /> },
];

const LEGACY_ITEMS: NavItem[] = [
  { id: "home", label: "Legacy Home", icon: <Home className="h-4 w-4" /> },
  { id: "study-dashboard", label: "Bay List", icon: <BookOpen className="h-4 w-4" /> },
];

const ALL_ITEMS = [
  ...MY_WORK_ITEMS,
  ...DATA_FOUNDATION_ITEMS,
  ...LOCAL_AUDIT_ITEMS,
  ...EXISTING_TOOL_ITEMS,
  ...LEGACY_ITEMS,
];

export function AppShell({ children }: { children: ReactNode }) {
  const tab = useProsetStore((state) => state.currentTab);
  const setTab = useProsetStore((state) => state.setTab);
  const openCaseWizard = useProsetStore((state) => state.openCaseWizard);
  const [toolsOpen, setToolsOpen] = useState(
    EXISTING_TOOL_ITEMS.some((item) => item.id === tab)
  );
  const [legacyOpen, setLegacyOpen] = useState(
    LEGACY_ITEMS.some((item) => item.id === tab)
  );

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <TopBar />

      <div className="border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
        <label className="block text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Workspace
        </label>
        <select
          value={tab}
          onChange={(event) => setTab(event.target.value as Tab)}
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
                  className="flex w-full items-center gap-2 rounded-lg bg-blue-600 px-2.5 py-2 text-left text-sm font-medium text-white shadow-sm hover:bg-blue-700"
                >
                  <Calculator className="h-4 w-4 text-blue-100" />
                  Calculate / Revise Setting
                </button>
                <button
                  type="button"
                  onClick={() => openCaseWizard("crosscheck")}
                  className="flex w-full items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-2.5 py-2 text-left text-sm font-medium text-blue-800 hover:bg-blue-100"
                >
                  <GitCompareArrows className="h-4 w-4 text-blue-500" />
                  Crosscheck Actual Setting
                </button>
              </div>
            </section>

            <NavSection label="My Work">
              {MY_WORK_ITEMS.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={tab === item.id}
                  onClick={() => setTab(item.id)}
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
                  onClick={() => setTab(item.id)}
                />
              ))}
            </NavSection>

            <NavSection label="Governance">
              {LOCAL_AUDIT_ITEMS.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={tab === item.id}
                  onClick={() => setTab(item.id)}
                />
              ))}
            </NavSection>

            <div>
              <button
                type="button"
                onClick={() => setToolsOpen((open) => !open)}
                className="mb-1 flex w-full items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-600 hover:text-amber-700"
                aria-expanded={toolsOpen}
              >
                <span>Existing Tools · not case-gated</span>
                {toolsOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
              {toolsOpen && (
                <div className="space-y-0.5">
                  {EXISTING_TOOL_ITEMS.map((item) => (
                    <NavButton
                      key={item.id}
                      item={item}
                      active={tab === item.id}
                      onClick={() => setTab(item.id)}
                      compact
                    />
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
                      onClick={() => setTab(item.id)}
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
              Sprint 4.1 aktif sampai Study Scenario Package. Tool lama belum case-gated.
            </p>
          </div>
        </aside>

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

      <footer className="border-t border-slate-200 bg-white px-6 py-3 text-xs text-slate-500">
        PLMS · Sprint 4.1: Flow Hardening & Scenario Package · Calculation masih terkunci.
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
            ? "bg-slate-900 text-white shadow-sm"
            : "bg-blue-50 text-blue-800"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={active && prominent ? "text-slate-300" : "text-slate-400"}>
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
