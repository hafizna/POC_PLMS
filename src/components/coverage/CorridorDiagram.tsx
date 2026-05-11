import { useEffect, useRef, useMemo } from "react";
import * as d3 from "d3";
import { Corridor, Relay } from "../../domain/types";
import { useProsetStore } from "../../store/useProsetStore";
import {
  buildCorridorSegments,
  computeRelayZoneExtents,
  corridorTotalKm,
} from "../../lib/corridor-math";

type Props = { corridor: Corridor };

const ZONE_COLORS = {
  Z1: { stroke: "#dc2626", fill: "rgba(220, 38, 38, 0.45)" },
  Z2: { stroke: "#ea580c", fill: "rgba(234, 88, 12, 0.32)" },
  Z3: { stroke: "#d97706", fill: "rgba(217, 119, 6, 0.22)" },
};

const LAYOUT = {
  marginLeft: 120,
  marginRight: 60,
  marginTop: 20,
  rulerHeight: 40,
  forwardLanesY: 70,
  laneHeight: 38,
  oneLineGap: 30,
  oneLineHeight: 70,
  reverseLanesGap: 16,
  timeChartGap: 40,
  timeRowHeight: 22,
};

export function CorridorDiagram({ corridor }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const topology = useProsetStore((s) => s.topology);
  const overrides = useProsetStore((s) => s.relayOverrides);
  const getEffectiveRelay = useProsetStore((s) => s.getEffectiveRelay);
  const selectRelay = useProsetStore((s) => s.selectRelay);
  const openRxModal = useProsetStore((s) => s.openRxModal);
  const selectedRelayId = useProsetStore((s) => s.selectedRelayId);

  const corridorSegments = useMemo(
    () => buildCorridorSegments(corridor, topology),
    [corridor, topology]
  );

  // Relays whose segment is in this corridor
  const corridorRelays = useMemo(() => {
    const segIds = new Set(corridor.ordered_segment_ids);
    return topology.relays
      .filter((r) => segIds.has(r.segment_id))
      .map((r) => getEffectiveRelay(r.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corridor, topology, overrides]);

  const forwardRelays = corridorRelays.filter((r) => r.direction === "forward");
  const reverseRelays = corridorRelays.filter((r) => r.direction === "reverse");

  // Detect branch points: substations with more than one outgoing segment.
  const branchPoints = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const seg of topology.segments) {
      if (!map.has(seg.from_substation)) map.set(seg.from_substation, []);
      map.get(seg.from_substation)!.push(seg.id);
    }
    const corridorSegIds = new Set(corridor.ordered_segment_ids);
    const result: { subId: string; offCorridorSegments: string[] }[] = [];
    for (const [sub, segIds] of map.entries()) {
      const off = segIds.filter((s) => !corridorSegIds.has(s));
      if (off.length > 0 && segIds.some((s) => corridorSegIds.has(s))) {
        result.push({ subId: sub, offCorridorSegments: off });
      }
    }
    return result;
  }, [corridor, topology]);

  useEffect(() => {
    if (!ref.current || !containerRef.current) return;
    drawDiagram();

    const ro = new ResizeObserver(() => drawDiagram());
    ro.observe(containerRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corridor, overrides, selectedRelayId]);

  function drawDiagram() {
    if (!ref.current || !containerRef.current) return;
    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const containerWidth = containerRef.current.clientWidth;
    const totalKm = corridorTotalKm(corridorSegments);
    const axisUnit = corridor.axis_unit_label ?? "km";
    const plotWidth = containerWidth - LAYOUT.marginLeft - LAYOUT.marginRight;

    // x scale: km -> px. Allow overshoot beyond corridor for over-reaching zones.
    const overshoot = totalKm * 0.15;
    const x = d3
      .scaleLinear()
      .domain([0, totalKm + overshoot])
      .range([LAYOUT.marginLeft, LAYOUT.marginLeft + plotWidth]);

    // Compute layout y positions
    const yForwardStart = LAYOUT.marginTop + LAYOUT.rulerHeight + 18;
    const yForwardEnd = yForwardStart + forwardRelays.length * LAYOUT.laneHeight;
    const yOneLineCenter = yForwardEnd + LAYOUT.oneLineGap;
    const yReverseStart = yOneLineCenter + LAYOUT.oneLineHeight / 2 + LAYOUT.reverseLanesGap;
    const yReverseEnd = yReverseStart + reverseRelays.length * LAYOUT.laneHeight;
    const yTimeChartStart = yReverseEnd + LAYOUT.timeChartGap;
    const yTimeChartEnd = yTimeChartStart + 30 + corridorRelays.length * LAYOUT.timeRowHeight;

    const totalHeight = yTimeChartEnd + 20;
    svg
      .attr("viewBox", `0 0 ${containerWidth} ${totalHeight}`)
      .attr("width", containerWidth)
      .attr("height", totalHeight);

    // ===== DISTANCE RULER =====
    const rulerY = LAYOUT.marginTop + LAYOUT.rulerHeight - 12;
    svg
      .append("line")
      .attr("x1", x(0))
      .attr("x2", x(totalKm + overshoot))
      .attr("y1", rulerY)
      .attr("y2", rulerY)
      .attr("stroke", "#cbd5e1")
      .attr("stroke-width", 1);

    const tickStep = totalKm <= 10 ? 1 : totalKm <= 25 ? 2 : 5;
    for (let km = 0; km <= totalKm + overshoot; km += tickStep) {
      svg
        .append("line")
        .attr("x1", x(km))
        .attr("x2", x(km))
        .attr("y1", rulerY - 4)
        .attr("y2", rulerY + 4)
        .attr("stroke", "#94a3b8");
      svg
        .append("text")
        .attr("x", x(km))
        .attr("y", rulerY - 8)
        .attr("text-anchor", "middle")
        .attr("font-size", 10)
        .attr("fill", "#64748b")
        .text(`${km}`);
    }
    svg
      .append("text")
      .attr("x", x(totalKm + overshoot) + 6)
      .attr("y", rulerY + 4)
      .attr("font-size", 10)
      .attr("fill", "#64748b")
      .text(axisUnit);

    // ===== FORWARD LANES =====
    svg
      .append("text")
      .attr("x", LAYOUT.marginLeft - 10)
      .attr("y", yForwardStart - 4)
      .attr("text-anchor", "end")
      .attr("font-size", 10)
      .attr("font-weight", 600)
      .attr("fill", "#475569")
      .text("FORWARD");

    forwardRelays.forEach((relay, i) => {
      drawRelayLane(svg, relay, x, yForwardStart + i * LAYOUT.laneHeight, true, {
        selectRelay,
        openRxModal,
        selectedRelayId,
        corridorSegments,
      });
    });

    // ===== ONE-LINE DIAGRAM =====
    drawOneLine(svg, corridor, topology, corridorSegments, x, yOneLineCenter, branchPoints);

    // ===== REVERSE LANES =====
    svg
      .append("text")
      .attr("x", LAYOUT.marginLeft - 10)
      .attr("y", yReverseStart + 12)
      .attr("text-anchor", "end")
      .attr("font-size", 10)
      .attr("font-weight", 600)
      .attr("fill", "#475569")
      .text("REVERSE");

    reverseRelays.forEach((relay, i) => {
      drawRelayLane(svg, relay, x, yReverseStart + i * LAYOUT.laneHeight, false, {
        selectRelay,
        openRxModal,
        selectedRelayId,
        corridorSegments,
      });
    });

    // ===== TIME GRADING CHART =====
    drawTimeGrading(svg, corridorRelays, yTimeChartStart, plotWidth);

    // Legend
    drawLegend(svg, containerWidth);
  }

  return (
    <div ref={containerRef} className="w-full overflow-x-auto">
      <svg ref={ref} className="block" />
    </div>
  );
}

// =============================================================================
// Helper drawing functions
// =============================================================================

function drawRelayLane(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  relay: Relay,
  x: d3.ScaleLinear<number, number>,
  laneTop: number,
  isForward: boolean,
  ctx: {
    selectRelay: (id: string) => void;
    openRxModal: () => void;
    selectedRelayId: string | null;
    corridorSegments: ReturnType<typeof buildCorridorSegments>;
  }
) {
  const extents = computeRelayZoneExtents(relay, ctx.corridorSegments);
  if (!extents) return;

  const { startKm, zone_extents } = extents;

  // Lane background
  const isSelected = ctx.selectedRelayId === relay.id;
  svg
    .append("rect")
    .attr("x", x(0))
    .attr("y", laneTop)
    .attr("width", x.range()[1] - x.range()[0])
    .attr("height", LAYOUT.laneHeight - 4)
    .attr("fill", isSelected ? "#dbeafe" : "transparent")
    .attr("stroke", isSelected ? "#3b82f6" : "transparent")
    .attr("stroke-width", 1)
    .attr("rx", 3);

  // Relay label on left
  const subShort = relay.substation_id.replace("sub_", "").toUpperCase();
  const arrow = isForward ? "→" : "←";
  svg
    .append("text")
    .attr("x", LAYOUT.marginLeft - 10)
    .attr("y", laneTop + 14)
    .attr("text-anchor", "end")
    .attr("font-size", 11)
    .attr("font-weight", 600)
    .attr("fill", "#0f172a")
    .text(`${subShort} ${arrow}`);
  svg
    .append("text")
    .attr("x", LAYOUT.marginLeft - 10)
    .attr("y", laneTop + 26)
    .attr("text-anchor", "end")
    .attr("font-size", 9)
    .attr("fill", "#64748b")
    .text(`${relay.make} ${relay.model}`);

  // F21 box at relay position (textbook convention)
  const startX = x(startKm);
  svg
    .append("rect")
    .attr("x", startX - 8)
    .attr("y", laneTop + 8)
    .attr("width", 16)
    .attr("height", 14)
    .attr("fill", "white")
    .attr("stroke", "#475569")
    .attr("stroke-width", 1);
  svg
    .append("text")
    .attr("x", startX)
    .attr("y", laneTop + 18)
    .attr("text-anchor", "middle")
    .attr("font-size", 9)
    .attr("font-weight", 600)
    .attr("fill", "#0f172a")
    .text("21");
  // Arrow
  svg
    .append("text")
    .attr("x", startX + (isForward ? 14 : -14))
    .attr("y", laneTop + 18)
    .attr("text-anchor", "middle")
    .attr("font-size", 11)
    .attr("fill", "#475569")
    .text(isForward ? "→" : "←");

  // Three zones rendered as concentric/overlapping bars from relay startKm
  // Z1 innermost (most opaque), Z3 outermost (least opaque)
  const barTop = laneTop + 8;
  const barHeight = 16;

  // Draw in Z3, Z2, Z1 order so Z1 is on top
  const zonesInOrder = [
    { ...zone_extents[2], z: relay.zones[2] },
    { ...zone_extents[1], z: relay.zones[1] },
    { ...zone_extents[0], z: relay.zones[0] },
  ];

  for (const ext of zonesInOrder) {
    const zid = ext.z.id;
    const colors = ZONE_COLORS[zid];
    const endKm = ext.endpoint.km;
    const xStart = isForward ? startX : x(endKm);
    const xEnd = isForward ? x(endKm) : startX;
    const w = Math.max(2, xEnd - xStart);

    svg
      .append("rect")
      .attr("x", xStart)
      .attr("y", barTop)
      .attr("width", w)
      .attr("height", barHeight)
      .attr("fill", colors.fill)
      .attr("stroke", colors.stroke)
      .attr("stroke-width", 1);

    // Beyond-corridor indicator
    if (ext.endpoint.beyond_corridor) {
      const tipX = isForward ? xEnd - 1 : xStart + 1;
      svg
        .append("path")
        .attr("d", isForward
          ? `M ${tipX - 6} ${barTop + 2} L ${tipX + 4} ${barTop + barHeight / 2} L ${tipX - 6} ${barTop + barHeight - 2} Z`
          : `M ${tipX + 6} ${barTop + 2} L ${tipX - 4} ${barTop + barHeight / 2} L ${tipX + 6} ${barTop + barHeight - 2} Z`)
        .attr("fill", colors.stroke);
    }
  }

  // Zone labels (right side of bar) - use Z1 only since they overlap visually
  const z1End = zone_extents[0].endpoint.km;
  const z2End = zone_extents[1].endpoint.km;
  const z3End = zone_extents[2].endpoint.km;
  const labelOffset = isForward ? -2 : 2;
  const labelAnchor = isForward ? "end" : "start";

  // Tick marks at each zone boundary
  for (const [zid, endKm] of [["Z1", z1End], ["Z2", z2End], ["Z3", z3End]] as const) {
    const tickX = x(endKm);
    svg
      .append("line")
      .attr("x1", tickX)
      .attr("x2", tickX)
      .attr("y1", barTop - 2)
      .attr("y2", barTop + barHeight + 2)
      .attr("stroke", ZONE_COLORS[zid].stroke)
      .attr("stroke-width", 1.5);
    svg
      .append("text")
      .attr("x", tickX)
      .attr("y", barTop - 4)
      .attr("text-anchor", "middle")
      .attr("font-size", 8)
      .attr("font-weight", 600)
      .attr("fill", ZONE_COLORS[zid].stroke)
      .text(zid);
  }

  // Click target (transparent rect over the lane)
  svg
    .append("rect")
    .attr("x", x(0))
    .attr("y", laneTop)
    .attr("width", x.range()[1] - x.range()[0])
    .attr("height", LAYOUT.laneHeight - 4)
    .attr("fill", "transparent")
    .style("cursor", "pointer")
    .on("click", () => {
      ctx.selectRelay(relay.id);
    })
    .on("dblclick", () => {
      ctx.selectRelay(relay.id);
      ctx.openRxModal();
    })
    .append("title")
    .text(`${relay.bay_name}\nClick to select | Double-click for R-X plane drilldown`);
}

function drawOneLine(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  corridor: Corridor,
  topology: { substations: any[] },
  corridorSegments: ReturnType<typeof buildCorridorSegments>,
  x: d3.ScaleLinear<number, number>,
  yCenter: number,
  branchPoints: { subId: string; offCorridorSegments: string[] }[]
) {
  // Main horizontal line
  for (const cs of corridorSegments) {
    svg
      .append("line")
      .attr("x1", x(cs.start_km))
      .attr("x2", x(cs.end_km))
      .attr("y1", yCenter)
      .attr("y2", yCenter)
      .attr("stroke", "#334155")
      .attr("stroke-width", 3);
    // Segment label below
    svg
      .append("text")
      .attr("x", x((cs.start_km + cs.end_km) / 2))
      .attr("y", yCenter + 18)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("fill", "#475569")
      .text(
        `${cs.segment.length_km} ${corridor.axis_unit_label ?? "km"} | ${cs.segment.conductor.type}`
      );
    svg
      .append("text")
      .attr("x", x((cs.start_km + cs.end_km) / 2))
      .attr("y", yCenter + 30)
      .attr("text-anchor", "middle")
      .attr("font-size", 9)
      .attr("fill", "#94a3b8")
      .text(
        `ZL = ${(cs.segment.length_km * cs.X_per_km).toFixed(2)} ohm @ X-axis`
      );
  }

  // Substations
  const subPositions = new Map<string, number>();
  if (corridorSegments.length > 0) {
    subPositions.set(corridorSegments[0].segment.from_substation, corridorSegments[0].start_km);
    for (const cs of corridorSegments) {
      subPositions.set(cs.segment.to_substation, cs.end_km);
    }
  }

  for (const [subId, km] of subPositions) {
    const sub = topology.substations.find((s: any) => s.id === subId);
    if (!sub) continue;
    const sx = x(km);
    // Substation tower mark (vertical line)
    svg
      .append("line")
      .attr("x1", sx)
      .attr("x2", sx)
      .attr("y1", yCenter - 18)
      .attr("y2", yCenter + 8)
      .attr("stroke", "#0f172a")
      .attr("stroke-width", 3);
    // Box label
    svg
      .append("rect")
      .attr("x", sx - 22)
      .attr("y", yCenter - 32)
      .attr("width", 44)
      .attr("height", 14)
      .attr("fill", "#334155")
      .attr("rx", 2);
    svg
      .append("text")
      .attr("x", sx)
      .attr("y", yCenter - 21)
      .attr("text-anchor", "middle")
      .attr("font-size", 10)
      .attr("font-weight", 600)
      .attr("fill", "white")
      .text(sub.short_code);
    // Full name below
    svg
      .append("text")
      .attr("x", sx)
      .attr("y", yCenter - 36)
      .attr("text-anchor", "middle")
      .attr("font-size", 9)
      .attr("fill", "#64748b")
      .text(sub.name);
  }

  // Branch stubs at branching substations: dashed off-ramps to off-corridor destinations
  for (const bp of branchPoints) {
    const km = subPositions.get(bp.subId);
    if (km === undefined) continue;
    const sx = x(km);
    bp.offCorridorSegments.forEach((segId, i) => {
      const seg = (topology as any).segments?.find((s: any) => s.id === segId);
      if (!seg) return;
      const otherEnd = seg.from_substation === bp.subId ? seg.to_substation : seg.from_substation;
      const otherSub = (topology as any).substations.find((s: any) => s.id === otherEnd);
      const stubLen = 50;
      const stubAngle = i === 0 ? 35 : -35;
      const dx = stubLen * Math.cos((stubAngle * Math.PI) / 180);
      const dy = -stubLen * Math.sin((stubAngle * Math.PI) / 180);
      svg
        .append("line")
        .attr("x1", sx)
        .attr("y1", yCenter)
        .attr("x2", sx + dx)
        .attr("y2", yCenter + dy)
        .attr("stroke", "#cbd5e1")
        .attr("stroke-width", 2)
        .attr("stroke-dasharray", "3,3");
      svg
        .append("text")
        .attr("x", sx + dx + 4)
        .attr("y", yCenter + dy + 3)
        .attr("font-size", 9)
        .attr("fill", "#94a3b8")
        .text(`→ ${otherSub?.short_code ?? otherEnd}`);
    });
  }
}

function drawTimeGrading(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  relays: Relay[],
  yTop: number,
  plotWidth: number
) {
  const maxTime = 2.0; // s
  const tx = d3
    .scaleLinear()
    .domain([0, maxTime])
    .range([LAYOUT.marginLeft, LAYOUT.marginLeft + plotWidth]);

  svg
    .append("text")
    .attr("x", LAYOUT.marginLeft - 10)
    .attr("y", yTop)
    .attr("text-anchor", "end")
    .attr("font-size", 10)
    .attr("font-weight", 600)
    .attr("fill", "#475569")
    .text("TIME GRADING");

  // Axis
  svg
    .append("line")
    .attr("x1", tx(0))
    .attr("x2", tx(maxTime))
    .attr("y1", yTop + 14)
    .attr("y2", yTop + 14)
    .attr("stroke", "#cbd5e1");

  for (const t of [0, 0.4, 0.8, 1.2, 1.6, 2.0]) {
    svg
      .append("line")
      .attr("x1", tx(t))
      .attr("x2", tx(t))
      .attr("y1", yTop + 11)
      .attr("y2", yTop + 17)
      .attr("stroke", "#94a3b8");
    svg
      .append("text")
      .attr("x", tx(t))
      .attr("y", yTop + 8)
      .attr("text-anchor", "middle")
      .attr("font-size", 9)
      .attr("fill", "#64748b")
      .text(`${t}s`);
  }

  let row = 0;
  for (const relay of relays) {
    const subShort = relay.substation_id.replace("sub_", "").toUpperCase();
    const arrow = relay.direction === "forward" ? "→" : "←";
    const rowY = yTop + 28 + row * LAYOUT.timeRowHeight;
    svg
      .append("text")
      .attr("x", LAYOUT.marginLeft - 10)
      .attr("y", rowY + 8)
      .attr("text-anchor", "end")
      .attr("font-size", 9)
      .attr("fill", "#475569")
      .text(`${subShort} ${arrow}`);

    relay.zones.forEach((z) => {
      const c = ZONE_COLORS[z.id];
      const t = z.time_delay_pp_s;
      svg
        .append("rect")
        .attr("x", tx(0))
        .attr("y", rowY + 2)
        .attr("width", Math.max(2, tx(t) - tx(0)))
        .attr("height", 12)
        .attr("fill", c.fill)
        .attr("stroke", c.stroke);
      svg
        .append("circle")
        .attr("cx", tx(t))
        .attr("cy", rowY + 8)
        .attr("r", 3)
        .attr("fill", c.stroke);
    });
    row++;
  }
}

function drawLegend(
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
  width: number
) {
  const legendX = width - 220;
  const legendY = 4;
  const items = [
    { label: "Z1 instantaneous", color: ZONE_COLORS.Z1 },
    { label: "Z2 (~0.4s)", color: ZONE_COLORS.Z2 },
    { label: "Z3 backup (~1.6s)", color: ZONE_COLORS.Z3 },
  ];
  items.forEach((it, i) => {
    const xPos = legendX + i * 75;
    svg
      .append("rect")
      .attr("x", xPos)
      .attr("y", legendY)
      .attr("width", 12)
      .attr("height", 10)
      .attr("fill", it.color.fill)
      .attr("stroke", it.color.stroke);
    svg
      .append("text")
      .attr("x", xPos + 16)
      .attr("y", legendY + 9)
      .attr("font-size", 9)
      .attr("fill", "#475569")
      .text(it.label);
  });
}
