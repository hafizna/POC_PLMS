import { useProsetStore } from "../../store/useProsetStore";
import { NumberInput } from "../shared/NumberInput";
import { ZoneId } from "../../domain/types";
import { Maximize2, RotateCcw } from "lucide-react";

export function ZoneParameterPanel() {
  const selectedRelayId = useProsetStore((s) => s.selectedRelayId);
  const getEffectiveRelay = useProsetStore((s) => s.getEffectiveRelay);
  const updateZone = useProsetStore((s) => s.updateZone);
  const resetRelay = useProsetStore((s) => s.resetRelay);
  const overrides = useProsetStore((s) => s.relayOverrides);
  const openRxModal = useProsetStore((s) => s.openRxModal);

  if (!selectedRelayId) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6 text-center text-sm text-slate-500">
        Click a relay in the diagram to view and edit its parameters.
      </div>
    );
  }

  const relay = getEffectiveRelay(selectedRelayId);
  const hasOverrides = !!overrides[selectedRelayId];

  return (
    <div className="bg-white border border-slate-200 rounded-lg">
      <div className="border-b border-slate-200 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-slate-900 leading-snug break-words">
              {relay.bay_name}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {relay.make} {relay.model} | {relay.direction}
              {relay.is_synthetic && (
                <span className="ml-1 text-amber-600">(synthetic data)</span>
              )}
            </p>
            {relay.setting_doc_no && (
              <p className="text-[10px] text-slate-400 mt-1 font-mono">
                {relay.setting_doc_no} | {relay.setting_doc_valid_from}
              </p>
            )}
          </div>
          <button
            onClick={openRxModal}
            className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 whitespace-nowrap"
            title="Open R-X plane drilldown"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            R-X
          </button>
        </div>
        {hasOverrides && (
          <button
            onClick={() => resetRelay(selectedRelayId)}
            className="mt-2 text-xs text-slate-600 hover:text-slate-900 flex items-center gap-1"
          >
            <RotateCcw className="w-3 h-3" /> Reset zones to approved values
          </button>
        )}
      </div>

      <div className="p-4 space-y-5">
        {(["Z1", "Z2", "Z3"] as ZoneId[]).map((zid, i) => {
          const z = relay.zones[i];
          const colors = {
            Z1: "border-l-red-600 bg-red-50",
            Z2: "border-l-orange-600 bg-orange-50",
            Z3: "border-l-amber-600 bg-amber-50",
          }[zid];
          const overrideZ = overrides[selectedRelayId]?.zones?.[zid];
          const isEdited = (k: keyof typeof z) => overrideZ && k in overrideZ;

          return (
            <div key={zid} className={`border-l-4 pl-3 -ml-3 ${colors} pr-3 py-2 rounded-r`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-900">
                  Zone {zid.slice(1)}
                </h3>
                <span className="text-[10px] text-slate-500 font-mono">
                  t = {z.time_delay_pp_s}s
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumberInput
                  label="X reach"
                  value={z.X_reach_ohm}
                  unit="Ω"
                  edited={isEdited("X_reach_ohm")}
                  onChange={(v) =>
                    updateZone(selectedRelayId, zid, { X_reach_ohm: v })
                  }
                />
                <NumberInput
                  label="R reach"
                  value={z.R_reach_ohm}
                  unit="Ω"
                  edited={isEdited("R_reach_ohm")}
                  onChange={(v) =>
                    updateZone(selectedRelayId, zid, { R_reach_ohm: v })
                  }
                />
                <NumberInput
                  label="RFPP"
                  value={z.RFPP_ohm_per_loop}
                  unit="Ω/loop"
                  edited={isEdited("RFPP_ohm_per_loop")}
                  onChange={(v) =>
                    updateZone(selectedRelayId, zid, { RFPP_ohm_per_loop: v })
                  }
                />
                <NumberInput
                  label="RFPE"
                  value={z.RFPE_ohm_per_loop}
                  unit="Ω/loop"
                  edited={isEdited("RFPE_ohm_per_loop")}
                  onChange={(v) =>
                    updateZone(selectedRelayId, zid, { RFPE_ohm_per_loop: v })
                  }
                />
                <NumberInput
                  label="t (PP)"
                  value={z.time_delay_pp_s}
                  unit="s"
                  step={0.05}
                  edited={isEdited("time_delay_pp_s")}
                  onChange={(v) =>
                    updateZone(selectedRelayId, zid, { time_delay_pp_s: v })
                  }
                />
                <NumberInput
                  label="t (PE)"
                  value={z.time_delay_pe_s}
                  unit="s"
                  step={0.05}
                  edited={isEdited("time_delay_pe_s")}
                  onChange={(v) =>
                    updateZone(selectedRelayId, zid, { time_delay_pe_s: v })
                  }
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
