import { lazy, Suspense } from "react";
import { AppShell } from "./components/layout/AppShell";
import { useProsetStore } from "./store/useProsetStore";

// Lazy-load each view so the initial JS bundle stays small. Each view has
// its own chunk; switching tab fetches that chunk on demand.
const HomeView = lazy(() =>
  import("./components/home/HomeView").then((m) => ({ default: m.HomeView }))
);
const MasterDataView = lazy(() =>
  import("./components/master/MasterDataView").then((m) => ({ default: m.MasterDataView }))
);
const StudyDashboardView = lazy(() =>
  import("./components/study/StudyDashboardView").then((m) => ({ default: m.StudyDashboardView }))
);
const NetworkModelView = lazy(() =>
  import("./components/network/NetworkModelView").then((m) => ({ default: m.NetworkModelView }))
);
const MiniNmmEditorView = lazy(() =>
  import("./components/network/MiniNmmEditorView").then((m) => ({ default: m.MiniNmmEditorView }))
);
const SourceIndexView = lazy(() =>
  import("./components/network/SourceIndexView").then((m) => ({ default: m.SourceIndexView }))
);
const InboxView = lazy(() =>
  import("./components/inbox/InboxView").then((m) => ({ default: m.InboxView }))
);
const LineRegistryView = lazy(() =>
  import("./components/registry/LineRegistryView").then((m) => ({ default: m.LineRegistryView }))
);
const CalculationView = lazy(() =>
  import("./components/calculation/CalculationView").then((m) => ({ default: m.CalculationView }))
);
const ComparisonView = lazy(() =>
  import("./components/comparison/ComparisonView").then((m) => ({ default: m.ComparisonView }))
);
const CoverageView = lazy(() =>
  import("./components/coverage/CoverageView").then((m) => ({ default: m.CoverageView }))
);
const VerifiedReportView = lazy(() =>
  import("./components/report/VerifiedReportView").then((m) => ({ default: m.VerifiedReportView }))
);
const AuditTrailView = lazy(() =>
  import("./components/governance/AuditTrailView").then((m) => ({ default: m.AuditTrailView }))
);

export function App() {
  const tab = useProsetStore((s) => s.currentTab);
  return (
    <AppShell>
      <Suspense fallback={<LoadingFallback />}>
        {tab === "home" ? (
          <HomeView />
        ) : tab === "master-data" ? (
          <MasterDataView />
        ) : tab === "study-dashboard" ? (
          <StudyDashboardView />
        ) : tab === "network-model" ? (
          <NetworkModelView />
        ) : tab === "mini-nmm-editor" ? (
          <MiniNmmEditorView />
        ) : tab === "source-index" ? (
          <SourceIndexView />
        ) : tab === "inbox" ? (
          <InboxView />
        ) : tab === "line-registry" ? (
          <LineRegistryView />
        ) : tab === "calculation" ? (
          <CalculationView />
        ) : tab === "comparison" ? (
          <ComparisonView />
        ) : tab === "coverage" ? (
          <CoverageView />
        ) : tab === "verified-report" ? (
          <VerifiedReportView />
        ) : (
          <AuditTrailView />
        )}
      </Suspense>
    </AppShell>
  );
}

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-sm text-slate-400">
      Loading...
    </div>
  );
}
