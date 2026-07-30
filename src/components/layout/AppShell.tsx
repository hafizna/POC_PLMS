import { useState, type ReactNode } from "react";
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

const PRIMARY_ITEMS: NavItem[] = [
  {
    id: "reference-setting",
    label: "Reference Setting",
    icon: <Calculator className="h-4 w-4" />,
    description: "OCR/GFR, trafo & distance",
  },
  {
    id: "comparison",
    label: "Actual Verification",
    icon: <GitCompareArrows className="h-4 w-4" />,
    description: "Manual / CSV vs reference",
  },
  {
    id: "vendor-import",
    label: "Vendor Import",
    icon: <PackageOpen className="h-4 w-4" />,
    description: ".set & TAP parser",
  },
];

const DATA_ITEMS: NavItem[] = [
  { id: "master-data", label: "Data Teknis", icon: <Database className="h-4 w-4" /> },
  { id: "source-index", label: "Dokumen Sumber", icon: <FileSearch className="h-4 w-4" /> },
];

const NEXT_PHASE_ITEMS: NavItem[] = [
  { id: "calculation", label: "Calculation POC", icon: <Calculator className="h-4 w-4" /> },
];

const EXPERIMENTAL_ITEMS: NavItem[] = [
  { id: "home", label: "Legacy Home", icon: <Home className="h-4 w-4" /> },
  { id: "network-model", label: "Working Network", icon: <Network className="h-4 w-4" /> },
  { id: "network-graph-editor", label: "Network Builder", icon: <Pencil className="h-4 w-4" /> },
  { id: "inbox", label: "Mapping Inbox", icon: <Inbox className="h-4 w-4" /> },
  { id: "study-dashboard", label: "Bay List", icon: <BookOpen className="h-4 w-4" /> },
  { id: "line-registry", label: "Setting Register", icon: <Library className="h-4 w-4" /> },
  { id: "coverage", label: "Coverage Check", icon: <Route className="h-4 w-4" /> },
  { id: "verified-report", label: "Verified Report", icon: <FileCheck2 className="h-4 w-4" /> },
  { id: "audit-trail", label: "Audit Trail", icon: <ShieldCheck className="h-4 w-4" /> },
];

const ALL_ITEMS = [
  ...PRIMARY_ITEMS,
  ...DATA_ITEMS,
  ...NEXT_PHASE_ITEMS,
  ...EXPERIMENTAL_ITEMS,
];

export function AppShell({ children }: { children: ReactNode }) {
  const tab = useProsetStore((state) => state.currentTab);
  const setTab = useProsetStore((state) => state.setTab);
  const [experimentalOpen, setExperimentalOpen] = useState(
    EXPERIMENTAL_ITEMS.some((item) => item.id === tab)
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
            <NavSection label="MVP 1A–1C">
              {PRIMARY_ITEMS.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={tab === item.id}
                  onClick={() => setTab(item.id)}
                  prominent
                />
              ))}
            </NavSection>

            <NavSection label="Reference Data">
              {DATA_ITEMS.map((item) => (
                <NavButton
                  key={item.id}
                  item={item}
                  active={tab === item.id}
                  onClick={() => setTab(item.id)}
                />
              ))}
            </NavSection>

            <NavSection label="Next Phase">
              {NEXT_PHASE_ITEMS.map((item) => (
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
                onClick={() => setExperimentalOpen((open) => !open)}
                className="mb-1 flex w-full items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 hover:text-slate-600"
                aria-expanded={experimentalOpen}
              >
                <span>Experimental</span>
                {experimentalOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
              {experimentalOpen && (
                <div className="space-y-0.5">
                  {EXPERIMENTAL_ITEMS.map((item) => (
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
              Workbook-backed
            </div>
            <p className="mt-1 text-[11px] leading-4 text-slate-500">
              Formula reference dapat berjalan tanpa menunggu NMM.
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
        PLMS MVP 1A–1C · Reference, crosscheck, dan vendor ingestion · NMM tidak menjadi dependency.
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
            ? "bg-blue-600 text-white shadow-sm"
            : "bg-blue-50 text-blue-800"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className={active && prominent ? "text-blue-100" : "text-slate-400"}>
          {item.icon}
        </span>
        <span className="font-medium">{item.label}</span>
      </div>
      {item.description && !compact && (
        <div className={`ml-6 mt-0.5 text-[10px] ${active ? "text-blue-100" : "text-slate-400"}`}>
          {item.description}
        </div>
      )}
    </button>
  );
}
