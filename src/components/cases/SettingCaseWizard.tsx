import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Search, X } from "lucide-react";
import { useProsetStore } from "../../store/useProsetStore";
import {
  getEffectiveNetworkGraph,
  INVENTORY_MASTER_CASE_ID,
} from "../../domain/network-graph";
import { buildUnifiedNetwork } from "../../domain/unified";
import { NETWORK_CASES } from "../../domain/seed-network-registry";
import {
  CHANGE_ITEM_LABEL,
  deriveSettingCaseType,
  type ChangeItem,
  type ChangeItemKind,
  type SettingCaseType,
  type SettingCaseUrgency,
} from "../../domain/setting-case";
import type {
  CaseLifecycleIntent,
  CrosscheckMode,
  OrganizationLevel,
} from "../../domain/case-flow-hardening";

const CHANGE_ITEM_KINDS: ChangeItemKind[] = [
  "reconductoring",
  "ct_replacement",
  "vt_replacement",
  "relay_replacement",
  "new_gi_insertion",
  "topology_change",
  "remote_side_work",
  "policy_revision",
  "data_correction",
  "other",
];

type WizardStep = 1 | 2 | 3 | 4;

export function SettingCaseWizard({
  initialCaseType,
  onClose,
}: {
  initialCaseType: SettingCaseType;
  onClose: () => void;
}) {
  const [step, setStep] = useState<WizardStep>(1);
  const entryKind = initialCaseType === "crosscheck" ? "crosscheck" : "setting_change";
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [primaryReason, setPrimaryReason] = useState<ChangeItemKind | "">(
    entryKind === "crosscheck" ? "other" : ""
  );
  const [urgency, setUrgency] = useState<SettingCaseUrgency>("normal");
  const [lifecycleIntent, setLifecycleIntent] =
    useState<CaseLifecycleIntent>("permanent");
  const [crosscheckMode, setCrosscheckMode] = useState<CrosscheckMode>(
    "actual_relay_readback_verification"
  );
  const [ownerLevel, setOwnerLevel] = useState<OrganizationLevel>("UPT");
  const [notifiedUnit, setNotifiedUnit] = useState("");
  const [temporaryExpiresAt, setTemporaryExpiresAt] = useState("");
  const [emergencyReason, setEmergencyReason] = useState("");
  const [plannedDate, setPlannedDate] = useState("");
  const [owningUnit, setOwningUnit] = useState("");
  const [remoteUnit, setRemoteUnit] = useState("");
  const [changeItems, setChangeItems] = useState<ChangeItem[]>([]);
  const [search, setSearch] = useState("");
  const [subjectBayId, setSubjectBayId] = useState<string | null>(null);
  const [manualSubstationIds, setManualSubstationIds] = useState<string[]>([]);
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);

  const createSettingCase = useProsetStore((s) => s.createSettingCase);
  const networkGraphOverrides = useProsetStore((s) => s.networkGraphOverrides);
  const sourceIntakeRecords = useProsetStore((s) => s.sourceIntakeRecords);

  const inventoryCase =
    NETWORK_CASES.find((item) => item.id === INVENTORY_MASTER_CASE_ID) ?? NETWORK_CASES[0];
  const masterFallback = useMemo(() => buildUnifiedNetwork(inventoryCase), [inventoryCase]);
  const workingGraph = useMemo(
    () =>
      getEffectiveNetworkGraph(
        INVENTORY_MASTER_CASE_ID,
        networkGraphOverrides[INVENTORY_MASTER_CASE_ID],
        masterFallback
      ),
    [masterFallback, networkGraphOverrides]
  );

  const candidateBays = useMemo(() => {
    if (!workingGraph) return [];
    return workingGraph.bays.map((bay) => {
      const sub = workingGraph.substations.find((s) => s.id === bay.substationId);
      const relation = workingGraph.lineRelations.find(
        (r) => r.fromBayId === bay.id || r.toBayId === bay.id
      );
      const remoteSubId =
        relation?.fromBayId === bay.id
          ? relation.toSubstationId
          : relation?.toBayId === bay.id
            ? relation.fromSubstationId
            : undefined;
      const remoteSub = workingGraph.substations.find((s) => s.id === remoteSubId);
      return {
        bayId: bay.id,
        substationId: sub?.id ?? "",
        substationName: sub?.name ?? bay.substationId,
        substationCode: sub?.shortCode ?? "",
        bayName: bay.rawName,
        relationId: relation?.id,
        relationLabel: relation
          ? remoteSub
            ? `${sub?.shortCode} - ${remoteSub.shortCode}`
            : "menunggu GI lawan di-confirm"
          : "unmapped",
      };
    });
  }, [workingGraph]);

  const filteredBays = useMemo(() => {
    const q = search.toLowerCase();
    return candidateBays.filter(
      (b) =>
        b.substationName.toLowerCase().includes(q) ||
        b.substationCode.toLowerCase().includes(q) ||
        b.bayName.toLowerCase().includes(q) ||
        b.relationLabel.toLowerCase().includes(q)
    );
  }, [candidateBays, search]);

  const selectedSubject = candidateBays.find((b) => b.bayId === subjectBayId);

  const suggestedSubstations = useMemo(() => {
    if (!selectedSubject || !workingGraph) return [];
    const subs = new Set<string>([selectedSubject.substationId]);
    const primary = workingGraph.lineRelations.find(
      (r) => r.fromBayId === selectedSubject.bayId || r.toBayId === selectedSubject.bayId
    );
    if (primary) {
      subs.add(primary.fromSubstationId);
      subs.add(primary.toSubstationId);
      const remoteSubId =
        primary.fromBayId === selectedSubject.bayId
          ? primary.toSubstationId
          : primary.fromSubstationId;
      workingGraph.lineRelations
        .filter((r) => r.fromSubstationId === remoteSubId || r.toSubstationId === remoteSubId)
        .forEach((r) => {
          subs.add(r.fromSubstationId);
          subs.add(r.toSubstationId);
        });
    }
    return Array.from(subs).map((id) => {
      const sub = workingGraph.substations.find((s) => s.id === id);
      return { id, code: sub?.shortCode ?? id, name: sub?.name ?? id };
    });
  }, [selectedSubject, workingGraph]);

  const allSubstations = useMemo(() => {
    if (!workingGraph) return [];
    return [...workingGraph.substations].sort((a, b) => a.shortCode.localeCompare(b.shortCode));
  }, [workingGraph]);

  const skipChangeStep = entryKind === "crosscheck";
  const reasonOptions: ChangeItemKind[] =
    entryKind === "crosscheck" ? ["other"] : CHANGE_ITEM_KINDS;
  const stepOrder: WizardStep[] = skipChangeStep ? [1, 3, 4] : [1, 2, 3, 4];
  const stepIndex = stepOrder.indexOf(step);

  const canLeaveStep1 =
    title.trim().length > 0 &&
    owningUnit.trim().length > 0 &&
    Boolean(primaryReason) &&
    (ownerLevel !== "UPT" || notifiedUnit.trim().length > 0) &&
    (lifecycleIntent !== "temporary_emergency" ||
      (temporaryExpiresAt.length > 0 && emergencyReason.trim().length > 0));
  const scopeChosen = Boolean(selectedSubject) || manualSubstationIds.length > 0;

  const toggleChangeItem = (kind: ChangeItemKind) => {
    if (kind === primaryReason) return;
    setChangeItems((items) =>
      items.some((item) => item.kind === kind)
        ? items.filter((item) => item.kind !== kind)
        : [...items, { id: `ci_${kind}`, kind }]
    );
  };

  const handleCreate = () => {
    if (!canLeaveStep1 || !scopeChosen || !primaryReason) return;
    const caseType = deriveSettingCaseType(entryKind, primaryReason);
    createSettingCase({
      caseType,
      title: title.trim(),
      description: description.trim() || undefined,
      primaryReason,
      changeItems: skipChangeStep
        ? []
        : [
            { id: `ci_${primaryReason}`, kind: primaryReason },
            ...changeItems.filter((item) => item.kind !== primaryReason),
          ],
      urgency,
      flowProfileDraft: {
        lifecycleIntent,
        crosscheckMode: entryKind === "crosscheck" ? crosscheckMode : undefined,
        ownerLevel,
        notifiedUnits: notifiedUnit.trim() ? [notifiedUnit.trim()] : [],
        temporaryExpiresAt: temporaryExpiresAt || undefined,
        emergencyReason: emergencyReason.trim() || undefined,
      },
      plannedEffectiveDate: plannedDate || undefined,
      owningUnit: owningUnit.trim(),
      remoteUnit: remoteUnit.trim() || undefined,
      protectedScope: {
        networkCaseId: INVENTORY_MASTER_CASE_ID,
        subjectBayId: selectedSubject?.bayId,
        subjectLineId: selectedSubject?.relationId,
        subjectLabel: selectedSubject
          ? `${selectedSubject.substationCode} | ${selectedSubject.bayName}`
          : undefined,
        substationIds: selectedSubject
          ? suggestedSubstations.map((s) => s.id)
          : manualSubstationIds,
      },
      links: {
        sourceIntakeIds: evidenceIds,
      },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="border-b-2 border-ink px-5 py-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[11px] font-bold tracking-[0.06em] text-amber-600">
                CHANGE REQUEST · LANGKAH {stepIndex + 1}/{stepOrder.length}
              </div>
              <h2 className="mt-0.5 font-display text-xl font-bold tracking-[-0.01em] text-ink">
                Setting Change Case Baru
              </h2>
              <p className="mt-0.5 text-xs text-ink-3">
                Transaksi pertama membuat Change Request, bukan kalkulasi.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-ink-4 hover:bg-slate-100 hover:text-ink-2"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {step === 1 && (
            <div className="space-y-4">
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2.5">
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-blue-700">
                  Aktivitas
                </div>
                <div className="mt-0.5 text-sm font-semibold text-slate-900">
                  {entryKind === "crosscheck"
                    ? "Crosscheck actual setting"
                    : "Hitung / revisi setting"}
                </div>
                <p className="mt-0.5 text-xs text-slate-600">
                  {entryKind === "crosscheck"
                    ? "Case P1 untuk verifikasi setting aktual."
                    : "Kode proses P2/P3/P4/P5 ditentukan otomatis dari alasan utama."}
                </p>
              </div>

              {entryKind === "crosscheck" ? (
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    Mode pemeriksaan P1
                  </label>
                  <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                    {(
                      [
                        {
                          value: "issued_tap_document_audit",
                          title: "Audit dokumen TAP",
                          detail:
                            "Bulk scan PDF TAP issued terhadap Setting Register; bukan bukti actual relay.",
                        },
                        {
                          value: "actual_relay_readback_verification",
                          title: "Verifikasi actual relay",
                          detail:
                            "Native/official .set, .rio, .xml, atau export vendor dari sesi readback.",
                        },
                      ] as Array<{
                        value: CrosscheckMode;
                        title: string;
                        detail: string;
                      }>
                    ).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setCrosscheckMode(option.value)}
                        className={`rounded-lg border p-3 text-left ${
                          crosscheckMode === option.value
                            ? "border-blue-500 bg-blue-50"
                            : "border-slate-200"
                        }`}
                      >
                        <div className="text-sm font-semibold text-slate-900">
                          {option.title}
                        </div>
                        <div className="mt-1 text-[11px] leading-relaxed text-slate-600">
                          {option.detail}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    Lifecycle intent
                  </label>
                  <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setLifecycleIntent("permanent")}
                      className={`rounded-lg border p-3 text-left ${
                        lifecycleIntent === "permanent"
                          ? "border-blue-500 bg-blue-50"
                          : "border-slate-200"
                      }`}
                    >
                      <div className="text-sm font-semibold">Permanent post-commission</div>
                      <div className="mt-1 text-[11px] text-slate-600">
                        Setting target setelah pekerjaan selesai; outage pekerjaan tidak
                        masuk scenario package.
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLifecycleIntent("temporary_emergency");
                        setUrgency("emergency");
                      }}
                      className={`rounded-lg border p-3 text-left ${
                        lifecycleIntent === "temporary_emergency"
                          ? "border-red-400 bg-red-50"
                          : "border-slate-200"
                      }`}
                    >
                      <div className="text-sm font-semibold">Temporary / emergency</div>
                      <div className="mt-1 text-[11px] text-slate-600">
                        Topologi/fungsi proteksi sementara, memiliki expiry dan restoration
                        obligation.
                      </div>
                    </button>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-slate-600">Judul case</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder='cth: "Crosscheck P545 penghantar DKSBI-DNMGT"'
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Alasan utama</label>
                  <select
                    value={primaryReason}
                    disabled={entryKind === "crosscheck"}
                    onChange={(e) => {
                      const reason = e.target.value as ChangeItemKind | "";
                      setPrimaryReason(reason);
                      if (reason) {
                        setChangeItems((items) =>
                          items.filter((item) => item.kind !== reason)
                        );
                      }
                    }}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    {entryKind !== "crosscheck" && (
                      <option value="">— pilih alasan pekerjaan —</option>
                    )}
                    {reasonOptions.map((kind) => (
                      <option key={kind} value={kind}>
                        {CHANGE_ITEM_LABEL[kind]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Urgensi</label>
                  <select
                    value={urgency}
                    onChange={(e) => {
                      const nextUrgency = e.target.value as SettingCaseUrgency;
                      setUrgency(nextUrgency);
                      if (nextUrgency === "emergency" && entryKind !== "crosscheck") {
                        setLifecycleIntent("temporary_emergency");
                      }
                    }}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="normal">Normal</option>
                    <option value="high">Tinggi</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    Tanggal efektif/energize (rencana)
                  </label>
                  <input
                    type="date"
                    value={plannedDate}
                    onChange={(e) => setPlannedDate(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    Level organisasi pemilik
                  </label>
                  <select
                    value={ownerLevel}
                    onChange={(e) =>
                      setOwnerLevel(e.target.value as OrganizationLevel)
                    }
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="UPT">UPT</option>
                    <option value="UIT">UIT</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">Unit pemilik</label>
                  <input
                    value={owningUnit}
                    onChange={(e) => setOwningUnit(e.target.value)}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    {ownerLevel === "UPT"
                      ? "Unit UIT yang wajib dinotifikasi"
                      : "Unit lain yang dinotifikasi"}
                  </label>
                  <input
                    value={notifiedUnit}
                    onChange={(e) => setNotifiedUnit(e.target.value)}
                    placeholder={
                      ownerLevel === "UPT" ? "wajib untuk case UPT" : "opsional"
                    }
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600">
                    Unit remote (bila lintas UPT)
                  </label>
                  <input
                    value={remoteUnit}
                    onChange={(e) => setRemoteUnit(e.target.value)}
                    placeholder="opsional"
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-medium text-slate-600">
                    Konteks bisnis/proyek
                  </label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                {lifecycleIntent === "temporary_emergency" && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-red-700">
                        Temporary expiry
                      </label>
                      <input
                        type="datetime-local"
                        value={temporaryExpiresAt}
                        onChange={(e) => setTemporaryExpiresAt(e.target.value)}
                        className="mt-1 w-full rounded-md border border-red-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-red-700">
                        Alasan kondisi darurat
                      </label>
                      <input
                        value={emergencyReason}
                        onChange={(e) => setEmergencyReason(e.target.value)}
                        placeholder="mis. temporary jumper akibat kegagalan GIS"
                        className="mt-1 w-full rounded-md border border-red-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {step === 2 && !skipChangeStep && (
            <div className="space-y-3">
              <div>
                <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-2">Deklarasi Perubahan</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Alasan utama selalu menjadi change item dan menentukan routing. Tambahkan
                  perubahan lain yang masih berada dalam pekerjaan yang sama.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {CHANGE_ITEM_KINDS.map((kind) => {
                  const isPrimary = kind === primaryReason;
                  const checked =
                    isPrimary || changeItems.some((item) => item.kind === kind);
                  return (
                    <label
                      key={kind}
                      className={`flex items-center gap-2 rounded-lg border p-2.5 text-sm ${
                        checked ? "border-blue-500 bg-blue-50" : "border-slate-200"
                      } ${isPrimary ? "cursor-default" : "cursor-pointer"}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={isPrimary}
                        onChange={() => toggleChangeItem(kind)}
                        className="h-4 w-4"
                      />
                      <span className="text-slate-800">
                        {CHANGE_ITEM_LABEL[kind]}
                        {isPrimary ? " (alasan utama)" : ""}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <div>
                <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-2">Protected Scope</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Pilih bay subject; GI tetangga untuk konteks Z2/Z3 disarankan otomatis dari
                  relasi jaringan.
                </p>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari GI / bay / relasi..."
                  className="w-full rounded-md border border-slate-300 py-2 pl-8 pr-3 text-sm"
                />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {filteredBays.map((bay) => (
                  <button
                    key={bay.bayId}
                    type="button"
                    onClick={() => setSubjectBayId(bay.bayId === subjectBayId ? null : bay.bayId)}
                    className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${
                      subjectBayId === bay.bayId ? "bg-blue-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-800">
                        {bay.substationCode} · {bay.bayName}
                      </div>
                      <div className="text-[11px] text-slate-500">{bay.relationLabel}</div>
                    </div>
                    {subjectBayId === bay.bayId && (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />
                    )}
                  </button>
                ))}
                {filteredBays.length === 0 && (
                  <div className="px-3 py-6 text-center text-xs text-slate-400">
                    Tidak ada bay yang cocok.
                  </div>
                )}
              </div>
              {selectedSubject ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                  Scope GI: {suggestedSubstations.map((s) => s.code).join(", ")}
                </div>
              ) : (
                <div>
                  <div className="text-xs font-medium text-slate-600">
                    Atau pilih GI langsung (tanpa bay subject — mis. untuk koreksi data):
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {allSubstations.map((sub) => {
                      const on = manualSubstationIds.includes(sub.id);
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() =>
                            setManualSubstationIds((ids) =>
                              on ? ids.filter((id) => id !== sub.id) : [...ids, sub.id]
                            )
                          }
                          className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                            on
                              ? "border-blue-500 bg-blue-600 text-white"
                              : "border-slate-300 text-slate-600 hover:border-slate-400"
                          }`}
                        >
                          {sub.shortCode}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h3 className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-ink-2">Bukti & Baseline</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Link dokumen sumber yang sudah di-stage sebagai bukti baseline. Baseline
                  dibekukan pada stage berikutnya — bukti bisa ditambah dari detail case.
                </p>
                {entryKind === "crosscheck" && (
                  <p className="mt-2 rounded border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                    {crosscheckMode === "issued_tap_document_audit"
                      ? "Document Audit membutuhkan evidence bertipe TAP Setting/PDF issued."
                      : "Actual Relay Verification membutuhkan Relay Export; PDF TAP tidak dianggap actual readback."}
                  </p>
                )}
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                {sourceIntakeRecords.length === 0 && (
                  <div className="px-3 py-6 text-center text-xs text-slate-400">
                    Belum ada dokumen di-stage. Buka Dokumen Sumber untuk stage bukti, lalu
                    link dari detail case.
                  </div>
                )}
                {sourceIntakeRecords.map((record) => {
                  const on = evidenceIds.includes(record.id);
                  return (
                    <label
                      key={record.id}
                      className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setEvidenceIds((ids) =>
                            on ? ids.filter((id) => id !== record.id) : [...ids, record.id]
                          )
                        }
                        className="h-4 w-4"
                      />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-800">
                          {record.fileName}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {record.documentType} · {record.status}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            disabled={stepIndex === 0}
            onClick={() => setStep(stepOrder[Math.max(0, stepIndex - 1)])}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 disabled:opacity-40"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Kembali
          </button>
          {stepIndex < stepOrder.length - 1 ? (
            <button
              type="button"
              disabled={step === 1 && !canLeaveStep1}
              onClick={() => setStep(stepOrder[stepIndex + 1])}
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              Lanjut <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              type="button"
              disabled={!canLeaveStep1 || !scopeChosen}
              onClick={handleCreate}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              <CheckCircle2 className="h-4 w-4" /> Buat Change Request
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
