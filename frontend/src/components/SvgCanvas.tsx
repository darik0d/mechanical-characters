// src/SvgCanvas.tsx
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

export type SvgPart = {
  id: string;
  svg: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  bbox: { x: number; y: number; width: number; height: number };
  joints?: { id: string; x: number; y: number }[];
};

interface Props {
  svgs: string[];
  showTrajectory?: boolean;
  trajectory?: [number, number][];
  previewPoint?: [number, number] | null;
}

const SvgCanvas = forwardRef(function SvgCanvas(props: Props, ref) {
  const { svgs, showTrajectory = false, trajectory, previewPoint = null } = props;
  const [parts, setParts] = useState<SvgPart[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const bboxRefs = useRef<Record<string, SVGGElement | null>>({});
  const prevCount = useRef(0);

  // add svgs (avoid duplicating previous ones)
  useEffect(() => {
    if (!svgs || svgs.length <= prevCount.current) return;
    const newOnes = svgs.slice(prevCount.current);
    prevCount.current = svgs.length;
    setParts((prev) => {
      const startIndex = prev.length;
      const added = newOnes.map((s, i) => ({
        id: `p-${Date.now()}-${startIndex + i}`,
        svg: s,
        x: 250 + (startIndex + i) * 40,
        y: 220 + (startIndex + i) * 10,
        scale: 1,
        rotation: 0,
        bbox: { x: 0, y: 0, width: 120, height: 120 },
        joints: [],
      }));
      return [...prev, ...added];
    });
  }, [svgs]);

  useImperativeHandle(ref, () => ({
    getParts: () => parts,
    setParts: (p: SvgPart[]) => setParts(p),
    setSelected: (id: string | null) => setSelectedId(id),
  }));

  // measure bbox after each new item mounted
  useEffect(() => {
    // small timeout to allow DOM injection of svg strings
    const t = setTimeout(() => {
      parts.forEach((p) => {
        const node = bboxRefs.current[p.id];
        if (!node) return;
        try {
          const bb = node.getBBox();
          // update only if changed
          setParts((prev) =>
            prev.map((pp) =>
              pp.id === p.id &&
              (pp.bbox.x !== bb.x ||
                pp.bbox.y !== bb.y ||
                pp.bbox.width !== bb.width ||
                pp.bbox.height !== bb.height)
                ? { ...pp, bbox: bb }
                : pp
            )
          );
        } catch (err) {
          // ignore SVG parsing exceptions
        }
      });
    }, 30);
    return () => clearTimeout(t);
  }, [parts.length]);

  // helpers
  const getCenter = (p: SvgPart) => ({
    cx: p.bbox.x + p.bbox.width / 2,
    cy: p.bbox.y + p.bbox.height / 2,
  });

  const transformFor = (p: SvgPart) => {
    const { cx, cy } = getCenter(p);
    // translate to x,y (world), then move pivot to center, rotate, scale, move back
    return `translate(${p.x}, ${p.y}) translate(${cx}, ${cy}) rotate(${p.rotation}) scale(${p.scale}) translate(${-cx}, ${-cy})`;
  };

  // drag
  const dragRef = useRef<{ id: string; ox: number; oy: number } | null>(null);

  const onMouseDownPart = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const svgEl = svgRef.current!;
    const pt = svgEl.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const cursor = pt.matrixTransform(svgEl.getScreenCTM()!.inverse());
    const part = parts.find((p) => p.id === id)!;
    dragRef.current = { id, ox: cursor.x - part.x, oy: cursor.y - part.y };
    setSelectedId(id);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    // dragging
    if (dragRef.current) {
      const svgEl = svgRef.current!;
      const pt = svgEl.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const cursor = pt.matrixTransform(svgEl.getScreenCTM()!.inverse());
      setParts((prev) =>
        prev.map((p) =>
          p.id === dragRef.current!.id
            ? { ...p, x: cursor.x - dragRef.current!.ox, y: cursor.y - dragRef.current!.oy }
            : p
        )
      );
    }
  };

  const onMouseUp = () => {
    dragRef.current = null;
  };

  // rotation (fix the 90deg jump by storing initial vector & angle)
  const rotateState = useRef<{
    id: string | null;
    startMouseVec?: { x: number; y: number };
    startAngle?: number;
  }>({ id: null });

  const onStartRotate = (e: React.MouseEvent, p: SvgPart) => {
    e.stopPropagation();
    const svgEl = svgRef.current!;
    const pt = svgEl.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const cur = pt.matrixTransform(svgEl.getScreenCTM()!.inverse());
    const { cx, cy } = getCenter(p);
    const worldCx = p.x + cx;
    const worldCy = p.y + cy;
    rotateState.current = {
      id: p.id,
      startMouseVec: { x: cur.x - worldCx, y: cur.y - worldCy },
      startAngle: p.rotation,
    };

    const move = (ev: MouseEvent) => {
      const pt2 = svgEl.createSVGPoint();
      pt2.x = ev.clientX; pt2.y = ev.clientY;
      const cur2 = pt2.matrixTransform(svgEl.getScreenCTM()!.inverse());
      const { startMouseVec, startAngle } = rotateState.current!;
      if (!startMouseVec || startAngle === undefined) return;
      const dx1 = startMouseVec.x, dy1 = startMouseVec.y;
      const dx2 = cur2.x - (p.x + cx), dy2 = cur2.y - (p.y + cy);
      // compute angle between vectors (dx1,dy1) and (dx2,dy2)
      const a1 = Math.atan2(dy1, dx1);
      const a2 = Math.atan2(dy2, dx2);
      const delta = (a2 - a1) * (180 / Math.PI);
      const newAngle = startAngle + delta;
      setParts((prev) => prev.map((q) => (q.id === p.id ? { ...q, rotation: newAngle } : q)));
    };

    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      rotateState.current = { id: null };
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // resizing - 8 handles: tl, t, tr, r, br, b, bl, l
  const onStartResize = (e: React.MouseEvent, p: SvgPart, handle: string) => {
    e.stopPropagation();
    const svgEl = svgRef.current!;
    const startScale = p.scale;
    const { cx, cy } = getCenter(p);
    const worldCx = p.x + cx;
    const worldCy = p.y + cy;
    const pt = svgEl.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const start = pt.matrixTransform(svgEl.getScreenCTM()!.inverse());
    const startDist = Math.hypot(start.x - worldCx, start.y - worldCy);

    const move = (ev: MouseEvent) => {
      const pt2 = svgEl.createSVGPoint();
      pt2.x = ev.clientX; pt2.y = ev.clientY;
      const cur = pt2.matrixTransform(svgEl.getScreenCTM()!.inverse());
      const curDist = Math.hypot(cur.x - worldCx, cur.y - worldCy);
      // scale by ratio; clamp
      const ratio = curDist / (startDist || 1);
      const newScale = Math.max(0.07, startScale * ratio);
      setParts((prev) => prev.map((q) => (q.id === p.id ? { ...q, scale: newScale } : q)));
    };

    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // joint selection simple: click 'Add joint' mode handled by parent; here we provide API to add
  const addJointToPart = (partId: string, x: number, y: number) => {
    setParts((prev) =>
      prev.map((p) => (p.id === partId ? { ...p, joints: [...(p.joints || []), { id: `j-${Date.now()}`, x, y }] } : p))
    );
  };

  // render handles coordinates in part-local bbox
  const handlesFor = (p: SvgPart) => {
    const { x: bx, y: by, width: w, height: h } = p.bbox;
    const midX = bx + w / 2;
    const midY = by + h / 2;
    return [
      { name: "tl", x: bx, y: by },
      { name: "t", x: midX, y: by },
      { name: "tr", x: bx + w, y: by },
      { name: "r", x: bx + w, y: midY },
      { name: "br", x: bx + w, y: by + h },
      { name: "b", x: midX, y: by + h },
      { name: "bl", x: bx, y: by + h },
      { name: "l", x: bx, y: midY },
    ];
  };

  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <svg
        ref={(el) => (svgRef.current = el)}
        width={1000}
        height={700}
        style={{ background: "#fafafa", border: "1px solid #ddd" }}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
      >
        {/* parts */}
        {parts.map((p) => (
          <g
            key={p.id}
            ref={(el) => (bboxRefs.current[p.id] = el)}
            transform={transformFor(p)}
            dangerouslySetInnerHTML={{ __html: p.svg }}
            onMouseDown={(e) => onMouseDownPart(e, p.id)}
          />
        ))}

        {/* UI overlays: selected bounds / handles / joints */}
        {parts.map((p) => {
          const isSelected = p.id === selectedId;
          if (!isSelected) {
            // draw joints if any
            return p.joints?.map((j) => (
              <circle key={j.id} cx={p.x + j.x} cy={p.y + j.y} r={4} fill="crimson" stroke="#000" strokeWidth={0.5} />
            )) ?? null;
          }
          const hs = handlesFor(p);
          return (
            <g key={p.id + "-ui"} transform={transformFor(p)}>
              <rect
                x={p.bbox.x}
                y={p.bbox.y}
                width={p.bbox.width}
                height={p.bbox.height}
                fill="none"
                stroke="#1976d2"
                strokeWidth={1 / p.scale}
                strokeDasharray="4 2"
              />
              {/* handles */}
              {hs.map((h) => (
                <rect
                  key={h.name}
                  x={h.x - 6 / p.scale}
                  y={h.y - 6 / p.scale}
                  width={12 / p.scale}
                  height={12 / p.scale}
                  fill="#fff"
                  stroke="#1976d2"
                  strokeWidth={1 / p.scale}
                  style={{ cursor: "nwse-resize" }}
                  onMouseDown={(e) => onStartResize(e, p, h.name)}
                />
              ))}

              {/* rotation handle */}
              <circle
                cx={p.bbox.x + p.bbox.width / 2}
                cy={p.bbox.y - 28}
                r={9 / p.scale}
                fill="#ffb74d"
                stroke="#ef6c00"
                onMouseDown={(e) => onStartRotate(e, p)}
                style={{ cursor: "grab" }}
              />

              {/* joints drawing */}
              {p.joints?.map((j) => (
                <circle key={j.id} cx={j.x} cy={j.y} r={5 / p.scale} fill="crimson" stroke="#000" strokeWidth={0.3} />
              ))}
            </g>
          );
        })}

        {/* trajectory overlay */}
        {showTrajectory && trajectory && (
          <g>
            <path
              d={trajectoryToPath(trajectory)}
              fill="none"
              stroke="#ff4081"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
          </g>
        )}

        {/* preview moving point */}
        {previewPoint && (
          <circle cx={previewPoint[0]} cy={previewPoint[1]} r={6} fill="#43a047" stroke="#000" strokeWidth={0.8} />
        )}
      </svg>
    </div>
  );
});

// helper to convert points to path
function trajectoryToPath(pts?: [number, number][]) {
  if (!pts || pts.length === 0) return "";
  return "M " + pts.map((p) => `${p[0]} ${p[1]}`).join(" L ");
}

export default SvgCanvas;