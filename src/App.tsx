import { lazy, Suspense } from "react";
import { AppShell } from "./components/layout/AppShell";
import { useProsetStore } from "./store/useProsetStore";

// Lazy-load each view so the initial JS bundle stays small. Each view has
// its own chunk; switching tab fetches that chunk on demand.
const HomeView = lazy(() =>
  import("./components/home/HomeView").then((m) => ({ default: m.HomeView }))
);
const CaseWorkQueueView = lazy(() =>
  import("./components/cases/CaseWorkQueueView").then((m) => ({
    default: m.CaseWorkQueueView,
  }))
);
const ReferenceSettingView = lazy(() =>
  import("./components/reference/ReferenceSettingView").then((m) => ({
    default: m.ReferenceSettingView,
  }))
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
const NetworkGraphEditorView = lazy(() =>
  import("./components/network/NetworkGraphEditorView").then((m) => ({ default: m.NetworkGraphEditorView }))
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
const ActualVerificationView = lazy(() =>
  import("./components/verification/ActualVerificationView").then((m) => ({
    default: m.ActualVerificationView,
  }))
);
const VendorImportView = lazy(() =>
  import("./components/import/VendorImportView").then((m) => ({
    default: m.VendorImportView,
  }))
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
        {tab === "cases" ? (
          <CaseWorkQueueView />
        ) : tab === "reference-setting" ? (
          <ReferenceSettingView />
        ) : tab === "home" ? (
          <HomeView />
        ) : tab === "master-data" ? (
          <MasterDataView />
        ) : tab === "study-dashboard" ? (
          <StudyDashboardView />
        ) : tab === "network-model" ? (
          <NetworkModelView />
        ) : tab === "network-graph-editor" ? (
          <NetworkGraphEditorView />
        ) : tab === "source-index" ? (
          <SourceIndexView />
        ) : tab === "inbox" ? (
          <InboxView />
        ) : tab === "line-registry" ? (
          <LineRegistryView />
        ) : tab === "calculation" ? (
          <CalculationView />
        ) : tab === "comparison" ? (
          <ActualVerificationView />
        ) : tab === "vendor-import" ? (
          <VendorImportView />
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
