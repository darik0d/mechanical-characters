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

  // inject SVGs
  useEffect(() => {
    if (!svgs.length) return;
    const newParts = svgs.map((svg, i) => ({
      id: `p-${Date.now()}-${i}`,
      svg,
      x: 200 + i * 50,
      y: 250,
      rotation: 0,
      scale: 1,
      bbox: { x: 0, y: 0, width: 100, height: 100 },
    }));
    setParts(prev => [...prev, ...newParts]);
  }, [svgs]);

  // expose parts for keyframe editor
  useImperativeHandle(ref, () => ({
    getParts: () => parts,
    setParts: (p: SvgPart[]) => setParts(p),
  }));

  // measure bounding boxes from DOM
  const bboxRefs = useRef<Record<string, SVGGElement | null>>({});

  useEffect(() => {
    parts.forEach((p) => {
      const node = bboxRefs.current[p.id];
      if (!node) return;

      const bb = node.getBBox();
      setParts(prev =>
        prev.map(pp =>
          pp.id === p.id ? { ...pp, bbox: bb } : pp
        )
      );
    });
  }, [parts.length]);

  // drag logic
  const dragRef = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null);

  const onDownPart = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedId(id);

    const part = parts.find(p => p.id === id)!;

    const pt = svgRef.current!.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
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
    pt.x = e.clientX; pt.y = e.clientY;
    const cursor = pt.matrixTransform(svgRef.current!.getScreenCTM()!.inverse());

    setParts(prev =>
      prev.map(p =>
        p.id === dragRef.current!.id
          ? { ...p, x: cursor.x - dragRef.current!.offsetX, y: cursor.y - dragRef.current!.offsetY }
          : p
      )
    );
  };

  const onUp = () => {
    dragRef.current = null;
  };

  // rotation
  const onDownRotate = (e: React.MouseEvent, part: SvgPart) => {
    e.stopPropagation();

    const move = (ev: MouseEvent) => {
      const pt = svgRef.current!.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      const cur = pt.matrixTransform(svgRef.current!.getScreenCTM()!.inverse());

      const dx = cur.x - part.x;
      const dy = cur.y - part.y;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;

      setParts(prev =>
        prev.map(p => p.id === part.id ? { ...p, rotation: angle } : p)
      );
    };

    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  // resizing
  const onDownResize = (e: React.MouseEvent, part: SvgPart, corner: string) => {
    e.stopPropagation();

    const startScale = part.scale;

    const move = (ev: MouseEvent) => {
      const pt = svgRef.current!.createSVGPoint();
      pt.x = ev.clientX; pt.y = ev.clientY;
      const cur = pt.matrixTransform(svgRef.current!.getScreenCTM()!.inverse());

      const dx = cur.x - part.x;
      const dy = cur.y - part.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const newScale = Math.max(0.05, dist / 100);
      setParts(prev =>
        prev.map(p => p.id === part.id ? { ...p, scale: newScale } : p)
      );
    };

    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <svg
      ref={svgRef}
      style={{ flex: 1, background: "#f0f0f0" }}
      onMouseMove={onMove}
      onMouseUp={onUp}
    >
      {parts.map((p) => (
        <g
          key={p.id}
          ref={(el) => (bboxRefs.current[p.id] = el)}
          transform={`translate(${p.x}, ${p.y}) rotate(${p.rotation}) scale(${p.scale})`}
          dangerouslySetInnerHTML={{ __html: p.svg }}
          onMouseDown={(e) => onDownPart(e, p.id)}
        />
      ))}

      {/* UI overlays */}
      {parts.map((p) => {
        if (p.id !== selectedId) return null;

        const { x: bx, y: by, width, height } = p.bbox;

        // corners relative to transform
        const corners = [
          { cx: bx, cy: by, name: "tl" },
          { cx: bx + width, cy: by, name: "tr" },
          { cx: bx, cy: by + height, name: "bl" },
          { cx: bx + width, cy: by + height, name: "br" },
        ];

        return (
          <g
            key={p.id + "-ui"}
            transform={`translate(${p.x}, ${p.y}) rotate(${p.rotation}) scale(${p.scale})`}
          >
            {/* bounding box */}
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
              cx={bx + width / 2}
              cy={by - 40}
              r={10 / p.scale}
              fill="white"
              stroke="#2979ff"
              strokeWidth={1 / p.scale}
              onMouseDown={(e) => onDownRotate(e, p)}
            />

            {/* resize handles */}
            {corners.map(c => (
              <rect
                key={c.name}
                x={c.cx - 6 / p.scale}
                y={c.cy - 6 / p.scale}
                width={12 / p.scale}
                height={12 / p.scale}
                fill="white"
                stroke="#2979ff"
                strokeWidth={1 / p.scale}
                onMouseDown={(e) => onDownResize(e, p, c.name)}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
});

export default SvgCanvas;
