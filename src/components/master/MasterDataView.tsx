import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Cpu,
  Database,
  FileText,
  GitBranch,
  History,
  PencilLine,
  RadioTower,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  buildAssetSettingExplorer,
  type AssetExplorerEndpoint,
  type AssetExplorerLine,
  type AssetExplorerRelay,
} from "../../domain/asset-setting-explorer";
import { INVENTORY_MASTER_CASE_ID } from "../../domain/network-graph";
import { getConfirmedMasterNetwork } from "../../domain/study-network";
import {
  CHANGE_ITEM_LABEL,
  type ChangeItemKind,
} from "../../domain/setting-case";
import { useProsetStore } from "../../store/useProsetStore";

type DetailTab = "overview" | "endpoints" | "settings" | "evidence" | "activity";
type QualityFilter = "all" | "ready" | "issues";

export function MasterDataView() {
  const networkGraphOverrides = useProsetStore((state) => state.networkGraphOverrides);
  const ctVtOverrides = useProsetStore((state) => state.ctVtOverrides);
  const settingCases = useProsetStore((state) => state.settingCases);
  const sourceIntakeRecords = useProsetStore((state) => state.sourceIntakeRecords);
  const setActiveSettingCase = useProsetStore((state) => state.setActiveSettingCase);
  const setTab = useProsetStore((state) => state.setTab);
  const [query, setQuery] = useState("");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");
  const [substationFilter, setSubstationFilter] = useState("all");
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");

  const network = useMemo(
    () => getConfirmedMasterNetwork(networkGraphOverrides[INVENTORY_MASTER_CASE_ID]),
    [networkGraphOverrides]
  );
  const rows = useMemo(
    () =>
      buildAssetSettingExplorer({
        network,
        ctVtOverrides,
        settingCases,
        sourceRecords: sourceIntakeRecords,
      }),
    [ctVtOverrides, network, settingCases, sourceIntakeRecords]
  );
  const substations = useMemo(
    () =>
      Array.from(
        new Map(
          rows.flatMap((row) =>
            row.endpoints.map((endpoint) => [
              endpoint.substationId,
              { id: endpoint.substationId, label: endpoint.substationCode },
            ])
          )
        ).values()
      ).sort((a, b) => a.label.localeCompare(b.label)),
    [rows]
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        if (normalizedQuery && !row.searchText.includes(normalizedQuery)) return false;
        if (
          substationFilter !== "all" &&
          !row.endpoints.some((endpoint) => endpoint.substationId === substationFilter)
        ) {
          return false;
        }
        if (qualityFilter === "ready" && row.qualityIssues.length > 0) return false;
        if (qualityFilter === "issues" && row.qualityIssues.length === 0) return false;
        return true;
      }),
    [normalizedQuery, qualityFilter, rows, substationFilter]
  );
  const selected =
    filteredRows.find((row) => row.id === selectedLineId) ??
    filteredRows.find(
      (row) =>
        row.circuit === "1" &&
        row.searchText.includes("angke") &&
        row.searchText.includes("ancol")
    ) ??
    filteredRows[0];
  const issueRows = rows.filter((row) => row.qualityIssues.length > 0).length;
  const openCaseCount = rows.reduce((sum, row) => sum + row.openCases.length, 0);

  const openCase = (caseId: string) => {
    setActiveSettingCase(caseId);
    setTab("cases");
  };

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="rounded-lg border border-brand-accent/40 bg-brand-accent/10 p-2">
              <Database className="h-5 w-5 text-brand-accent-dark" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-950">
                  Asset &amp; Setting Explorer
                </h2>
                <Badge tone="blue">SSOT-1</Badge>
                <Badge tone="slate">read only</Badge>
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
                Satu projection dari confirmed protection graph. Cari ruas, lalu lihat
                endpoint, relay, CT/VT, setting, provenance, quality, dan case tanpa
                berpindah registry. Perubahan data tetap dilakukan melalui governed case.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-3 divide-x divide-slate-200 rounded-lg border border-slate-200 bg-slate-50">
            <Metric value={rows.length} label="ruas" />
            <Metric value={issueRows} label="perlu review" tone={issueRows ? "amber" : "slate"} />
            <Metric value={openCaseCount} label="open case" tone={openCaseCount ? "blue" : "slate"} />
          </div>
        </div>

        <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(280px,1fr)_220px_180px]">
          <label className="relative block">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari GI, bay, ruas, relay, source, atau function…"
              className="w-full rounded-md border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/20"
            />
          </label>
          <select
            value={substationFilter}
            onChange={(event) => setSubstationFilter(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="all">Semua GI/GIS</option>
            {substations.map((substation) => (
              <option key={substation.id} value={substation.id}>
                {substation.label}
              </option>
            ))}
          </select>
          <select
            value={qualityFilter}
            onChange={(event) => setQualityFilter(event.target.value as QualityFilter)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
          >
            <option value="all">Semua quality</option>
            <option value="ready">Tidak ada issue</option>
            <option value="issues">Perlu review</option>
          </select>
        </div>
      </section>

      <section className="grid min-h-[640px] overflow-hidden rounded-xl border border-slate-200 bg-white xl:grid-cols-[minmax(600px,1.18fr)_minmax(440px,0.82fr)]">
        <div className="min-w-0 border-b border-slate-200 xl:border-b-0 xl:border-r">
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-600">
                Line &amp; Bay Registry
              </div>
              <div className="mt-0.5 text-[10px] text-slate-500">
                {filteredRows.length} dari {rows.length} ruas
              </div>
            </div>
            <div className="text-[10px] text-slate-500">Klik baris untuk Asset 360</div>
          </div>
          <div className="max-h-[760px] overflow-auto">
            <table className="w-full min-w-[760px] text-left">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-white text-[10px] uppercase tracking-wider text-slate-500 shadow-sm">
                <tr>
                  <th className="px-3 py-2 font-medium">Ruas / circuit</th>
                  <th className="px-3 py-2 font-medium">Bay endpoints</th>
                  <th className="px-3 py-2 font-medium">Relay</th>
                  <th className="px-3 py-2 font-medium">Setting</th>
                  <th className="px-3 py-2 font-medium">Quality</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRows.map((row) => {
                  const active = selected?.id === row.id;
                  const relayLabels = row.endpoints
                    .flatMap((endpoint) => endpoint.relays)
                    .map((relay) => `${relay.make} ${relay.model}`.trim());
                  return (
                    <tr
                      key={row.id}
                      onClick={() => setSelectedLineId(row.id)}
                      className={`cursor-pointer align-top transition-colors ${
                        active ? "bg-brand-accent/10" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900">{row.label}</div>
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                          <span>#{row.circuit || "?"}</span>
                          <span>·</span>
                          <span>{row.voltageKv} kV</span>
                          <span>·</span>
                          <span className="font-mono">{row.id}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        <div>{row.endpoints[0].bayName}</div>
                        <div className="mt-1">{row.endpoints[1].bayName}</div>
                      </td>
                      <td className="max-w-52 px-3 py-2.5 text-xs text-slate-600">
                        {relayLabels.length > 0 ? (
                          <div className="space-y-1">
                            {relayLabels.slice(0, 2).map((label, index) => (
                              <div key={`${label}-${index}`} className="truncate" title={label}>
                                {label}
                              </div>
                            ))}
                            {relayLabels.length > 2 && (
                              <div className="text-[10px] text-slate-400">
                                +{relayLabels.length - 2} IED lain
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-amber-700">Belum terpetakan</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-mono text-xs font-semibold text-slate-800">
                          {row.settingCount}
                        </div>
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          {row.issuedSettingCount} issued · {row.actualSettingCount} actual
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <QualityBadge row={row} />
                        {row.openCases.length > 0 && (
                          <div className="mt-1 text-[10px] font-medium text-brand-accent-dark">
                            {row.openCases.length} open case
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filteredRows.length === 0 && (
              <div className="px-6 py-16 text-center text-sm text-slate-500">
                Tidak ada ruas yang cocok dengan filter ini.
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 bg-slate-50/40">
          {selected ? (
            <AssetDetail
              row={selected}
              activeTab={detailTab}
              onTabChange={setDetailTab}
              onOpenCase={openCase}
            />
          ) : (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-slate-500">
              Pilih satu ruas untuk membuka Asset 360.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function AssetDetail({
  row,
  activeTab,
  onTabChange,
  onOpenCase,
}: {
  row: AssetExplorerLine;
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
  onOpenCase: (caseId: string) => void;
}) {
  const openCaseWizard = useProsetStore((state) => state.openCaseWizard);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [proposalReason, setProposalReason] = useState<ChangeItemKind>("reconductoring");
  const tabs: Array<{ id: DetailTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "endpoints", label: "Endpoints" },
    { id: "settings", label: "Settings" },
    { id: "evidence", label: `Evidence ${row.evidence.length}` },
    { id: "activity", label: `Cases ${row.openCases.length}` },
  ];
  return (
    <div>
      <div className="border-b border-slate-200 bg-white px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-slate-950">{row.label}</h3>
              <Badge tone="slate">circuit {row.circuit || "?"}</Badge>
              <Badge tone={row.relation.status === "approved" ? "emerald" : "amber"}>
                {row.relation.status}
              </Badge>
            </div>
            <div className="mt-1 font-mono text-[10px] text-slate-400">{row.id}</div>
          </div>
          <div className="flex items-center gap-2">
            <QualityBadge row={row} />
            <button
              type="button"
              onClick={() => setProposalOpen((current) => !current)}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand-ink px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-black"
            >
              <PencilLine className="h-3.5 w-3.5" /> Usulkan perubahan
            </button>
          </div>
        </div>
        {proposalOpen && (
          <div className="mt-4 rounded-lg border border-brand-accent/40 bg-brand-accent/10 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-brand-accent-dark">
                  Governed data change
                </div>
                <p className="mt-1 max-w-xl text-[11px] leading-4 text-slate-600">
                  Pilih alasan bisnis. PLMS akan membuat Setting Case dengan stable scope
                  ruas ini; data aktif tidak berubah sampai activation policy terpenuhi.
                </p>
              </div>
              <Badge tone="emerald">active tetap read-only</Badge>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <select
                value={proposalReason}
                onChange={(event) =>
                  setProposalReason(event.target.value as ChangeItemKind)
                }
                className="rounded-md border border-brand-accent/40 bg-white px-3 py-2 text-xs text-slate-800"
              >
                {DATA_CHANGE_REASONS.map((reason) => (
                  <option key={reason} value={reason}>
                    {CHANGE_ITEM_LABEL[reason]}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() =>
                  openCaseWizard("new_setting", {
                    title: `${CHANGE_ITEM_LABEL[proposalReason]} · ${row.label} #${row.circuit || "?"}`,
                    description: `Usulan dimulai dari Asset & Setting Explorer untuk stable line ${row.id}.`,
                    primaryReason: proposalReason,
                    subjectLineId: row.id,
                    subjectBayId: row.endpoints[0].bayId,
                    subjectLabel: `${row.label} #${row.circuit || "?"}`,
                    substationIds: row.endpoints.map((endpoint) => endpoint.substationId),
                  })
                }
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-brand-ink px-3 py-2 text-xs font-semibold text-white hover:bg-black"
              >
                Buat Change Request <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="mt-2 grid gap-2 text-[10px] text-slate-500 sm:grid-cols-3">
              <span>Target: <b className="font-mono text-slate-700">{row.id}</b></span>
              <span>Baseline: effective revision saat freeze</span>
              <span>Provenance terindeks: {row.evidence.length}; evidence tetap di-link di case</span>
            </div>
          </div>
        )}
        <div className="mt-4 flex gap-1 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`shrink-0 rounded-md px-2.5 py-1.5 text-[11px] font-medium ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-h-[690px] overflow-auto p-4">
        {activeTab === "overview" && <OverviewTab row={row} />}
        {activeTab === "endpoints" && <EndpointsTab endpoints={row.endpoints} />}
        {activeTab === "settings" && <SettingsTab endpoints={row.endpoints} />}
        {activeTab === "evidence" && <EvidenceTab row={row} />}
        {activeTab === "activity" && (
          <ActivityTab row={row} onOpenCase={onOpenCase} />
        )}
      </div>
    </div>
  );
}

const DATA_CHANGE_REASONS: readonly ChangeItemKind[] = [
  "reconductoring",
  "ct_replacement",
  "vt_replacement",
  "relay_replacement",
  "remote_side_work",
  "topology_change",
  "data_correction",
];

function OverviewTab({ row }: { row: AssetExplorerLine }) {
  return (
    <div className="space-y-4">
      <DetailSection title="Identity & relation" icon={<GitBranch className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
          <Value label="From" value={`${row.endpoints[0].substationCode} · ${row.endpoints[0].bayName}`} />
          <Value label="To" value={`${row.endpoints[1].substationCode} · ${row.endpoints[1].bayName}`} />
          <Value label="Voltage" value={`${row.voltageKv} kV`} />
          <Value label="Circuit" value={row.circuit || "Belum ada"} />
          <Value label="Confidence" value={row.relation.confidence} />
          <Value label="Lifecycle" value={row.relation.status} />
        </div>
      </DetailSection>

      <DetailSection title="Electrical data" icon={<ShieldCheck className="h-4 w-4" />}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <TechnicalValue label="R1" value={formatNumber(row.relation.r1Ohm)} unit="Ω" />
          <TechnicalValue label="X1" value={formatNumber(row.relation.x1Ohm)} unit="Ω" />
          <TechnicalValue label="R0" value={formatNumber(row.relation.r0Ohm)} unit="Ω" />
          <TechnicalValue label="X0" value={formatNumber(row.relation.x0Ohm)} unit="Ω" />
          <TechnicalValue label="Length" value={formatNumber(row.relation.physicalLengthKm)} unit="km" />
          <TechnicalValue
            label="Rating"
            value={formatNumber(row.relation.currentRatingKa)}
            unit="kA"
          />
        </div>
      </DetailSection>

      <DetailSection title="Data readiness" icon={<AlertTriangle className="h-4 w-4" />}>
        {row.qualityIssues.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> Tidak ada structural issue pada projection ini.
          </div>
        ) : (
          <div className="space-y-2">
            {row.qualityIssues.map((issue) => (
              <div key={issue.code} className="flex items-start gap-2 text-xs text-slate-700">
                <span
                  className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                    issue.severity === "blocker" ? "bg-red-500" : "bg-amber-400"
                  }`}
                />
                <span>{issue.label}</span>
              </div>
            ))}
          </div>
        )}
      </DetailSection>
    </div>
  );
}

function EndpointsTab({ endpoints }: { endpoints: readonly AssetExplorerEndpoint[] }) {
  return (
    <div className="space-y-3">
      {endpoints.map((endpoint) => (
        <div key={endpoint.bayId} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-start gap-2">
            <RadioTower className="mt-0.5 h-4 w-4 text-brand-accent-dark" />
            <div>
              <div className="text-sm font-semibold text-slate-900">
                {endpoint.substationCode}
              </div>
              <div className="text-xs text-slate-600">{endpoint.substationName}</div>
              <div className="mt-1 text-xs font-medium text-slate-800">{endpoint.bayName}</div>
              <div className="mt-0.5 font-mono text-[10px] text-slate-400">{endpoint.bayId}</div>
            </div>
          </div>
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
            {endpoint.relays.length > 0 ? (
              endpoint.relays.map((relay) => <RelaySummary key={relay.id} relay={relay} />)
            ) : (
              <div className="text-xs text-amber-700">Belum ada relay yang terpetakan.</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function RelaySummary({ relay }: { relay: AssetExplorerRelay }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex items-start gap-2">
        <Cpu className="mt-0.5 h-3.5 w-3.5 text-slate-500" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-slate-900">
            {relay.make} {relay.model}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {relay.functions.map((fn) => (
              <Badge key={fn} tone="blue">{fn}</Badge>
            ))}
            {relay.functions.length === 0 && <Badge tone="amber">function unmapped</Badge>}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[10px] text-slate-500">
            <span>CT: {relay.ctRatio ?? ratioText(relay.ct?.primaryA, relay.ct?.secondaryA, "A")}</span>
            <span>VT: {relay.vtRatio ?? ratioText(relay.vt?.primaryKv, relay.vt?.secondaryV, "")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsTab({ endpoints }: { endpoints: readonly AssetExplorerEndpoint[] }) {
  const relays = endpoints.flatMap((endpoint) =>
    endpoint.relays.map((relay) => ({ relay, endpoint }))
  );
  return (
    <div className="space-y-3">
      {relays.map(({ relay, endpoint }) => (
        <div key={relay.id} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-slate-900">
                {endpoint.substationCode} · {relay.make} {relay.model}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-slate-400">{relay.id}</div>
            </div>
            <Badge tone={relay.setting ? "emerald" : "amber"}>
              {relay.setting ? relay.setting.status : "no typed setting"}
            </Badge>
          </div>
          {relay.setting ? (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {relay.setting.zones.map((zone) => (
                  <div key={zone.id} className="rounded border border-slate-200 bg-slate-50 p-2">
                    <div className="font-mono text-[10px] font-bold text-brand-accent-dark">{zone.id}</div>
                    <div className="mt-1 font-mono text-xs text-slate-800">
                      X {formatNumber(zone.xReachOhm)} Ω
                    </div>
                    <div className="font-mono text-[10px] text-slate-500">
                      t {formatNumber(zone.timeDelayPpS)} s
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 text-[10px] text-slate-500">
                Source: {relay.setting.sourceRef} · {relay.setting.direction}
              </div>
            </>
          ) : (
            <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
              Relay terdaftar, tetapi typed setting belum tersedia pada canonical graph.
            </div>
          )}
          {relay.settingRecords.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-slate-100 pt-2">
              {relay.settingRecords.map((record) => (
                <div key={record.id} className="flex items-center gap-2 text-[10px] text-slate-600">
                  <Badge tone={record.status === "issued" ? "emerald" : "slate"}>{record.status}</Badge>
                  <span className="truncate">{record.sourceRef}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      {relays.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Setting tidak dapat ditampilkan sebelum relay endpoint dipetakan.
        </div>
      )}
    </div>
  );
}

function EvidenceTab({ row }: { row: AssetExplorerLine }) {
  return (
    <div className="space-y-2">
      {row.evidence.map((evidence) => (
        <div key={`${evidence.kind}-${evidence.id}`} className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-start gap-2">
            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <div className="min-w-0 flex-1">
              <div className="break-words text-xs font-medium text-slate-900">{evidence.label}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge tone="slate">{evidence.kind}</Badge>
                {evidence.status && <Badge tone="blue">{evidence.status}</Badge>}
                {evidence.date && <span className="text-[10px] text-slate-400">{formatDate(evidence.date)}</span>}
              </div>
            </div>
          </div>
        </div>
      ))}
      {row.evidence.length === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          Belum ada provenance yang terhubung ke ruas ini.
        </div>
      )}
    </div>
  );
}

function ActivityTab({
  row,
  onOpenCase,
}: {
  row: AssetExplorerLine;
  onOpenCase: (caseId: string) => void;
}) {
  return (
    <div className="space-y-3">
      <DetailSection title="Current lifecycle" icon={<History className="h-4 w-4" />}>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">LineRelation</span>
          <Badge tone={row.relation.status === "approved" ? "emerald" : "amber"}>
            {row.relation.status}
          </Badge>
        </div>
        <div className="mt-2 text-[10px] text-slate-500">
          Detail revision history belum tersedia pada SSOT-1; UI tidak mengarang timestamp.
        </div>
      </DetailSection>
      <DetailSection title="Open Setting Cases" icon={<ClipboardList className="h-4 w-4" />}>
        {row.openCases.length > 0 ? (
          <div className="space-y-2">
            {row.openCases.map((settingCase) => (
              <button
                key={settingCase.id}
                type="button"
                onClick={() => onOpenCase(settingCase.id)}
                className="w-full rounded-md border border-slate-200 bg-slate-50 p-2.5 text-left hover:border-brand-accent/40 hover:bg-brand-accent/10"
              >
                <div className="text-xs font-semibold text-slate-900">{settingCase.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <Badge tone="blue">{settingCase.stage.replace(/_/g, " ")}</Badge>
                  <span className="text-[10px] text-slate-500">{settingCase.primaryReason.replace(/_/g, " ")}</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-500">Tidak ada open case yang terikat ke ruas ini.</div>
        )}
      </DetailSection>
    </div>
  );
}

function DetailSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-800">
        <span className="text-slate-500">{icon}</span>
        {title}
      </div>
      {children}
    </section>
  );
}

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-0.5 text-xs text-slate-800">{value}</div>
    </div>
  );
}

function TechnicalValue({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-1 font-mono text-xs font-semibold text-slate-800">
        {value} <span className="font-sans text-[10px] font-normal text-slate-400">{unit}</span>
      </div>
    </div>
  );
}

function QualityBadge({ row }: { row: AssetExplorerLine }) {
  const blockers = row.qualityIssues.filter((issue) => issue.severity === "blocker").length;
  const tone = blockers > 0 ? "red" : row.qualityIssues.length > 0 ? "amber" : "emerald";
  const label = blockers > 0 ? `${blockers} blocker` : row.qualityIssues.length > 0 ? `${row.qualityIssues.length} review` : "ready";
  return <Badge tone={tone}>{row.completenessPercent}% · {label}</Badge>;
}

function Badge({
  tone,
  children,
}: {
  tone: "blue" | "slate" | "amber" | "emerald" | "red";
  children: React.ReactNode;
}) {
  const styles = {
    blue: "border-brand-accent/40 bg-brand-accent/10 text-brand-accent-dark",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    red: "border-red-200 bg-red-50 text-red-700",
  }[tone];
  return (
    <span className={`inline-flex rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${styles}`}>
      {children}
    </span>
  );
}

function Metric({
  value,
  label,
  tone = "slate",
}: {
  value: number;
  label: string;
  tone?: "slate" | "amber" | "blue";
}) {
  const valueClass = tone === "amber" ? "text-amber-700" : tone === "blue" ? "text-brand-accent-dark" : "text-slate-900";
  return (
    <div className="min-w-20 px-3 py-2 text-center">
      <div className={`font-mono text-sm font-bold ${valueClass}`}>{value}</div>
      <div className="text-[9px] uppercase tracking-wider text-slate-400">{label}</div>
    </div>
  );
}

function formatNumber(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 }).format(value);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("id-ID");
}

function ratioText(primary?: number, secondary?: number, suffix = ""): string {
  if (primary === undefined || secondary === undefined) return "—";
  return `${primary}/${secondary}${suffix}`;
}
