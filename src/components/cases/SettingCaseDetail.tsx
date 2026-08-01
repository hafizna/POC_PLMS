import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Ban,
  ExternalLink,
  Fingerprint,
  Link2,
  LockKeyhole,
  PauseCircle,
  PlayCircle,
} from "lucide-react";
import { useProsetStore, type Tab } from "../../store/useProsetStore";
import {
  applicableStages,
  CASE_TYPE_LABEL,
  isStageImplemented,
  isTerminalState,
  nextStageOf,
  PROCESS_CODE,
  STAGE_LABEL,
  stageGate,
  type SettingCase,
  type SettingCaseStage,
} from "../../domain/setting-case";
import { ProposedRevisionEditor } from "./ProposedRevisionEditor";
import { ImpactReadinessPanel } from "./ImpactReadinessPanel";
import { StudyBindingPanel } from "./StudyBindingPanel";
import { assessCrosscheckEvidence } from "../../domain/case-flow-hardening";
import { buildGraphForUltg } from "../../domain/graph-builder";
import { INVENTORY_MASTER_CASE_ID } from "../../domain/network-graph";
import { getConfirmedMasterNetwork } from "../../domain/study-network";
import {
  buildScopedTopologyCandidates,
  topologyDecisionKey,
} from "../../domain/topology-remediation";

// Which existing workspace(s) support the work of each stage. The case is
// the workflow container; the tools stay where they are and are opened
// in-context — this is now the ONLY way to reach these tools (sidebar's
// direct "Existing Tools" links were removed once every implemented P2
// stage had a home here, so a tool never floats free of its case).
const STAGE_TOOL: Partial<Record<SettingCaseStage, { tab: Tab; label: string }[]>> = {
  scoping: [
    { tab: "source-index", label: "Dokumen Sumber" },
    { tab: "network-model", label: "Working Network" },
    { tab: "inbox", label: "Topology Remediation" },
  ],
  document_audit: [
    { tab: "reference-setting", label: "Issued Reference" },
    { tab: "vendor-import", label: "TAP Intake" },
    { tab: "comparison", label: "Actual Verification" },
  ],
  actual_readback_intake: [
    { tab: "reference-setting", label: "Issued Reference" },
    { tab: "vendor-import", label: "Vendor Readback Intake" },
    { tab: "comparison", label: "Actual Verification" },
  ],
  data_change_preparation: [
    { tab: "inbox", label: "Topology Remediation" },
    { tab: "network-graph-editor", label: "Network Builder" },
  ],
  study_preparation: [
    { tab: "line-registry", label: "Setting Register" },
    { tab: "reference-setting", label: "Reference Setting" },
  ],
  calculation: [{ tab: "calculation", label: "Calculation Workbook" }],
  coordination: [{ tab: "coverage", label: "Coordination / Coverage" }],
  verification: [
    { tab: "comparison", label: "Actual Verification" },
    { tab: "verified-report", label: "Verified Report" },
  ],
};

export function SettingCaseDetail({
  settingCase,
  onBack,
}: {
  settingCase: SettingCase;
  onBack: () => void;
}) {
  const persona = useProsetStore((s) => s.currentPersona);
  const openToolFromCase = useProsetStore((s) => s.openToolFromCase);
  const selectLine = useProsetStore((s) => s.selectLine);
  const advanceStage = useProsetStore((s) => s.advanceSettingCaseStage);
  const freezeBaseline = useProsetStore((s) => s.freezeSettingCaseBaseline);
  const setStage = useProsetStore((s) => s.setSettingCaseStage);
  const linkToCase = useProsetStore((s) => s.linkToSettingCase);
  const unlinkFromCase = useProsetStore((s) => s.unlinkFromSettingCase);
  const sourceIntakeRecords = useProsetStore((s) => s.sourceIntakeRecords);
  const vendorImportDraft = useProsetStore((s) => s.vendorImportHandoffDraft);
  const masterNetworkOverride = useProsetStore(
    (state) => state.networkGraphOverrides[INVENTORY_MASTER_CASE_ID]
  );
  const graphBuildDecisions = useProsetStore((state) => state.graphBuildDecisions);

  const [advanceNote, setAdvanceNote] = useState("");
  const [attachSource, setAttachSource] = useState("");
  const [freezeErrors, setFreezeErrors] = useState<string[]>([]);

  const stages = useMemo(
    () =>
      applicableStages(
        settingCase.caseType,
        settingCase.changeItems,
        settingCase.impactAssessments,
        settingCase.flowProfile
      ),
    [
      settingCase.caseType,
      settingCase.changeItems,
      settingCase.flowProfile,
      settingCase.impactAssessments,
    ]
  );
  const currentIndex = stages.indexOf(settingCase.stage as SettingCaseStage);
  const terminal = isTerminalState(settingCase.stage);
  const next = nextStageOf(settingCase);
  const nextImplemented = next ? isStageImplemented(next) : false;
  const revisions = settingCase.proposedDataRevisions ?? [];
  const latestRevision = revisions[revisions.length - 1];
  const impactAssessments = settingCase.impactAssessments ?? [];
  const latestImpact = impactAssessments[impactAssessments.length - 1];
  const studyBindings = settingCase.studyBindings ?? [];
  const latestStudyBinding = studyBindings[studyBindings.length - 1];
  const studyPackages = settingCase.studyPackageBindings ?? [];
  const latestStudyPackage = studyPackages[studyPackages.length - 1];
  const linkedSources = sourceIntakeRecords.filter((item) =>
    settingCase.links.sourceIntakeIds.includes(item.id)
  );
  const crosscheckEvidence = assessCrosscheckEvidence(
    settingCase,
    linkedSources
  );
  const gate = stageGate(settingCase, {
    evidenceCount: settingCase.links.sourceIntakeIds.length,
    hasScenario: Boolean(settingCase.links.scenarioId),
    calculationCount: settingCase.links.calculationSnapshotIds.length,
    coordinationCheckCount: settingCase.links.coordinationCheckIds.length,
    changeSetCount: settingCase.links.engineeringChangeSetIds.length,
    persona,
    hasBaseline: Boolean(settingCase.baseline),
    proposedRevisionReady: latestRevision?.status === "ready_for_impact",
    impactAssessmentReady:
      latestImpact?.status === "ready_for_study" ||
      latestImpact?.status === "ready_without_study",
    studyBindingReady: latestStudyBinding?.status === "compatible",
    studyPackageReady: latestStudyPackage?.status === "compatible",
    crosscheckEvidenceBlockers: crosscheckEvidence.blockers,
    crosscheckEvidenceWarnings: crosscheckEvidence.warnings,
    crosscheckIntakeReady:
      settingCase.flowProfile.crosscheckMode === "issued_tap_document_audit"
        ? vendorImportDraft?.caseId === settingCase.id &&
          vendorImportDraft.adapterId === "tap-pdf-profile-v1"
        : vendorImportDraft?.caseId === settingCase.id &&
          vendorImportDraft.evidenceAuthority === "actual_readback" &&
          Boolean(vendorImportDraft.acquisitionManifest),
    verificationRunCount: settingCase.links.verificationRunIds?.length ?? 0,
  });
  const topologyGraph = useMemo(() => buildGraphForUltg(), []);
  const confirmedMaster = useMemo(
    () => getConfirmedMasterNetwork(masterNetworkOverride),
    [masterNetworkOverride]
  );
  const topologyCandidates = useMemo(
    () => buildScopedTopologyCandidates(topologyGraph.groups, {
      id: settingCase.id,
      subjectLineId: settingCase.protectedScope.subjectLineId,
      subjectBayId: settingCase.protectedScope.subjectBayId,
      substationIds: settingCase.protectedScope.substationIds,
    }),
    [settingCase.id, settingCase.protectedScope, topologyGraph.groups]
  );
  const pendingTopologyCount = topologyCandidates.filter((candidate) => {
    const decisionKey = topologyDecisionKey(settingCase.id, candidate.relation.id);
    return (
      !confirmedMaster.lineRelations.some((relation) => relation.id === candidate.relation.id) &&
      !graphBuildDecisions[decisionKey]
    );
  }).length;
  const rejectedTopologyCount = topologyCandidates.filter(
    (candidate) =>
      graphBuildDecisions[topologyDecisionKey(settingCase.id, candidate.relation.id)]?.status === "rejected"
  ).length;
  const subjectLineReady = settingCase.protectedScope.subjectLineId
    ? confirmedMaster.lineRelations.some(
        (relation) => relation.id === settingCase.protectedScope.subjectLineId
      )
    : settingCase.protectedScope.substationIds.length > 0 &&
      settingCase.protectedScope.substationIds.every((substationId) =>
        confirmedMaster.substations.some((station) => station.id === substationId)
      );
  const topologyReady =
    subjectLineReady && pendingTopologyCount === 0 && rejectedTopologyCount === 0;

  const stageTools = terminal
    ? undefined
    : STAGE_TOOL[settingCase.stage as SettingCaseStage];

  const openTool = (tab: Tab) => {
    if (settingCase.protectedScope.subjectLineId) {
      selectLine(settingCase.protectedScope.subjectLineId);
    } else if (settingCase.protectedScope.substationIds.length > 0) {
      // Case types without a required subject line (new_gi_insertion,
      // topology_change, policy_revision, data_correction, other) still
      // scope to at least one substation — without this fallback, opening
      // Working Network/Network Builder from one of these cases left
      // activeNetworkCaseId/activeNetworkLineId completely untouched,
      // showing whatever context was previously active (often the stale
      // demo case) instead of the GI this case is actually about.
      const group = topologyGraph.groups.find((g) =>
        settingCase.protectedScope.substationIds.includes(g.station.id)
      );
      const relation = group?.lineRelations[0];
      if (relation) {
        selectLine(relation.id);
      }
    }
    openToolFromCase(settingCase.id, tab);
  };

  return (
    <div>
      {/* masthead */}
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 self-center rounded border border-line bg-white px-2 py-1 font-mono text-[11px] text-ink-3 hover:text-ink"
        >
          <ArrowLeft className="h-3 w-3" /> ANTRIAN
        </button>
        <span className="font-mono text-xs font-bold tracking-[0.06em] text-amber-600">
          {PROCESS_CODE[settingCase.caseType]} · {CASE_TYPE_LABEL[settingCase.caseType].toUpperCase()}
        </span>
        <h1 className="w-full font-display text-[28px] font-bold leading-tight tracking-[-0.015em] text-ink sm:w-auto">
          {settingCase.title}
        </h1>
        <span className="ml-auto flex items-center gap-2 font-mono text-[12px] text-ink-3">
          <StatusBadge stage={settingCase.stage} />
          {settingCase.urgency !== "normal" && (
            <span className="font-bold uppercase text-red-600">{settingCase.urgency}</span>
          )}
        </span>
      </div>
      <div className="mb-4 mt-3 h-[2.5px] bg-ink" />

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="text-[13px] leading-[1.6] text-ink-2">
          <div>
            {settingCase.owningUnit}
            {settingCase.remoteUnit ? ` ↔ ${settingCase.remoteUnit}` : ""} · dibuat oleh{" "}
            {settingCase.createdBy}
            {settingCase.plannedEffectiveDate
              ? ` · rencana efektif ${settingCase.plannedEffectiveDate}`
              : ""}
          </div>
          {settingCase.protectedScope.subjectLabel && (
            <div className="font-mono text-[12px] text-ink">
              subject: {settingCase.protectedScope.subjectLabel}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {settingCase.stage === "on_hold" ? (
            <ActionButton
              icon={<PlayCircle className="h-3.5 w-3.5" />}
              label="Lanjutkan"
              tone="green"
              onClick={() => {
                const lastActive = [...settingCase.stageHistory]
                  .reverse()
                  .find((event) => !isTerminalState(event.stage));
                setStage(settingCase.id, lastActive?.stage ?? "draft", "Dilanjutkan dari hold");
              }}
            />
          ) : (
            !terminal &&
            settingCase.stage !== "closed" && (
              <ActionButton
                icon={<PauseCircle className="h-3.5 w-3.5" />}
                label="Hold"
                onClick={() => setStage(settingCase.id, "on_hold")}
              />
            )
          )}
          {!terminal && settingCase.stage !== "closed" && (
            <ActionButton
              icon={<Ban className="h-3.5 w-3.5" />}
              label="Batalkan"
              onClick={() => {
                if (
                  confirm(
                    "Batalkan case ini? Revisi usulannya ditutup tanpa mengubah data aktif."
                  )
                ) {
                  setStage(settingCase.id, "cancelled");
                }
              }}
            />
          )}
        </div>
      </div>

      <section className={`mb-5 rounded-lg border p-4 ${topologyReady ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className={`font-mono text-[10px] font-semibold uppercase tracking-wider ${topologyReady ? "text-emerald-700" : "text-amber-700"}`}>
              Topology readiness
            </div>
            <div className={`mt-1 text-sm font-semibold ${topologyReady ? "text-emerald-950" : "text-amber-950"}`}>
              {topologyReady ? "Scope topology tersedia" : "Scope topology perlu remediation"}
            </div>
            <p className={`mt-1 text-xs ${topologyReady ? "text-emerald-800" : "text-amber-800"}`}>
              {topologyReady
                ? topologyCandidates.length > 0
                  ? `${topologyCandidates.length} relation card sesuai scope case dan sudah tersedia pada confirmed master.`
                  : "Subject relation tersedia pada confirmed master; tidak memerlukan candidate card."
                : pendingTopologyCount > 0
                  ? `${pendingTopologyCount} kandidat relation menunggu keputusan engineer${rejectedTopologyCount > 0 ? `; ${rejectedTopologyCount} ditolak` : ""}.`
                  : rejectedTopologyCount > 0
                    ? `${rejectedTopologyCount} kandidat relation ditolak. Perbarui evidence endpoint/circuit sebelum diajukan kembali.`
                    : "Subject/endpoint case belum ditemukan pada source topology. Tambahkan evidence endpoint dan circuit; jangan gunakan relasi tebakan."}
            </p>
          </div>
          <button
            type="button"
            onClick={() => openTool("inbox")}
            className={`inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5 text-xs font-semibold ${topologyReady ? "border-emerald-300 text-emerald-800 hover:bg-emerald-100" : "border-amber-300 text-amber-800 hover:bg-amber-100"}`}
          >
            <ExternalLink className="h-3.5 w-3.5" /> {topologyReady ? "Lihat relation cards" : "Buka Topology Remediation"}
          </button>
        </div>
        {topologyReady && linkedSources.length === 0 && settingCase.stage === "scoping" && (
          <div className="mt-3 rounded-md border border-amber-200 bg-white px-3 py-2 text-xs text-amber-800">
            Topology sudah siap. Baseline belum dapat dibekukan karena bukti sumber masih 0;
            gunakan tombol <span className="font-semibold">Buka Dokumen Sumber</span> pada gate stage untuk stage dan menautkan evidence.
          </div>
        )}
      </section>

      {/* stage chain */}
      <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-2">
        Alur Stage — rute {PROCESS_CODE[settingCase.caseType]} ({stages.length} stage)
      </p>
      <div className="flex flex-wrap items-stretch">
        {stages.map((stage, index) => {
          const done = currentIndex > index || settingCase.stage === "closed";
          const current = settingCase.stage === stage;
          const implemented = isStageImplemented(stage);
          return (
            <div
              key={stage}
              className={`min-w-[96px] flex-1 border px-2.5 py-2 ${
                index === 0 ? "rounded-l-md" : "border-l-0"
              } ${index === stages.length - 1 ? "rounded-r-md" : ""} ${
                current
                  ? "border-[#b9d0fa] bg-[#eaf1fe]"
                  : done
                    ? "border-line bg-[#f0f7f1]"
                    : "border-line bg-[#f7f9fc]"
              }`}
            >
              <div className="font-mono text-[9px] tracking-[0.07em] text-ink-4">
                S{index + 1}
              </div>
              <div
                className={`mt-0.5 text-[11.5px] font-semibold leading-tight ${
                  current ? "text-blue-700" : done ? "text-emerald-700" : "text-ink-3"
                }`}
              >
                {STAGE_LABEL[stage]}
              </div>
              <div className="mt-0.5 font-mono text-[9.5px] text-ink-4">
                {current
                  ? "AKTIF"
                  : done
                    ? "SELESAI"
                    : implemented
                      ? "TERSEDIA"
                      : "RENCANA"}
              </div>
            </div>
          );
        })}
      </div>

      {/* gate + advance */}
      {!terminal && settingCase.stage !== "closed" && (
        <div className="mt-3 rounded-lg border border-line bg-white p-4">
          {gate.blockers.map((blocker) => (
            <div
              key={blocker}
              className="mb-2 flex items-start gap-2 border-l-2 border-red-600 bg-red-50 py-2 pl-3 pr-2 text-[12.5px] text-red-700"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {blocker}
            </div>
          ))}
          {gate.warnings.map((warning) => (
            <div
              key={warning}
              className="mb-2 flex items-start gap-2 border-l-2 border-amber-500 bg-amber-50 py-2 pl-3 pr-2 text-[12.5px] text-amber-800"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {warning}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            {settingCase.stage === "scoping" && (
              <button
                type="button"
                disabled={gate.blockers.length > 0}
                onClick={() => {
                  const result = freezeBaseline(settingCase.id);
                  setFreezeErrors(result.ok ? [] : result.errors);
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                <LockKeyhole className="h-3.5 w-3.5" /> Bekukan baseline
              </button>
            )}
            {next && nextImplemented && settingCase.stage !== "scoping" && (
              <>
                <input
                  value={advanceNote}
                  onChange={(e) => setAdvanceNote(e.target.value)}
                  placeholder="Catatan keputusan (opsional)"
                  className="w-64 rounded-md border border-line px-2.5 py-1.5 text-xs"
                />
                <button
                  type="button"
                  disabled={gate.blockers.length > 0}
                  onClick={() => {
                    advanceStage(settingCase.id, advanceNote.trim() || undefined);
                    setAdvanceNote("");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  Lanjut ke {STAGE_LABEL[next]} <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </>
            )}
            {stageTools?.map((tool) => (
              <button
                key={tool.tab}
                type="button"
                onClick={() => openTool(tool.tab)}
                className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-3 py-1.5 text-xs font-semibold text-ink-2 hover:border-blue-300 hover:text-blue-700"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Buka {tool.label}
              </button>
            ))}
            {!terminal && !stageTools && isStageImplemented(settingCase.stage as SettingCaseStage) && (
              <span className="text-xs text-ink-4">
                Belum ada tool yang dipetakan untuk tahap {STAGE_LABEL[settingCase.stage]}.
              </span>
            )}
          </div>
          {freezeErrors.map((error) => (
            <div key={error} className="mt-2 text-xs text-red-700">
              {error}
            </div>
          ))}
          {next && !nextImplemented && (
            <div className="mt-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
              Boundary Sprint 4.1 tercapai. Stage berikutnya, {STAGE_LABEL[next]}, sudah
              tercantum pada flow contract tetapi handler operasionalnya belum
              diimplementasikan.
            </div>
          )}
        </div>
      )}

      <FlowProfileCard settingCase={settingCase} />

      {settingCase.baseline && (
        <section className="mt-4 rounded-lg border border-indigo-200 bg-indigo-50/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <LockKeyhole className="h-4 w-4 text-indigo-700" />
                <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-indigo-800">
                  Immutable Case Baseline
                </p>
              </div>
              <p className="mt-1 text-xs text-indigo-900">
                Dibekukan {new Date(settingCase.baseline.frozenAt).toLocaleString("id-ID")} oleh{" "}
                {settingCase.baseline.frozenBy}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded border border-indigo-300 bg-white px-2 py-1 font-mono text-[10px] text-indigo-800">
              <Fingerprint className="h-3.5 w-3.5" />
              {settingCase.baseline.fingerprint.value}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <BaselineMetric label="Evidence" value={settingCase.baseline.evidence.length} />
            <BaselineMetric
              label="GI"
              value={settingCase.baseline.network.substations.length}
            />
            <BaselineMetric label="Bay" value={settingCase.baseline.network.bays.length} />
            <BaselineMetric
              label="Line"
              value={settingCase.baseline.network.lineRelations.length}
            />
            <BaselineMetric
              label="Relay"
              value={settingCase.baseline.network.relayIeds.length}
            />
          </div>
          {settingCase.baseline.issues.length > 0 && (
            <div className="mt-3 space-y-1.5 rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-amber-800">
                Frozen with {settingCase.baseline.issues.length} readiness issue
              </div>
              {settingCase.baseline.issues.map((issue) => (
                <div
                  key={issue.code}
                  className="flex items-start gap-2 text-xs text-amber-800"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {issue.message}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {settingCase.stage === "data_change_preparation" && (
        <ProposedRevisionEditor settingCase={settingCase} />
      )}
      {settingCase.stage === "impact_and_readiness" && (
        <ImpactReadinessPanel settingCase={settingCase} />
      )}
      {settingCase.stage === "study_preparation" && (
        <StudyBindingPanel settingCase={settingCase} />
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="space-y-4 rounded-lg border border-line bg-white p-4">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-2">
            Artefak Ter-link
          </p>

          <LinkGroup
            title={`Bukti sumber (${linkedSources.length})`}
            emptyText="Belum ada dokumen konteks yang ditautkan."
          >
            {linkedSources.map((record) => (
              <LinkRow
                key={record.id}
                label={record.fileName}
                meta={`${record.documentType} · ${record.status}`}
                onRemove={
                  settingCase.baseline
                    ? undefined
                    : () =>
                        unlinkFromCase(settingCase.id, {
                          kind: "source",
                          refId: record.id,
                        })
                }
              />
            ))}
            {!settingCase.baseline && (
              <AttachPicker
                value={attachSource}
                onChange={setAttachSource}
                options={sourceIntakeRecords
                  .filter((record) => !settingCase.links.sourceIntakeIds.includes(record.id))
                  .map((record) => ({ id: record.id, label: record.fileName }))}
                onAttach={(refId) => {
                  linkToCase(settingCase.id, { kind: "source", refId });
                  setAttachSource("");
                }}
              />
            )}
          </LinkGroup>

          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-xs text-slate-600">
            Study Scenario hanya ditautkan melalui package compatibility binding.
            Calculation run kini dapat ditautkan lewat Calculation Workbook
            (Sprint 5). Coordination, approval, commissioning, dan verification
            belum dapat dieksekusi.
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white p-4">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-2">
            Riwayat Stage
          </p>
          <div className="mt-3 space-y-2">
            {[...settingCase.stageHistory].reverse().map((event, index) => (
              <div
                key={`${event.stage}_${event.at}_${index}`}
                className="flex items-baseline gap-2.5 text-[12.5px]"
              >
                <span className="w-28 shrink-0 font-mono text-[10.5px] tabular-nums text-ink-4">
                  {new Date(event.at).toLocaleString("id-ID", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <div>
                  <span className="font-semibold text-ink">{STAGE_LABEL[event.stage]}</span>
                  <span className="text-ink-3"> · {event.actor}</span>
                  {event.note && <div className="text-ink-3">{event.note}</div>}
                </div>
              </div>
            ))}
          </div>
          {settingCase.description && (
            <>
              <p className="mt-5 font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-2">
                Konteks
              </p>
              <p className="mt-1.5 text-[12.5px] leading-[1.6] text-ink-2">
                {settingCase.description}
              </p>
            </>
          )}
          {settingCase.changeItems.length > 0 && (
            <>
              <p className="mt-5 font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-2">
                Change Items
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {settingCase.changeItems.map((item) => (
                  <span
                    key={item.id}
                    className="rounded-full border border-line bg-[#f7f9fc] px-2.5 py-0.5 font-mono text-[10.5px] text-ink-2"
                  >
                    {item.kind.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function FlowProfileCard({ settingCase }: { settingCase: SettingCase }) {
  const profile = settingCase.flowProfile;
  return (
    <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-2">
            Case Flow Profile
          </p>
          <p className="mt-1 text-xs text-ink-3">
            {profile.authority.ownerLevel} · {profile.authority.ownerUnit} ·{" "}
            {profile.lifecycleIntent.replace(/_/g, " ")}
          </p>
        </div>
        <span className="rounded border border-slate-300 bg-slate-50 px-2 py-1 font-mono text-[9.5px] uppercase text-slate-600">
          activation: {profile.activation.mode.replace(/_/g, " ")}
        </span>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <FlowMetric label="Maker" value={profile.authority.maker} />
        <FlowMetric label="Checker" value={profile.authority.checkerRole} />
        <FlowMetric label="Approver" value={profile.authority.approverRole} />
        <FlowMetric
          label="Notify / acknowledge"
          value={profile.authority.notifiedUnits.join(", ") || "—"}
        />
      </div>
      {profile.crosscheckMode && (
        <div className="mt-3 rounded border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
          P1 mode: <b>{profile.crosscheckMode.replace(/_/g, " ")}</b>. PDF TAP
          membuktikan issued document; native relay export membuktikan actual readback.
        </div>
      )}
      {profile.temporaryPolicy && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          Temporary emergency · expiry{" "}
          {profile.temporaryPolicy.expiresAt ?? "belum ditetapkan"} · restoration
          wajib. {profile.temporaryPolicy.emergencyReason}
        </div>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
        {profile.activation.rationale}
      </p>
    </section>
  );
}

function FlowMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-line bg-[#f7f9fc] px-2.5 py-2">
      <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink-4">
        {label}
      </div>
      <div className="mt-0.5 text-xs font-medium text-ink">{value}</div>
    </div>
  );
}

export function StatusBadge({ stage }: { stage: SettingCase["stage"] }) {
  const cls =
    stage === "closed"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : stage === "cancelled" || stage === "rejected"
        ? "border-red-200 bg-red-50 text-red-600"
        : stage === "on_hold"
          ? "border-amber-300 bg-amber-50 text-amber-700"
          : "border-[#b9d0fa] bg-[#eaf1fe] text-blue-700";
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.04em] ${cls}`}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "green" | "red";
}) {
  const cls =
    tone === "green"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700"
      : tone === "red"
        ? "border-red-200 bg-white text-red-600 hover:bg-red-50"
        : "border-line bg-white text-ink-2 hover:bg-slate-50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${cls}`}
    >
      {icon}
      {label}
    </button>
  );
}

function LinkGroup({
  title,
  emptyText,
  children,
}: {
  title: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const hasContent = Array.isArray(children)
    ? children.some((child) => (Array.isArray(child) ? child.length > 0 : Boolean(child)))
    : Boolean(children);
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-ink">
        <Link2 className="h-3 w-3 text-ink-4" /> {title}
      </div>
      <div className="mt-1.5 space-y-1.5">
        {!hasContent && <div className="text-[11px] text-ink-4">{emptyText}</div>}
        {children}
      </div>
    </div>
  );
}

function LinkRow({
  label,
  meta,
  onRemove,
}: {
  label: string;
  meta: string;
  onRemove?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-line bg-[#f7f9fc] px-2.5 py-1.5">
      <div className="min-w-0">
        <div className="truncate text-xs font-medium text-ink">{label}</div>
        <div className="font-mono text-[10px] text-ink-3">{meta}</div>
      </div>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 font-mono text-[10px] text-ink-4 hover:text-red-500"
        >
          lepas
        </button>
      ) : (
        <span className="shrink-0 font-mono text-[9px] uppercase text-indigo-600">
          frozen
        </span>
      )}
    </div>
  );
}

function BaselineMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-indigo-100 bg-white px-2.5 py-2">
      <div className="font-mono text-lg font-bold text-indigo-900">{value}</div>
      <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-indigo-500">
        {label}
      </div>
    </div>
  );
}

function AttachPicker({
  value,
  onChange,
  options,
  onAttach,
  attachLabel = "Link",
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ id: string; label: string }>;
  onAttach: (refId: string) => void;
  attachLabel?: string;
}) {
  const [selected, setSelected] = useState(value);
  if (options.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
        Belum ada dokumen yang dapat ditautkan. Gunakan Buka Dokumen Sumber untuk
        stage evidence langsung dalam konteks case ini.
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={selected}
        onChange={(e) => {
          setSelected(e.target.value);
          onChange(e.target.value);
        }}
        className="min-w-0 flex-1 rounded-md border border-line px-2 py-1 text-[11px]"
      >
        <option value="">— pilih untuk link —</option>
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!selected}
        onClick={() => {
          if (selected) {
            onAttach(selected);
            setSelected("");
          }
        }}
        className="rounded-md border border-line px-2 py-1 font-mono text-[10.5px] font-semibold text-ink-2 disabled:opacity-40"
      >
        {attachLabel}
      </button>
    </div>
  );
}
