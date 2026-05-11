import { useEffect, useRef } from "react";
import * as d3 from "d3";
import { useProsetStore } from "../../store/useProsetStore";
import { quadrilateralCorners, mhoCircle, loadEncroachmentPolygon } from "../../lib/impedance-math";
import { X } from "lucide-react";

const ZONE_COLORS = {
  Z1: { stroke: "#dc2626", fill: "rgba(220, 38, 38, 0.18)" },
  Z2: { stroke: "#ea580c", fill: "rgba(234, 88, 12, 0.13)" },
  Z3: { stroke: "#d97706", fill: "rgba(217, 119, 6, 0.09)" },
};

export function RXPlaneModal() {
  const open = useProsetStore((s) => s.rxModalOpen);
  const close = useProsetStore((s) => s.closeRxModal);
  const selectedRelayId = useProsetStore((s) => s.selectedRelayId);
  const getEffectiveRelay = useProsetStore((s) => s.getEffectiveRelay);
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!open || !selectedRelayId || !ref.current) return;
    drawRxPlane();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedRelayId]);

  if (!open || !selectedRelayId) return null;

  const relay = getEffectiveRelay(selectedRelayId);

  function drawRxPlane() {
    if (!ref.current) return;
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const W = 600;
    const H = 600;
    svg.attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H);

    // Determine plot extent from largest zone reach
    const maxReach = Math.max(...relay.zones.map((z) => z.X_reach_ohm));
    const maxR = Math.max(...relay.zones.map((z) => z.RFPP_ohm_per_loop));
    const maxLoad = relay.load_encroachment.RLdFw_ohm_per_phase;
    const extent = Math.max(maxReach * 1.4, maxR * 1.2, maxLoad * 1.2, 5);

    const x = d3.scaleLinear().domain([-extent * 0.4, extent]).range([40, W - 40]);
    const y = d3.scaleLinear().domain([-extent * 0.2, extent]).range([H - 40, 40]);

    // Grid
    const xTicks = x.ticks(10);
    const yTicks = y.ticks(10);
    for (const t of xTicks) {
      svg
        .append("line")
        .attr("x1", x(t))
        .attr("x2", x(t))
        .attr("y1", y.range()[1])
        .attr("y2", y.range()[0])
        .attr("stroke", "#f1f5f9");
    }
    for (const t of yTicks) {
      svg
        .append("line")
        .attr("x1", x.range()[0])
        .attr("x2", x.range()[1])
        .attr("y1", y(t))
        .attr("y2", y(t))
        .attr("stroke", "#f1f5f9");
    }

    // Axes
    svg
      .append("line")
      .attr("x1", x(0))
      .attr("x2", x(0))
      .attr("y1", y.range()[1])
      .attr("y2", y.range()[0])
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1);
    svg
      .append("line")
      .attr("x1", x.range()[0])
      .attr("x2", x.range()[1])
      .attr("y1", y(0))
      .attr("y2", y(0))
      .attr("stroke", "#94a3b8")
      .attr("stroke-width", 1);

    // Tick labels
    for (const t of xTicks) {
      if (t === 0) continue;
      svg
        .append("text")
        .attr("x", x(t))
        .attr("y", y(0) + 14)
        .attr("text-anchor", "middle")
        .attr("font-size", 9)
        .attr("fill", "#64748b")
        .text(t);
    }
    for (const t of yTicks) {
      if (t === 0) continue;
      svg
        .append("text")
        .attr("x", x(0) - 6)
        .attr("y", y(t) + 3)
        .attr("text-anchor", "end")
        .attr("font-size", 9)
        .attr("fill", "#64748b")
        .text(t);
    }

    svg
      .append("text")
      .attr("x", x.range()[1])
      .attr("y", y(0) - 6)
      .attr("text-anchor", "end")
      .attr("font-size", 11)
      .attr("font-weight", 600)
      .attr("fill", "#475569")
      .text("R (Ω)");
    svg
      .append("text")
      .attr("x", x(0) + 6)
      .attr("y", y.range()[1] + 14)
      .attr("font-size", 11)
      .attr("font-weight", 600)
      .attr("fill", "#475569")
      .text("X (Ω)");

    // Load encroachment first (lowest z-order)
    const lePoly = loadEncroachmentPolygon(
      relay.load_encroachment.RLdFw_ohm_per_phase,
      relay.load_encroachment.ArgLd_deg
    );
    svg
      .append("polygon")
      .attr(
        "points",
        lePoly.map((p) => `${x(p.R)},${y(p.X)}`).join(" ")
      )
      .attr("fill", "rgba(100, 116, 139, 0.12)")
      .attr("stroke", "#64748b")
      .attr("stroke-width", 1)
      .attr("stroke-dasharray", "4,2");
    svg
      .append("text")
      .attr("x", x(relay.load_encroachment.RLdFw_ohm_per_phase * 0.6))
      .attr("y", y(0) + 28)
      .attr("font-size", 10)
      .attr("fill", "#64748b")
      .text("load encroachment");

    // Draw zones in Z3 -> Z2 -> Z1 order (Z1 on top)
    for (let i = 2; i >= 0; i--) {
      const z = relay.zones[i];
      const c = ZONE_COLORS[z.id];
      const corners = quadrilateralCorners(z, relay.characteristic_angle_deg, "PP");
      svg
        .append("polygon")
        .attr("points", corners.map((p) => `${x(p.R)},${y(p.X)}`).join(" "))
        .attr("fill", c.fill)
        .attr("stroke", c.stroke)
        .attr("stroke-width", 1.5);

      // MHO overlay (dashed)
      const mho = mhoCircle(z, relay.characteristic_angle_deg);
      svg
        .append("circle")
        .attr("cx", x(mho.centerR))
        .attr("cy", y(mho.centerX))
        .attr("r", Math.abs(x(mho.radius) - x(0)))
        .attr("fill", "none")
        .attr("stroke", c.stroke)
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", "3,3")
        .attr("opacity", 0.5);

      // Zone label at the top corner
      const label = corners[2];
      svg
        .append("text")
        .attr("x", x(label.R) + 4)
        .attr("y", y(label.X) - 4)
        .attr("font-size", 11)
        .attr("font-weight", 700)
        .attr("fill", c.stroke)
        .text(z.id);
    }

    // Line vector
    const angle = (relay.characteristic_angle_deg * Math.PI) / 180;
    const ZL_X = relay.zones[0].X_reach_ohm / 0.8; // back-derive line X from Z1 = 0.8 * line
    const ZL_R = ZL_X / Math.tan(angle);
    svg
      .append("line")
      .attr("x1", x(0))
      .attr("y1", y(0))
      .attr("x2", x(ZL_R))
      .attr("y2", y(ZL_X))
      .attr("stroke", "#1e40af")
      .attr("stroke-width", 2.5);
    svg
      .append("circle")
      .attr("cx", x(ZL_R))
      .attr("cy", y(ZL_X))
      .attr("r", 4)
      .attr("fill", "#1e40af");
    svg
      .append("text")
      .attr("x", x(ZL_R) + 8)
      .attr("y", y(ZL_X))
      .attr("font-size", 10)
      .attr("font-weight", 600)
      .attr("fill", "#1e40af")
      .text("ZL (line vector)");
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4"
      onClick={close}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-200 p-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              R-X Plane: {relay.bay_name}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {relay.make} {relay.model} | char angle {relay.characteristic_angle_deg}°
              {" | "}
              <span className="font-mono">primary ohm</span>
            </p>
          </div>
          <button
            onClick={close}
            className="p-1 hover:bg-slate-100 rounded"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>
        <div className="p-4">
          <svg ref={ref} className="block mx-auto bg-white" />
          <div className="mt-3 text-xs text-slate-500 leading-relaxed">
            Quadrilateral characteristic in solid color, MHO circle in dashed overlay.
            Line vector ZL in blue. Load encroachment area in gray (right half-plane wedge).
            Zones tilted at the line characteristic angle.
          </div>
        </div>
      </div>
    </div>
  );
}
