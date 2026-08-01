import { useMemo, useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, FileSpreadsheet, Search, X } from "lucide-react";
import { useProsetStore } from "../../store/useProsetStore";
import { INVENTORY_MASTER_CASE_ID } from "../../domain/network-graph";
import { getConfirmedMasterNetwork } from "../../domain/study-network";
import { CROSSCHECK_WORKBOOK_REGISTRY } from "../../domain/crosscheck-workbook-registry";

type WizardStep = 1 | 2 | 3;

export function StudyWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<WizardStep>(1);
  const [search, setSearch] = useState("");
  
  // Step 1: Select primary subject
  const [subjectBayId, setSubjectBayId] = useState<string | null>(null);
  
  // Step 2 & 3: Scope
  const [studyName, setStudyName] = useState("");
  const [description, setDescription] = useState("");
  
  const createStudy = useProsetStore((s) => s.createStudy);
  const networkGraphOverrides = useProsetStore((s) => s.networkGraphOverrides);

  const workingNetworkGraph = useMemo(
    () =>
      getConfirmedMasterNetwork(
        networkGraphOverrides[INVENTORY_MASTER_CASE_ID]
      ),
    [networkGraphOverrides]
  );

  const candidateBays = useMemo(() => {
    if (!workingNetworkGraph) return [];
    return workingNetworkGraph.bays.map((bay) => {
      const sub = workingNetworkGraph.substations.find((s) => s.id === bay.substationId);
      const relation = workingNetworkGraph.lineRelations.find(
        (r) => r.fromBayId === bay.id || r.toBayId === bay.id
      );
      const remoteSubId =
        relation?.fromBayId === bay.id
          ? relation.toSubstationId
          : relation?.toBayId === bay.id
            ? relation.fromSubstationId
            : undefined;
      const remoteSub = workingNetworkGraph.substations.find((s) => s.id === remoteSubId);

      // A relation can exist (confirmed from the graph builder) while its
      // far-side substation hasn't been confirmed yet — the graph builder
      // reviews one GI at a time, so a line relation lands in the override
      // as soon as its local side is confirmed, before the remote GI is.
      // Distinguish that from "no relation at all" instead of collapsing
      // both into "unmapped", which reads as if nothing was mapped.
      let relationLabel: string;
      if (!relation) {
        relationLabel = "unmapped";
      } else if (remoteSub) {
        relationLabel = `${sub?.shortCode} - ${remoteSub.shortCode}`;
      } else {
        relationLabel = "menunggu GI lawan di-confirm";
      }

      return {
        bayId: bay.id,
        substationId: sub?.id ?? "",
        substationName: sub?.name ?? bay.substationId,
        substationCode: sub?.shortCode ?? "",
        bayName: bay.rawName,
        relationLabel,
        hasRelation: !!relation,
        relationId: relation?.id,
      };
    });
  }, [workingNetworkGraph]);

  const filteredCandidates = useMemo(() => {
    const q = search.toLowerCase();
    return candidateBays.filter((b) => 
      b.substationName.toLowerCase().includes(q) ||
      b.substationCode.toLowerCase().includes(q) ||
      b.bayName.toLowerCase().includes(q) ||
      b.relationLabel.toLowerCase().includes(q)
    );
  }, [candidateBays, search]);

  const selectedSubject = candidateBays.find(b => b.bayId === subjectBayId);

  // Auto-suggest neighbor substations based on line relations
  const suggestedSubstations = useMemo(() => {
    if (!selectedSubject || !workingNetworkGraph) return [];
    const subs = new Set<string>();
    subs.add(selectedSubject.substationId);
    
    // Find remote sub for the selected bay
    const primaryRelation = workingNetworkGraph.lineRelations.find(
      (r) => r.fromBayId === selectedSubject.bayId || r.toBayId === selectedSubject.bayId
    );
    
    if (primaryRelation) {
      subs.add(primaryRelation.fromSubstationId);
      subs.add(primaryRelation.toSubstationId);
      
      // Look for Z2/Z3 neighbors (lines connected to the remote sub)
      const remoteSubId = primaryRelation.fromBayId === selectedSubject.bayId 
        ? primaryRelation.toSubstationId 
        : primaryRelation.fromSubstationId;
        
      const neighborRelations = workingNetworkGraph.lineRelations.filter(
        (r) => r.fromSubstationId === remoteSubId || r.toSubstationId === remoteSubId
      );
      
      neighborRelations.forEach(r => {
        subs.add(r.fromSubstationId);
        subs.add(r.toSubstationId);
      });
    }
    
    return Array.from(subs).map(id => {
      const sub = workingNetworkGraph.substations.find(s => s.id === id);
      return { id, code: sub?.shortCode ?? id, name: sub?.name ?? id };
    });
  }, [selectedSubject, workingNetworkGraph]);

  const handleCreate = () => {
    if (!studyName || !selectedSubject) return;
    createStudy(studyName, description, suggestedSubstations.map(s => s.id), {
      subjectBayId: selectedSubject.bayId,
      subjectLineId: selectedSubject.relationId,
      subjectLabel: `${selectedSubject.substationCode} | ${selectedSubject.bayName}`,
    });
    onClose();
  };

  const handleCreateLegacyCrosscheckStudy = () => {
    const distanceCase = CROSSCHECK_WORKBOOK_REGISTRY.legacyCases.distance as {
      localSubstation?: string;
      subjectBay?: string;
      remoteSubstation?: string;
      selectedLines?: Array<{ name: string }>;
    };
    const ocrGfrCase = CROSSCHECK_WORKBOOK_REGISTRY.legacyCases.ocrGfr as {
      substation?: string;
      bay?: string;
    };
    const scope = Array.from(
      new Set(
        [
          distanceCase.localSubstation,
          distanceCase.remoteSubstation,
          ...(distanceCase.selectedLines ?? []).map((line) => line.name),
        ]
          .filter((value): value is string => Boolean(value))
          .map((value) => `legacy_${value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`)
      )
    );

    createStudy(
      `Legacy Crosscheck - ${distanceCase.subjectBay || "Distance Case"}`,
      "Study dibuat dari workbook Aplikasi Crosscheck Setting Relay. Dipakai sebagai benchmark untuk mem-porting flow Excel ke PLMS: DB DIgSILENT, IHS fault level, selector L1-L4, Distance, dan OCR/GFR.",
      scope,
      {
        subjectLabel: `${distanceCase.localSubstation ?? "-"} | ${distanceCase.subjectBay ?? "-"}`,
        sourceBridge: {
          kind: "legacy_crosscheck_workbook",
          sourceRef: CROSSCHECK_WORKBOOK_REGISTRY.fileName,
          distanceCaseLabel: `${distanceCase.localSubstation ?? "-"} / ${distanceCase.subjectBay ?? "-"}`,
          ocrGfrCaseLabel: `${ocrGfrCase.substation ?? "-"} / ${ocrGfrCase.bay ?? "-"}`,
        },
      }
    );
    onClose();
  };

  const canContinueFromSubject = !!selectedSubject?.hasRelation;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create New Study</h2>
            <p className="text-xs text-slate-500 mt-0.5">Define your working network and scope</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex px-6 py-3 bg-slate-50 border-b border-slate-100 text-sm gap-2">
          <div className={`flex items-center gap-2 ${step >= 1 ? "text-blue-700 font-medium" : "text-slate-400"}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step >= 1 ? "bg-blue-100" : "bg-slate-200"}`}>1</div>
            Select Subject
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 mx-2" />
          <div className={`flex items-center gap-2 ${step >= 2 ? "text-blue-700 font-medium" : "text-slate-400"}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step >= 2 ? "bg-blue-100" : "bg-slate-200"}`}>2</div>
            Neighbors Scope
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 mx-2" />
          <div className={`flex items-center gap-2 ${step >= 3 ? "text-blue-700 font-medium" : "text-slate-400"}`}>
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] ${step >= 3 ? "bg-blue-100" : "bg-slate-200"}`}>3</div>
            Confirm
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3">
                    <div className="rounded-md border border-emerald-200 bg-white p-2">
                      <FileSpreadsheet className="h-5 w-5 text-emerald-700" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Start from Legacy Crosscheck Workbook</div>
                      <p className="mt-1 max-w-2xl text-xs text-slate-600">
                        Gunakan workbook crosscheck existing sebagai benchmark study. Flow Excel akan dibawa ke PLMS:
                        pilih bay, ambil DB DIgSILENT/IHS, screening L1-L4, lalu bandingkan output Distance dan OCR/GFR.
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2 text-[10px]">
                        <span className="rounded border border-emerald-200 bg-white px-2 py-0.5 text-emerald-700">
                          {CROSSCHECK_WORKBOOK_REGISTRY.summary.lineRecordCount} line DB
                        </span>
                        <span className="rounded border border-emerald-200 bg-white px-2 py-0.5 text-emerald-700">
                          {CROSSCHECK_WORKBOOK_REGISTRY.summary.faultRecordCount} IHS fault
                        </span>
                        <span className="rounded border border-emerald-200 bg-white px-2 py-0.5 text-emerald-700">
                          {CROSSCHECK_WORKBOOK_REGISTRY.summary.formulaCount} formulas
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCreateLegacyCrosscheckStudy}
                    className="rounded-md border border-emerald-300 bg-white px-3 py-2 text-xs font-medium text-emerald-700 shadow-sm hover:bg-emerald-100"
                  >
                    Create benchmark study
                  </button>
                </div>
              </div>

              <p className="text-sm text-slate-600">
                Pilih bay atau ruas penghantar yang akan menjadi subjek utama study ini. Kandidat diambil dari working corridor dan relation yang sudah dipromosikan dari master ULTG.
              </p>
              
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search GI, bay name, or relation..."
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <div className="border border-slate-200 rounded-lg overflow-hidden flex flex-col max-h-[40vh]">
                <div className="overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">GI/GIS</th>
                        <th className="text-left px-4 py-2 font-medium">Bay</th>
                        <th className="text-left px-4 py-2 font-medium">Relation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCandidates.map(bay => (
                        <tr 
                          key={bay.bayId} 
                          onClick={() => setSubjectBayId(bay.bayId)}
                          className={`cursor-pointer hover:bg-blue-50 transition-colors ${subjectBayId === bay.bayId ? "bg-blue-50" : ""}`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {subjectBayId === bay.bayId ? (
                                <CheckCircle2 className="w-4 h-4 text-blue-600" />
                              ) : (
                                <div className="w-4 h-4 rounded-full border border-slate-300" />
                              )}
                              <div>
                                <div className="font-semibold text-slate-900">{bay.substationCode}</div>
                                <div className="text-[10px] text-slate-500">{bay.substationName}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-700">{bay.bayName}</td>
                          <td className="px-4 py-3 text-slate-600 text-xs">
                            {bay.hasRelation ? bay.relationLabel : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded border border-orange-200 bg-orange-50 text-orange-700">No relation mapped</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {filteredCandidates.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-4 py-8 text-center text-slate-500">No bays found matching your search.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
              {selectedSubject && !selectedSubject.hasRelation && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Bay ini belum punya LineRelation. Lengkapi dulu di Network Builder atau promote endpoint dari Working Network sebelum dibuat menjadi study perhitungan.
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">Berdasarkan subjek yang dipilih, sistem menyarankan network scope berikut untuk perhitungan koordinasi Z2/Z3.</p>
              
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-3">Suggested Study Scope (GI)</div>
                <div className="flex flex-wrap gap-2">
                  {suggestedSubstations.map(sub => (
                    <div key={sub.id} className="flex items-center gap-2 bg-white border border-blue-200 px-3 py-1.5 rounded-md shadow-sm">
                      <div className="w-2 h-2 rounded-full bg-blue-500" />
                      <div>
                        <div className="text-sm font-semibold text-slate-800">{sub.code}</div>
                        <div className="text-[10px] text-slate-500">{sub.name}</div>
                      </div>
                    </div>
                  ))}
                </div>
                {suggestedSubstations.length === 0 && (
                  <div className="text-sm text-slate-500 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Tidak ada neighbor yang dapat disarankan. Pastikan relasi line sudah ter-map di Master Data.
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <p className="text-sm text-slate-600">Berikan nama dan deskripsi untuk study case ini. Scope dapat diubah nanti melalui editor.</p>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Study Name</label>
                  <input
                    type="text"
                    autoFocus
                    placeholder="e.g. Rekonduktoring PIK-DM Bay #2"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={studyName}
                    onChange={(e) => setStudyName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Optional)</label>
                  <textarea
                    placeholder="Tujuan atau catatan study..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 h-24 resize-none"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-xl">
          <button
            onClick={() => step > 1 ? setStep((s) => (s - 1) as WizardStep) : onClose()}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            {step === 1 ? "Cancel" : "Back"}
          </button>
          
          <button
            onClick={() => {
              if (step === 1 && canContinueFromSubject) setStep(2);
              else if (step === 2) setStep(3);
              else if (step === 3) handleCreate();
            }}
            disabled={(step === 1 && !canContinueFromSubject) || (step === 3 && !studyName.trim())}
            className={`px-4 py-2 text-sm font-medium rounded-md shadow-sm transition-colors ${
              (step === 1 && !canContinueFromSubject) || (step === 3 && !studyName.trim())
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {step === 3 ? "Create & Open Workspace" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
