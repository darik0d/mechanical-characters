import React, {
  useRef,
  useState,
  useEffect,
  forwardRef,
  useImperativeHandle,
} from "react";

interface SvgPart {
  id: string;
  svg: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  bbox: { x: number; y: number; width: number; height: number };
}

interface Props {
  svgs: string[];
}

const SvgCanvas = forwardRef(function SvgCanvas({ svgs }: Props, ref) {
  const [parts, setParts] = useState<SvgPart[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const bboxRefs = useRef<Record<string, SVGGElement | null>>({});

  // Track previous count so svg injection doesn't duplicate
  const prevCount = useRef(0);

  /** Center helpers */
  const getBBoxCenter = (p: SvgPart) => {
    return {
      cx: p.bbox.x + p.bbox.width / 2,
      cy: p.bbox.y + p.bbox.height / 2,
    };
  };

  /** Apply transforms around center */
  const getTransform = (p: SvgPart) => {
    const { cx, cy } = getBBoxCenter(p);
    return `
      translate(${p.x}, ${p.y})
      translate(${cx}, ${cy})
      rotate(${p.rotation})
      scale(${p.scale})
      translate(${-cx}, ${-cy})
    `;
  };

  /** 1. Inject NEW svgs only */
  useEffect(() => {
    if (svgs.length <= prevCount.current) return;

    const newOnes = svgs.slice(prevCount.current);
    prevCount.current = svgs.length;

    const newParts = newOnes.map((svg, i) => ({
      id: `p-${Date.now()}-${i}`,
      svg,
      x: 200 + parts.length * 50,
      y: 250,
      rotation: 0,
      scale: 1,
      bbox: { x: 0, y: 0, width: 100, height: 100 },
    }));

    setParts((prev) => [...prev, ...newParts]);
  }, [svgs]);

  /** Expose parts to parent */
  useImperativeHandle(ref, () => ({
    getParts: () => parts,
    setParts: (p: SvgPart[]) => setParts(p),
  }));

  /** 2. Measure bounding boxes only when new parts are added */
  useEffect(() => {
    parts.forEach((p) => {
      const el = bboxRefs.current[p.id];
      if (!el) return;
      const bb = el.getBBox();
      setParts((prev) =>
        prev.map((pp) => (pp.id === p.id ? { ...pp, bbox: bb } : pp))
      );
    });
  }, [parts.length]);

  // -----------------------------------------------------------------------------
  // DRAG LOGIC
  // -----------------------------------------------------------------------------

  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(
    null
  );

  const onDownPart = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedId(id);

    const part = parts.find((p) => p.id === id)!;

    const pt = svgRef.current!.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const cursor = pt.matrixTransform(svgRef.current!.getScreenCTM()!.inverse());

    dragRef.current = {
      id,
      offsetX: cursor.x - part.x,
      offsetY: cursor.y - part.y,
    };
  };

  const onMove = (e: React.MouseEvent) => {
    if (!dragRef.current) return;

    const pt = svgRef.current!.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const cursor = pt.matrixTransform(svgRef.current!.getScreenCTM()!.inverse());

    setParts((prev) =>
      prev.map((p) =>
        p.id === dragRef.current!.id
          ? {
              ...p,
              x: cursor.x - dragRef.current!.offsetX,
              y: cursor.y - dragRef.current!.offsetY,
            }
          : p
      )
    );
  };

  const onUp = () => {
    dragRef.current = null;
  };

  // -----------------------------------------------------------------------------
  // ROTATION (around center)
  // -----------------------------------------------------------------------------

  const onDownRotate = (e: React.MouseEvent, part: SvgPart) => {
    e.stopPropagation();

    const { cx, cy } = getBBoxCenter(part);
    const centerX = part.x + cx;
    const centerY = part.y + cy;

    const move = (ev: MouseEvent) => {
      const pt = svgRef.current!.createSVGPoint();
      pt.x = ev.clientX;
      pt.y = ev.clientY;
      const cur = pt.matrixTransform(svgRef.current!.getScreenCTM()!.inverse());

      const dx = cur.x - centerX;
      const dy = cur.y - centerY;

      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

      setParts((prev) =>
        prev.map((p) => (p.id === part.id ? { ...p, rotation: angle } : p))
      );
    };

    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // -----------------------------------------------------------------------------
  // RESIZE (scale around center)
  // -----------------------------------------------------------------------------

  const onDownResize = (e: React.MouseEvent, part: SvgPart) => {
    e.stopPropagation();

    const { cx, cy } = getBBoxCenter(part);
    const centerX = part.x + cx;
    const centerY = part.y + cy;

    const startDist = Math.hypot(
      e.clientX - centerX,
      e.clientY - centerY
    );

    const startScale = part.scale;

    const move = (ev: MouseEvent) => {
      const dx = ev.clientX - centerX;
      const dy = ev.clientY - centerY;

      const dist = Math.hypot(dx, dy);
      const newScale = Math.max(0.05, (dist / startDist) * startScale);

      setParts((prev) =>
        prev.map((p) => (p.id === part.id ? { ...p, scale: newScale } : p))
      );
    };

    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // -----------------------------------------------------------------------------
  // RENDER
  // -----------------------------------------------------------------------------

  return (
    <svg
      ref={svgRef}
      style={{ flex: 1, background: "#f0f0f0" }}
      onMouseMove={onMove}
      onMouseUp={onUp}
    >
      {/* Render SVG parts */}
      {parts.map((p) => (
        <g
          key={p.id}
          ref={(el) => (bboxRefs.current[p.id] = el)}
          transform={getTransform(p)}
          dangerouslySetInnerHTML={{ __html: p.svg }}
          onMouseDown={(e) => onDownPart(e, p.id)}
        />
      ))}

      {/* UI overlays (selection box, resize, rotate) */}
      {parts.map((p) => {
        if (p.id !== selectedId) return null;

        const { x: bx, y: by, width, height } = p.bbox;
        const { cx, cy } = getBBoxCenter(p);

        return (
          <g key={p.id + "-ui"} transform={getTransform(p)}>
            <rect
              x={bx}
              y={by}
              width={width}
              height={height}
              fill="none"
              stroke="#2979ff"
              strokeWidth={1 / p.scale}
            />

            {/* rotation handle */}
            <circle
              cx={cx}
              cy={by - 40}
              r={10 / p.scale}
              fill="white"
              stroke="#2979ff"
              strokeWidth={1 / p.scale}
              onMouseDown={(e) => onDownRotate(e, p)}
            />

            {/* resize handle (bottom-right only for simplicity) */}
            <rect
              x={bx + width - 8 / p.scale}
              y={by + height - 8 / p.scale}
              width={16 / p.scale}
              height={16 / p.scale}
              fill="white"
              stroke="#2979ff"
              strokeWidth={1 / p.scale}
              onMouseDown={(e) => onDownResize(e, p)}
            />
          </g>
        );
      })}
    </svg>
  );
});

export default SvgCanvas;
