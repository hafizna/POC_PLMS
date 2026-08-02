import { useState, useEffect } from "react";
import { ArrowRight, FileDiff, Plus, RotateCcw, Trash2, Undo2, X } from "lucide-react";
import type {
  Bay,
  Busbar,
  LineRelation,
  RelayIED,
  SubstationKind,
  Terminal,
  UnifiedNetwork,
  UnifiedSubstation,
} from "../../domain/unified";
import { normalizeStationName, normalizeSubstationIdentity } from "../../domain/normalization";
import { useProsetStore, type CtVtOverride, type CtVtOverrideInput, type NetworkGraphOverride } from "../../store/useProsetStore";
import {
  LCD_DIST_REGISTRY,
  mapLcdDistCandidatesToLines,
} from "../../domain/lcd-dist-import";
import {
  OCR_REGISTRY,
  mapOcrCandidatesToLines,
} from "../../domain/ocr-import";
import {
  networkLinesFromGraph,
  networkNodesFromGraph,
} from "../../domain/network-graph";
import {
  ctRatioText,
  getEffectiveCtVt,
  makeCtSpec,
  makeVtSpec,
  parseCtRatio,
  parseVtRatio,
  vtRatioText,
} from "../../domain/instrument-transformers";
import type { EngineeringChangeSet } from "../../domain/engineering-change";
import { evaluateDataReadiness } from "../../domain/engineering-readiness";
import {
  buildDigsilentStagingPackage,
  serializeNeutralDgsPreview,
  serializeStagingLinesCsv,
  serializeStagingPackageJson,
} from "../../domain/digsilent-staging";

type RecentAdd = {
  kind: "substation" | "relation" | "ied" | "insertion";
  label: string;
  matchCount: number;
};

type SegmentElectricalDraft = {
  lengthKm: string;
  r1Ohm: string;
  x1Ohm: string;
  r0Ohm: string;
  x0Ohm: string;
};

const EMPTY_SEGMENT_ELECTRICAL: SegmentElectricalDraft = {
  lengthKm: "",
  r1Ohm: "",
  x1Ohm: "",
  r0Ohm: "",
  x0Ohm: "",
};

type Props = {
  caseId: string;
  networkGraph?: UnifiedNetwork;
  override?: NetworkGraphOverride;
};

export function NetworkGraphEditor({ caseId, networkGraph, override }: Props) {
  const addSubstationBundle = useProsetStore((s) => s.addNetworkGraphSubstationBundle);
  const addRelationBundle = useProsetStore((s) => s.addNetworkGraphRelationBundle);
  const insertSubstationIntoLine = useProsetStore((s) => s.insertSubstationIntoLine);
  const addIed = useProsetStore((s) => s.addNetworkGraphIed);
  const ctVtOverrides = useProsetStore((s) => s.ctVtOverrides);
  const updateCtVtOverride = useProsetStore((s) => s.updateCtVtOverride);
  const clearCtVtOverride = useProsetStore((s) => s.clearCtVtOverride);
  const removeEntry = useProsetStore((s) => s.removeNetworkGraphEntry);
  const resetOverrides = useProsetStore((s) => s.resetNetworkGraphOverrides);
  const undoStack = useProsetStore((s) => s.networkUndoStack[caseId] ?? []);
  const undoLastNetworkChange = useProsetStore((s) => s.undoLastNetworkChange);
  const allChangeSets = useProsetStore((s) => s.engineeringChangeSets);
  const changeSets = allChangeSets.filter(
    (changeSet) => changeSet.caseId === caseId
  );
  const setTab = useProsetStore((s) => s.setTab);
  const selectLine = useProsetStore((s) => s.selectLine);

  const [recent, setRecent] = useState<RecentAdd | null>(null);

  // Auto-dismiss the recent-add toast after 12s.
  useEffect(() => {
    if (!recent) return;
    const handle = setTimeout(() => setRecent(null), 12_000);
    return () => clearTimeout(handle);
  }, [recent]);

  if (!networkGraph) return null;

  // Count how many import records would now match this freshly-added relation.
  // Computed against the post-add network so the toast shows the user a
  // meaningful "go review N candidates" CTA.
  const computeMatchCount = (newRelationId: string | null): number => {
    if (!newRelationId) return 0;
    const nodes = networkNodesFromGraph(networkGraph);
    const lines = networkLinesFromGraph(networkGraph);
    const lcd = mapLcdDistCandidatesToLines(LCD_DIST_REGISTRY.records, nodes, lines);
    const ocr = mapOcrCandidatesToLines(OCR_REGISTRY.records, nodes, lines);
    return (
      lcd.filter((c) => c.matchedLineId === newRelationId).length +
      ocr.filter((c) => c.matchedLineId === newRelationId).length
    );
  };

  const overrideCount =
    (override?.substations?.length ?? 0) +
    (override?.busbars?.length ?? 0) +
    (override?.bays?.length ?? 0) +
    (override?.terminals?.length ?? 0) +
    (override?.relations?.length ?? 0) +
    (override?.ieds?.length ?? 0);

  return (
    <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="border-b border-slate-200 px-4 py-2 bg-slate-50 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-xs uppercase tracking-wider font-semibold text-slate-600">Network Builder</h3>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Tambah GI/GIS, relation, dan IED untuk melengkapi active study network. Tersimpan di localStorage.
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] px-2 py-1 rounded border border-brand-accent/40 bg-brand-accent/10 text-brand-accent-dark">
            {overrideCount} user-added
          </span>
          {undoStack.length > 0 && (
            <button
              type="button"
              onClick={() => undoLastNetworkChange(caseId)}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              title={`Undo: ${undoStack[0].summary}`}
            >
              <Undo2 className="w-3 h-3" />
              Undo
            </button>
          )}
          {overrideCount > 0 && (
            <button
              type="button"
              onClick={() => {
                if (confirm("Hapus semua entry yang user tambahkan untuk case ini?")) {
                  resetOverrides(caseId);
                }
              }}
              className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>
      </div>

      {recent && (
        <div className="border-b border-emerald-200 px-4 py-2.5 bg-emerald-50 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2 text-emerald-900">
            <Plus className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="text-xs">
              <div className="font-semibold">{recent.label} ditambahkan.</div>
              <div className="text-[11px] text-emerald-800">
                {recent.matchCount > 0
                  ? `${recent.matchCount} record import sekarang match — siap di-review di Inbox.`
                  : recent.kind === "substation"
                  ? "Substation sudah masuk working network. Lanjut tambahkan relation/bay agar muncul di Setting Register dan Data Mapping Inbox."
                  : recent.kind === "relation"
                  ? "Belum ada import record yang otomatis match. Tambah IED atau cek nama bay/circuit."
                  : recent.kind === "insertion"
                  ? "Line lama ditandai superseded, 2 segmen baru dibuat. Lengkapi IED/CT-VT untuk bay di GI baru ini."
                  : "IED tercatat. Kalau ada record OCR/LCD untuk bay ini, mereka akan muncul di Inbox."}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {recent.matchCount > 0 && (
              <button
                type="button"
                onClick={() => setTab("inbox")}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100"
              >
                Buka Inbox
                <ArrowRight className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setRecent(null)}
              className="text-emerald-700 hover:text-emerald-900"
              aria-label="Tutup notifikasi"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {changeSets.length > 0 && (
        <EngineeringChangeSetPanel changeSets={changeSets} />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-100">
        <AddSubstationForm
          networkGraph={networkGraph}
          onSubmit={(substation, busbar) => {
            addSubstationBundle(caseId, substation, busbar);
            setRecent({
              kind: "substation",
              label: `Substation ${substation.shortCode} ${substation.name}`,
              matchCount: 0,
            });
          }}
        />
        <AddRelationForm
          networkGraph={networkGraph}
          onSubmit={(relation, bays, busbars, terminals) => {
            addRelationBundle(caseId, { relation, bays, busbars, terminals });
            // Auto-select the new line so user sees its detail immediately
            // if they navigate to Setting Register.
            selectLine(relation.id);
            setRecent({
              kind: "relation",
              label: `Relation ${relation.fromSubstationId} -> ${relation.toSubstationId} #${relation.circuit}`,
              matchCount: computeMatchCount(relation.id),
            });
          }}
        />
        <InsertSubstationForm
          networkGraph={networkGraph}
          onSubmit={(payload) => {
            insertSubstationIntoLine(caseId, payload);
            const [firstSegment] = payload.segments;
            selectLine(firstSegment.relation.id);
            setRecent({
              kind: "insertion",
              label: `${payload.newSubstation.name} disisipkan ke line ${payload.oldRelation.id}`,
              matchCount: 0,
            });
          }}
        />
        <AddIedForm
          networkGraph={networkGraph}
          onSubmit={(ied) => {
            addIed(caseId, ied);
            // Find the relation owning this bay so we can compute import match.
            const owningRelation = networkGraph.lineRelations.find(
              (r) => r.fromBayId === ied.bayId || r.toBayId === ied.bayId
            );
            setRecent({
              kind: "ied",
              label: `IED ${ied.make} ${ied.model}`,
              matchCount: owningRelation ? computeMatchCount(owningRelation.id) : 0,
            });
          }}
        />
        <CtVtMasterForm
          networkGraph={networkGraph}
          overrides={ctVtOverrides}
          onSave={updateCtVtOverride}
          onClear={clearCtVtOverride}
        />
      </div>

      {overrideCount > 0 && (
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
            User-added entries
          </div>
          <div className="space-y-1">
            {override?.substations?.map((s) => (
              <OverrideRow
                key={s.id}
                label={`substation: ${s.id}`}
                detail={`${s.shortCode} | ${s.name} | ${s.voltageKv} kV`}
                removeTitle="Remove substation and linked user-added relation/bay/terminal/IED"
                onRemove={() => {
                  if (confirm("Hapus substation ini dan entry user-added yang terhubung?")) {
                    removeEntry(caseId, "substation", s.id);
                  }
                }}
              />
            ))}
            {override?.busbars?.map((b) => (
              <OverrideRow
                key={b.id}
                label={`busbar: ${b.id}`}
                detail={`${b.substationId} | ${b.label}`}
                onRemove={() => removeEntry(caseId, "busbar", b.id)}
              />
            ))}
            {override?.relations?.map((r) => (
              <OverrideRow
                key={r.id}
                label={`relation: ${r.id}`}
                detail={`${r.fromSubstationId} -> ${r.toSubstationId} #${r.circuit}`}
                removeTitle="Remove relation and linked user-added bay/terminal/IED"
                onRemove={() => {
                  if (confirm("Hapus relation ini beserta bay, terminal, dan IED user-added yang terhubung?")) {
                    removeEntry(caseId, "relation", r.id);
                  }
                }}
              />
            ))}
            {override?.bays?.map((b) => (
              <OverrideRow
                key={b.id}
                label={`bay: ${b.id}`}
                detail={`${b.substationId} | ${b.rawName}`}
                onRemove={() => removeEntry(caseId, "bay", b.id)}
              />
            ))}
            {override?.terminals?.map((t) => (
              <OverrideRow
                key={t.id}
                label={`terminal: ${t.id}`}
                detail={`${t.bayId} -> ${t.busbarId}`}
                onRemove={() => removeEntry(caseId, "terminal", t.id)}
              />
            ))}
            {override?.ieds?.map((i) => (
              <OverrideRow
                key={i.id}
                label={`ied: ${i.id}`}
                detail={`${i.make} ${i.model} | bay ${i.bayId}`}
                onRemove={() => removeEntry(caseId, "ied", i.id)}
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function OverrideRow({
  label,
  detail,
  removeTitle,
  onRemove,
}: {
  label: string;
  detail: string;
  removeTitle?: string;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-mono text-[10px] text-slate-500 shrink-0">{label}</span>
        <span className="text-slate-700 truncate">{detail}</span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        title={removeTitle}
        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-700 hover:bg-red-50"
      >
        <Trash2 className="w-3 h-3" />
        remove
      </button>
    </div>
  );
}

function EngineeringChangeSetPanel({
  changeSets,
}: {
  changeSets: EngineeringChangeSet[];
}) {
  return (
    <div className="border-b border-violet-200 bg-violet-50/40 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <FileDiff className="w-4 h-4 text-violet-700 mt-0.5" />
          <div>
            <div className="text-xs font-semibold text-violet-900">
              Engineering Change Sets
            </div>
            <div className="text-[10px] text-violet-700 mt-0.5">
              Append-only transaction evidence. Undo/Reset mengubah working graph, bukan
              menghapus history ini.
            </div>
          </div>
        </div>
        <span className="text-[10px] px-2 py-1 rounded border border-violet-200 bg-white text-violet-700">
          {changeSets.length} recorded
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {changeSets.slice(0, 5).map((changeSet) => (
          <EngineeringChangeSetCard key={changeSet.id} changeSet={changeSet} />
        ))}
      </div>
    </div>
  );
}

function EngineeringChangeSetCard({
  changeSet,
}: {
  changeSet: EngineeringChangeSet;
}) {
  const readiness = evaluateDataReadiness(changeSet);
  const statusClass =
    readiness.status === "ready"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : readiness.status === "review"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-red-200 bg-red-50 text-red-700";

  const downloadStaging = (format: "json" | "csv" | "dgs-preview") => {
    const built = buildDigsilentStagingPackage(
      changeSet,
      new Date().toISOString()
    );
    if (built.status === "blocked") return;
    const baseName = `plms-digsilent-staging-${changeSet.id}`;
    if (format === "json") {
      downloadText(
        `${baseName}.json`,
        serializeStagingPackageJson(built.package),
        "application/json"
      );
    } else if (format === "csv") {
      downloadText(
        `${baseName}-lines.csv`,
        serializeStagingLinesCsv(built.package),
        "text/csv"
      );
    } else {
      downloadText(
        `${baseName}.neutral-dgs-preview.txt`,
        serializeNeutralDgsPreview(built.package),
        "text/plain"
      );
    }
  };

  return (
    <details className="rounded border border-violet-200 bg-white overflow-hidden">
      <summary className="cursor-pointer px-3 py-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-900">
            {changeSet.title}
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            {changeSet.summary} · {changeSet.operations.length} operations
          </div>
        </div>
        <div className="text-right shrink-0">
          <span
            className={`inline-flex text-[10px] px-2 py-0.5 rounded border ${statusClass}`}
          >
            readiness: {readiness.status}
          </span>
          <div className="text-[9px] font-mono text-slate-400 mt-1">
            {changeSet.fingerprint.algorithm}:{changeSet.fingerprint.value}
          </div>
        </div>
      </summary>
      <div className="border-t border-violet-100 px-3 py-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[10px]">
          <ChangeSetDatum
            label="Created"
            value={`${changeSet.createdAt} · ${changeSet.actor}`}
          />
          <ChangeSetDatum
            label="Network revision"
            value={changeSet.baseline.networkRevisionId}
          />
          <ChangeSetDatum
            label="Scenario"
            value={changeSet.baseline.scenarioId ?? "not selected"}
          />
        </div>

        <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-2.5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-600">
                Data Readiness · {readiness.requiredFieldMatrixVersion}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                complete {readiness.counts.complete} · missing {readiness.counts.missing} ·
                conflict {readiness.counts.conflict} · stale {readiness.counts.stale}
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button type="button" disabled={!readiness.canGeneratePreview} onClick={() => downloadStaging("json")} className="text-[10px] px-2 py-1 rounded border border-brand-accent/40 bg-white text-brand-accent-dark disabled:opacity-40 disabled:cursor-not-allowed">
                JSON
              </button>
              <button type="button" disabled={!readiness.canGeneratePreview} onClick={() => downloadStaging("csv")} className="text-[10px] px-2 py-1 rounded border border-brand-accent/40 bg-white text-brand-accent-dark disabled:opacity-40 disabled:cursor-not-allowed">
                CSV
              </button>
              <button type="button" disabled={!readiness.canGeneratePreview} onClick={() => downloadStaging("dgs-preview")} className="text-[10px] px-2 py-1 rounded border border-amber-300 bg-white text-amber-700 disabled:opacity-40 disabled:cursor-not-allowed">
                Neutral DGS preview
              </button>
            </div>
          </div>
          {!readiness.canGeneratePreview && (
            <div className="text-[10px] text-red-700 mt-2">
              Export diblokir sampai seluruh required field dan conflict blocker diselesaikan.
            </div>
          )}
          {readiness.canGeneratePreview && !readiness.readyForStudy && (
            <div className="text-[10px] text-amber-700 mt-2">
              Preview boleh dibuat, tetapi package belum import-ready karena baseline stale/review.
            </div>
          )}
          <details className="mt-2">
            <summary className="text-[10px] text-slate-600 cursor-pointer">
              Review readiness details
            </summary>
            <div className="mt-1 space-y-1">
              {readiness.items
                .filter((readinessItem) => readinessItem.status !== "complete")
                .map((readinessItem) => (
                  <div
                    key={readinessItem.id}
                    className={`text-[10px] ${
                      readinessItem.status === "missing" ||
                      readinessItem.status === "conflict"
                        ? "text-red-700"
                        : "text-amber-700"
                    }`}
                  >
                    {readinessItem.status}: {readinessItem.entityId ? `${readinessItem.entityId} · ` : ""}
                    {readinessItem.message}
                  </div>
                ))}
            </div>
          </details>
        </div>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-[10px]">
            <thead className="text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="text-left py-1 pr-3">Operation</th>
                <th className="text-left py-1 pr-3">Entity</th>
                <th className="text-left py-1">Changed fields</th>
              </tr>
            </thead>
            <tbody>
              {changeSet.operations.map((operation) => (
                <tr
                  key={`${operation.operation}-${operation.entityKind}-${operation.entityId}`}
                  className="border-t border-slate-100"
                >
                  <td className="py-1.5 pr-3 font-semibold text-violet-700">
                    {operation.operation}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-slate-700">
                    {operation.entityKind}:{operation.entityId}
                  </td>
                  <td className="py-1.5 text-slate-500">
                    {operation.changedFields.join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </details>
  );
}

function ChangeSetDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 bg-slate-50 p-2">
      <div className="uppercase tracking-wider text-slate-400">{label}</div>
      <div className="mt-0.5 text-slate-700 break-all">{value}</div>
    </div>
  );
}

function AddSubstationForm({
  networkGraph,
  onSubmit,
}: {
  networkGraph: UnifiedNetwork;
  onSubmit: (substation: UnifiedSubstation, busbar: Busbar) => void;
}) {
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [voltageKv, setVoltageKv] = useState("150");
  const [kind, setKind] = useState<SubstationKind>("GIS");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    const normalizedName = normalizeStationName(name);
    if (!normalizedName) return setError("Nama GI/GIS wajib diisi.");
    // Identity check keeps the GI/GIS token: a GI and a GIS that share a base
    // name (e.g. after a migration where the old GI's outgoing bay stays
    // live) are two distinct physical sites, not a duplicate.
    const identity = normalizeSubstationIdentity(name);
    if (networkGraph.substations.some((s) => normalizeSubstationIdentity(s.name) === identity)) {
      return setError("Substation dengan nama dan jenis (GI/GIS) ini sudah ada di network graph.");
    }
    const voltage = Number(voltageKv) || 150;
    const id = `sub_${toSafeId(normalizedName)}_user`;
    const substation: UnifiedSubstation = {
      id,
      name: name.trim(),
      shortCode: shortCode.trim() || buildShortCode(name),
      voltageKv: voltage,
      kind,
      normalizedName,
    };
    const busbar: Busbar = {
      id: `bus_${id}_${voltage}`,
      substationId: id,
      label: `${voltage}kV Busbar`,
      voltageKv: voltage,
      kind: "single",
    };
    onSubmit(substation, busbar);
    setName("");
    setShortCode("");
    setVoltageKv("150");
    setKind("GIS");
  };

  return (
    <div className="px-4 py-4">
      <div className="text-xs font-semibold text-slate-700 mb-2">Add Substation</div>
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Name" value={name} onChange={setName} placeholder="GIS Kembangan" />
        <TextField label="Short code" value={shortCode} onChange={setShortCode} placeholder="KMB" />
        <TextField label="Voltage kV" value={voltageKv} onChange={setVoltageKv} placeholder="150" />
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Kind</span>
          <select
            value={kind}
            onChange={(event) => setKind(event.target.value as SubstationKind)}
            className="bg-white text-xs px-2 py-1 rounded border border-slate-300 focus:border-brand-accent focus:outline-none"
          >
            <option value="GI">GI</option>
            <option value="GIS">GIS</option>
            <option value="GISTET">GISTET</option>
          </select>
        </label>
      </div>
      {error && <div className="mt-2 text-[11px] text-red-700">{error}</div>}
      <button
        type="button"
        onClick={submit}
        className="mt-3 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-brand-accent/40 bg-brand-accent/10 text-brand-accent-dark hover:bg-brand-accent/20"
      >
        <Plus className="w-3.5 h-3.5" />
        Tambah substation
      </button>
    </div>
  );
}

function AddRelationForm({
  networkGraph,
  onSubmit,
}: {
  networkGraph: UnifiedNetwork;
  onSubmit: (relation: LineRelation, newBays: Bay[], newBusbars: Busbar[], newTerminals: Terminal[]) => void;
}) {
  const [fromId, setFromId] = useState(networkGraph.substations[0]?.id ?? "");
  const [toId, setToId] = useState(networkGraph.substations[1]?.id ?? "");
  const [circuit, setCircuit] = useState("1");
  const [lineX, setLineX] = useState("");
  const [lengthKm, setLengthKm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (!fromId || !toId || fromId === toId) {
      setError("Pilih dua substation berbeda.");
      return;
    }
    const fromSub = networkGraph.substations.find((s) => s.id === fromId);
    const toSub = networkGraph.substations.find((s) => s.id === toId);
    if (!fromSub || !toSub) {
      setError("Substation tidak ditemukan.");
      return;
    }
    const c = circuit.replace(/[^\d]/g, "") || "1";
    const id = `line_${fromId}_${toId}_${c}_user`;
    if (networkGraph.lineRelations.some((r) => r.id === id)) {
      setError("Relation dengan kombinasi ini sudah ada.");
      return;
    }
    const fromBay: Bay = {
      id: `bay_${fromId}_${id}_from`,
      substationId: fromId,
      rawName: `PHT ${fromSub.voltageKv}kV ${toSub.name.toUpperCase()}#${c}`,
      normalizedName: normalizeStationName(toSub.name),
      remoteEndpointHint: normalizeStationName(toSub.name),
      circuit: c,
      kind: "line",
    };
    const toBay: Bay = {
      id: `bay_${toId}_${id}_to`,
      substationId: toId,
      rawName: `PHT ${toSub.voltageKv}kV ${fromSub.name.toUpperCase()}#${c}`,
      normalizedName: normalizeStationName(fromSub.name),
      remoteEndpointHint: normalizeStationName(fromSub.name),
      circuit: c,
      kind: "line",
    };
    const newBusbars: Busbar[] = [];
    const fromBusbar =
      networkGraph.busbars.find((b) => b.substationId === fromId) ??
      newBusbars[
        newBusbars.push({
          id: `bus_${fromId}_${fromSub.voltageKv}`,
          substationId: fromId,
          label: `${fromSub.voltageKv}kV Busbar`,
          voltageKv: fromSub.voltageKv,
          kind: "single",
        }) - 1
      ];
    const toBusbar =
      networkGraph.busbars.find((b) => b.substationId === toId) ??
      newBusbars[
        newBusbars.push({
          id: `bus_${toId}_${toSub.voltageKv}`,
          substationId: toId,
          label: `${toSub.voltageKv}kV Busbar`,
          voltageKv: toSub.voltageKv,
          kind: "single",
        }) - 1
      ];
    const terminals: Terminal[] = [
      {
        id: `term_${fromBay.id}_bus`,
        bayId: fromBay.id,
        busbarId: fromBusbar.id,
        position: "bus-side",
      },
      {
        id: `term_${toBay.id}_bus`,
        bayId: toBay.id,
        busbarId: toBusbar.id,
        position: "bus-side",
      },
    ];
    const relation: LineRelation = {
      id,
      fromBayId: fromBay.id,
      toBayId: toBay.id,
      fromSubstationId: fromId,
      toSubstationId: toId,
      circuit: c,
      voltageKv: fromSub.voltageKv,
      lineXOhm: lineX ? Number(lineX) : undefined,
      physicalLengthKm: lengthKm ? Number(lengthKm) : undefined,
      protectionFunctionIds: [],
      sourceIds: ["user-added"],
      confidence: "low",
      status: "imported",
    };
    onSubmit(relation, [fromBay, toBay], newBusbars, terminals);
    setLineX("");
    setLengthKm("");
  };

  return (
    <div className="px-4 py-4">
      <div className="text-xs font-semibold text-slate-700 mb-2">Add Line Relation</div>
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="From substation"
          value={fromId}
          onChange={setFromId}
          options={networkGraph.substations.map((s) => ({ value: s.id, label: `${s.shortCode} ${s.name}` }))}
        />
        <SelectField
          label="To substation"
          value={toId}
          onChange={setToId}
          options={networkGraph.substations.map((s) => ({ value: s.id, label: `${s.shortCode} ${s.name}` }))}
        />
        <TextField label="Circuit (#)" value={circuit} onChange={setCircuit} />
        <TextField label="Xline (ohm)" value={lineX} onChange={setLineX} placeholder="optional" />
        <TextField label="Length (km)" value={lengthKm} onChange={setLengthKm} placeholder="optional" />
      </div>
      {error && <div className="mt-2 text-[11px] text-red-700">{error}</div>}
      <button
        type="button"
        onClick={submit}
        className="mt-3 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-brand-accent/40 bg-brand-accent/10 text-brand-accent-dark hover:bg-brand-accent/20"
      >
        <Plus className="w-3.5 h-3.5" />
        Tambah relation
      </button>
    </div>
  );
}

// GI insertion: a project physically cuts an existing line into two new
// segments around a new substation (e.g. Grogol Baru 2023 cutting the
// pre-existing DKSBI-GROGOL line). Unlike AddRelationForm (which adds one
// new relation between two EXISTING substations), this replaces one
// existing relation with a new substation plus two new relations, retiring
// the old one to status "superseded" rather than deleting it.
function InsertSubstationForm({
  networkGraph,
  onSubmit,
}: {
  networkGraph: UnifiedNetwork;
  onSubmit: (payload: {
    oldRelation: LineRelation;
    newSubstation: UnifiedSubstation;
    newBusbar: Busbar;
    segments: Array<{ relation: LineRelation; bays: Bay[]; terminals: Terminal[] }>;
  }) => void;
}) {
  const activeRelations = networkGraph.lineRelations.filter((r) => r.status !== "superseded");
  const [oldRelationId, setOldRelationId] = useState(activeRelations[0]?.id ?? "");
  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [segmentAData, setSegmentAData] = useState<SegmentElectricalDraft>({
    ...EMPTY_SEGMENT_ELECTRICAL,
  });
  const [segmentBData, setSegmentBData] = useState<SegmentElectricalDraft>({
    ...EMPTY_SEGMENT_ELECTRICAL,
  });
  const [error, setError] = useState<string | null>(null);

  const oldRelation = networkGraph.lineRelations.find((r) => r.id === oldRelationId);
  const fromSub = oldRelation ? networkGraph.substations.find((s) => s.id === oldRelation.fromSubstationId) : undefined;
  const toSub = oldRelation ? networkGraph.substations.find((s) => s.id === oldRelation.toSubstationId) : undefined;

  const submit = () => {
    setError(null);
    if (!oldRelation || !fromSub || !toSub) return setError("Pilih line yang akan disisipi dulu.");
    const targetOldRelation = oldRelation;
    const normalizedName = normalizeStationName(name);
    if (!normalizedName) return setError("Nama GI baru wajib diisi.");
    const identity = normalizeSubstationIdentity(name);
    if (networkGraph.substations.some((s) => normalizeSubstationIdentity(s.name) === identity)) {
      return setError("Substation dengan nama dan jenis (GI/GIS) ini sudah ada di network graph.");
    }

    const newSubId = `sub_${toSafeId(normalizedName)}_user`;
    const newSubstation: UnifiedSubstation = {
      id: newSubId,
      name: name.trim(),
      shortCode: shortCode.trim() || buildShortCode(name),
      voltageKv: fromSub.voltageKv,
      kind: "GIS",
      normalizedName,
    };
    const newBusbar: Busbar = {
      id: `bus_${newSubId}_${fromSub.voltageKv}`,
      substationId: newSubId,
      label: `${fromSub.voltageKv}kV Busbar`,
      voltageKv: fromSub.voltageKv,
      kind: "single",
    };

    // Segment A: fromSub <-> newSubstation. Segment B: newSubstation <-> toSub.
    // `near` is always the pre-existing endpoint of this segment, `far` is
    // always the new substation — both segments connect TO the new
    // substation, one from each original side of the cut line.
    function buildSegment(
      near: UnifiedSubstation,
      electrical: SegmentElectricalDraft,
      suffix: "a" | "b"
    ) {
      const far = newSubstation;
      const relationId = `${targetOldRelation.id}_${suffix}_user`;
      const nearBay: Bay = {
        id: `bay_${near.id}_${relationId}_near`,
        substationId: near.id,
        rawName: `PHT ${near.voltageKv}kV ${far.name.toUpperCase()}#${targetOldRelation.circuit}`,
        normalizedName: normalizeStationName(far.name),
        remoteEndpointHint: normalizeStationName(far.name),
        circuit: targetOldRelation.circuit,
        kind: "line",
      };
      const farBay: Bay = {
        id: `bay_${far.id}_${relationId}_far`,
        substationId: far.id,
        rawName: `PHT ${far.voltageKv}kV ${near.name.toUpperCase()}#${targetOldRelation.circuit}`,
        normalizedName: normalizeStationName(near.name),
        remoteEndpointHint: normalizeStationName(near.name),
        circuit: targetOldRelation.circuit,
        kind: "line",
      };
      const nearBusbar = networkGraph.busbars.find((b) => b.substationId === near.id);
      const farBusbar = newBusbar;
      const terminals: Terminal[] = [
        ...(nearBusbar ? [{ id: `term_${nearBay.id}_bus`, bayId: nearBay.id, busbarId: nearBusbar.id, position: "bus-side" as const }] : []),
        ...(farBusbar ? [{ id: `term_${farBay.id}_bus`, bayId: farBay.id, busbarId: farBusbar.id, position: "bus-side" as const }] : []),
      ];
      const relation: LineRelation = {
        id: relationId,
        fromBayId: nearBay.id,
        toBayId: farBay.id,
        fromSubstationId: near.id,
        toSubstationId: far.id,
        circuit: targetOldRelation.circuit,
        voltageKv: targetOldRelation.voltageKv,
        r1Ohm: optionalNumber(electrical.r1Ohm),
        x1Ohm: optionalNumber(electrical.x1Ohm),
        r0Ohm: optionalNumber(electrical.r0Ohm),
        x0Ohm: optionalNumber(electrical.x0Ohm),
        lineXOhm: optionalNumber(electrical.x1Ohm),
        physicalLengthKm: optionalNumber(electrical.lengthKm),
        protectionFunctionIds: [],
        sourceIds: ["user-added-gi-insertion"],
        confidence: "low",
        status: "imported",
      };
      return { relation, bays: [nearBay, farBay], terminals };
    }

    const segmentA = buildSegment(fromSub, segmentAData, "a");
    const segmentB = buildSegment(toSub, segmentBData, "b");

    onSubmit({
      oldRelation: targetOldRelation,
      newSubstation,
      newBusbar,
      segments: [segmentA, segmentB],
    });
    setName("");
    setShortCode("");
    setSegmentAData({ ...EMPTY_SEGMENT_ELECTRICAL });
    setSegmentBData({ ...EMPTY_SEGMENT_ELECTRICAL });
  };

  if (activeRelations.length === 0) {
    return (
      <div className="px-4 py-4">
        <div className="text-xs font-semibold text-slate-700 mb-2">Sisipkan GI ke Line Existing</div>
        <p className="text-[11px] text-slate-500">Belum ada line relation aktif untuk disisipi.</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <div className="text-xs font-semibold text-slate-700 mb-2">Sisipkan GI ke Line Existing</div>
      <p className="text-[11px] text-slate-500 mb-2">
        Untuk proyek yang memotong line existing (mis. GI baru menyisipkan diri di tengah). Line lama ditandai "superseded", diganti 2 line baru.
      </p>
      <p className="text-[10px] text-amber-700 mb-2">
        Length, R1/X1, dan R0/X0 boleh dikosongkan saat draft, tetapi semuanya wajib sebelum DIgSILENT staging package dapat dibuat.
      </p>
      <div className="grid grid-cols-1 gap-2">
        <SelectField
          label="Line yang disisipi"
          value={oldRelationId}
          onChange={setOldRelationId}
          options={activeRelations.map((r) => {
            const f = networkGraph.substations.find((s) => s.id === r.fromSubstationId);
            const t = networkGraph.substations.find((s) => s.id === r.toSubstationId);
            return { value: r.id, label: `${f?.shortCode ?? r.fromSubstationId} - ${t?.shortCode ?? r.toSubstationId} #${r.circuit}` };
          })}
        />
        <div className="grid grid-cols-2 gap-2">
          <TextField label="Nama GI baru" value={name} onChange={setName} placeholder="GIS Grogol Baru" />
          <TextField label="Short code" value={shortCode} onChange={setShortCode} placeholder="GRB" />
        </div>
        {oldRelation && fromSub && toSub && (
          <>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">
              Segmen 1: {fromSub.shortCode} - {name || "(GI baru)"}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Length (km)" value={segmentAData.lengthKm} onChange={(lengthKm) => setSegmentAData({ ...segmentAData, lengthKm })} placeholder="required for staging" />
              <TextField label="R1 (ohm)" value={segmentAData.r1Ohm} onChange={(r1Ohm) => setSegmentAData({ ...segmentAData, r1Ohm })} placeholder="required for staging" />
              <TextField label="X1 (ohm)" value={segmentAData.x1Ohm} onChange={(x1Ohm) => setSegmentAData({ ...segmentAData, x1Ohm })} placeholder="required for staging" />
              <TextField label="R0 (ohm)" value={segmentAData.r0Ohm} onChange={(r0Ohm) => setSegmentAData({ ...segmentAData, r0Ohm })} placeholder="required for staging" />
              <TextField label="X0 (ohm)" value={segmentAData.x0Ohm} onChange={(x0Ohm) => setSegmentAData({ ...segmentAData, x0Ohm })} placeholder="required for staging" />
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 mt-1">
              Segmen 2: {name || "(GI baru)"} - {toSub.shortCode}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <TextField label="Length (km)" value={segmentBData.lengthKm} onChange={(lengthKm) => setSegmentBData({ ...segmentBData, lengthKm })} placeholder="required for staging" />
              <TextField label="R1 (ohm)" value={segmentBData.r1Ohm} onChange={(r1Ohm) => setSegmentBData({ ...segmentBData, r1Ohm })} placeholder="required for staging" />
              <TextField label="X1 (ohm)" value={segmentBData.x1Ohm} onChange={(x1Ohm) => setSegmentBData({ ...segmentBData, x1Ohm })} placeholder="required for staging" />
              <TextField label="R0 (ohm)" value={segmentBData.r0Ohm} onChange={(r0Ohm) => setSegmentBData({ ...segmentBData, r0Ohm })} placeholder="required for staging" />
              <TextField label="X0 (ohm)" value={segmentBData.x0Ohm} onChange={(x0Ohm) => setSegmentBData({ ...segmentBData, x0Ohm })} placeholder="required for staging" />
            </div>
          </>
        )}
      </div>
      {error && <div className="mt-2 text-[11px] text-red-700">{error}</div>}
      <button
        type="button"
        onClick={submit}
        className="mt-3 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
      >
        <Plus className="w-3.5 h-3.5" />
        Sisipkan GI
      </button>
    </div>
  );
}

function AddIedForm({
  networkGraph,
  onSubmit,
}: {
  networkGraph: UnifiedNetwork;
  onSubmit: (ied: RelayIED) => void;
}) {
  const [bayId, setBayId] = useState(networkGraph.bays[0]?.id ?? "");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [ctRatio, setCtRatio] = useState("");
  const [vtRatio, setVtRatio] = useState("");
  const [functionGroup, setFunctionGroup] = useState("LCD+DIST");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    setError(null);
    if (!bayId) return setError("Pilih bay.");
    if (!make.trim() || !model.trim()) return setError("Make dan model wajib diisi.");
    if (networkGraph.relayIeds.some((i) => i.bayId === bayId)) {
      return setError("Bay ini sudah punya IED. Hapus dulu jika mau ganti.");
    }
    const id = `ied_${bayId}_${Date.now()}`;
    onSubmit({
      id,
      bayId,
      make: make.trim(),
      model: model.trim(),
      serial: serial.trim() || undefined,
      ctRatio: ctRatio.trim() || undefined,
      vtRatio: vtRatio.trim() || undefined,
      ct: parseCtRatio(ctRatio.trim(), "manual IED entry") ?? undefined,
      vt: parseVtRatio(vtRatio.trim(), "manual IED entry") ?? undefined,
      functionGroup: functionGroup.trim() || "LCD+DIST",
      confidence: "low",
    });
    setMake("");
    setModel("");
    setSerial("");
    setCtRatio("");
    setVtRatio("");
  };

  return (
    <div className="px-4 py-4">
      <div className="text-xs font-semibold text-slate-700 mb-2">Add IED to Bay</div>
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="Bay"
          value={bayId}
          onChange={setBayId}
          options={networkGraph.bays.map((b) => {
            const sub = networkGraph.substations.find((s) => s.id === b.substationId);
            return {
              value: b.id,
              label: `${sub?.shortCode ?? "?"} | ${b.rawName}`,
            };
          })}
        />
        <TextField label="Make" value={make} onChange={setMake} placeholder="ABB" />
        <TextField label="Model" value={model} onChange={setModel} placeholder="RED670" />
        <TextField label="Serial" value={serial} onChange={setSerial} placeholder="optional" />
        <TextField label="CT ratio" value={ctRatio} onChange={setCtRatio} placeholder="3000/5" />
        <TextField label="VT ratio" value={vtRatio} onChange={setVtRatio} placeholder="150 kV/100 V" />
        <TextField label="Function group" value={functionGroup} onChange={setFunctionGroup} placeholder="LCD+DIST" />
      </div>
      {error && <div className="mt-2 text-[11px] text-red-700">{error}</div>}
      <button
        type="button"
        onClick={submit}
        className="mt-3 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-brand-accent/40 bg-brand-accent/10 text-brand-accent-dark hover:bg-brand-accent/20"
      >
        <Plus className="w-3.5 h-3.5" />
        Tambah IED
      </button>
    </div>
  );
}

function CtVtMasterForm({
  networkGraph,
  overrides,
  onSave,
  onClear,
}: {
  networkGraph: UnifiedNetwork;
  overrides: Record<string, CtVtOverride>;
  onSave: (record: CtVtOverrideInput) => void;
  onClear: (iedId: string) => void;
}) {
  const [iedId, setIedId] = useState(networkGraph.relayIeds[0]?.id ?? "");
  const [ctPrimary, setCtPrimary] = useState("");
  const [ctSecondary, setCtSecondary] = useState("");
  const [vtPrimary, setVtPrimary] = useState("");
  const [vtSecondary, setVtSecondary] = useState("");
  const [sourceRef, setSourceRef] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const selectedIed = networkGraph.relayIeds.find((ied) => ied.id === iedId);
  const selectedBay = selectedIed ? networkGraph.bays.find((bay) => bay.id === selectedIed.bayId) : undefined;
  const selectedSub = selectedBay ? networkGraph.substations.find((sub) => sub.id === selectedBay.substationId) : undefined;
  const effective = getEffectiveCtVt(selectedIed, overrides);

  useEffect(() => {
    const nextIed = networkGraph.relayIeds.find((ied) => ied.id === iedId) ?? networkGraph.relayIeds[0];
    if (!nextIed) return;
    if (nextIed.id !== iedId) setIedId(nextIed.id);
    const next = getEffectiveCtVt(nextIed, overrides);
    setCtPrimary(next.ct?.primaryA ? String(next.ct.primaryA) : "");
    setCtSecondary(next.ct?.secondaryA ? String(next.ct.secondaryA) : "");
    setVtPrimary(next.vt?.primaryKv ? String(next.vt.primaryKv) : "");
    setVtSecondary(next.vt?.secondaryV ? String(next.vt.secondaryV) : "");
    setMessage(null);
  }, [iedId, networkGraph.relayIeds, overrides]);

  const submit = () => {
    if (!selectedIed) {
      setMessage("Pilih IED dulu.");
      return;
    }
    const ct = makeCtSpec(Number(ctPrimary), Number(ctSecondary), sourceRef.trim() || "manual CT/VT master");
    const vt = makeVtSpec(Number(vtPrimary), Number(vtSecondary), sourceRef.trim() || "manual CT/VT master");
    if (!ct || !vt) {
      setMessage("Rasio CT dan VT wajib valid.");
      return;
    }
    onSave({
      iedId: selectedIed.id,
      bayId: selectedIed.bayId,
      ct,
      vt,
      sourceRef: sourceRef.trim() || "manual CT/VT master",
      status: "reviewed",
    });
    setMessage("CT/VT tersimpan sebagai reviewed master data.");
  };

  if (networkGraph.relayIeds.length === 0) {
    return (
      <div className="px-4 py-4">
        <div className="text-xs font-semibold text-slate-700 mb-2">CT/VT Master</div>
        <div className="text-xs text-slate-500 border border-dashed border-slate-300 rounded px-3 py-4 bg-slate-50">
          Belum ada IED. Tambahkan IED dulu, lalu isi CT/VT terstruktur.
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="text-xs font-semibold text-slate-700">CT/VT Master</div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            Resolve missing CT/VT untuk readiness dan prefill Calculation.
          </div>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50 text-slate-500">
          {effective.source}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="IED"
          value={iedId}
          onChange={setIedId}
          options={networkGraph.relayIeds.map((ied) => {
            const bay = networkGraph.bays.find((item) => item.id === ied.bayId);
            const sub = bay ? networkGraph.substations.find((item) => item.id === bay.substationId) : undefined;
            return {
              value: ied.id,
              label: `${sub?.shortCode ?? "?"} | ${bay?.rawName ?? ied.bayId} | ${ied.make} ${ied.model}`,
            };
          })}
        />
        <TextField label="Source ref" value={sourceRef} onChange={setSourceRef} placeholder="TAP PDF / OCR / PST" />
        <TextField label="CT primary A" value={ctPrimary} onChange={setCtPrimary} placeholder="3000" />
        <TextField label="CT secondary A" value={ctSecondary} onChange={setCtSecondary} placeholder="1 / 5" />
        <TextField label="VT primary kV" value={vtPrimary} onChange={setVtPrimary} placeholder="150" />
        <TextField label="VT secondary V" value={vtSecondary} onChange={setVtSecondary} placeholder="100" />
      </div>
      <div className="mt-2 text-[10px] text-slate-500">
        Current: {ctRatioText(effective.ct, selectedIed?.ctRatio)} | {vtRatioText(effective.vt, selectedIed?.vtRatio)}
        {selectedSub && selectedBay ? ` | ${selectedSub.shortCode} ${selectedBay.rawName}` : ""}
      </div>
      {message && <div className="mt-2 text-[11px] text-brand-accent-dark">{message}</div>}
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={submit}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-brand-accent/40 bg-brand-accent/10 text-brand-accent-dark hover:bg-brand-accent/20"
        >
          <Plus className="w-3.5 h-3.5" />
          Simpan CT/VT
        </button>
        {selectedIed && overrides[selectedIed.id] && (
          <button
            type="button"
            onClick={() => {
              onClear(selectedIed.id);
              setMessage("Override CT/VT dihapus. Kembali ke data IED seed bila ada.");
            }}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Clear override
          </button>
        )}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-white text-xs px-2 py-1 rounded border border-slate-300 focus:border-brand-accent focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-white text-xs px-2 py-1 rounded border border-slate-300 focus:border-brand-accent focus:outline-none"
      />
    </label>
  );
}

function toSafeId(value: string) {
  return value.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || `new_${Date.now()}`;
}

function optionalNumber(value: string): number | undefined {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function downloadText(
  fileName: string,
  content: string,
  mimeType: string
) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildShortCode(value: string) {
  const words = value
    .replace(/\b(?:gi|gis|gistet)\b/gi, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "NEW";
  if (words.length === 1) return words[0].slice(0, 4).toUpperCase();
  return words.map((word) => word[0]).join("").slice(0, 4).toUpperCase();
}
