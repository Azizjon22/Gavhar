import { useEffect, useId, useMemo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { type GemEdge, type GemFace, type GemFrame, gemFrame } from './gem-geometry';

/** Bir to'liq aylanish vaqti. */
const TURN_MS = 7000;
/** Harakat o'chirilgan qurilmalarda va birinchi kadrda ko'rinadigan holat. */
const REST_ANGLE = Math.PI / 6;

const EDGE_STYLE: Record<GemEdge['kind'], { width: number; opacity: number }> = {
  outline: { width: 2.3, opacity: 1 },
  front: { width: 1.4, opacity: 0.9 },
  back: { width: 1, opacity: 0.22 },
};

const faceOpacity = (face: GemFace) => (face.shine === 0 ? 0 : 0.06 + 0.6 * face.shine);

/**
 * Gavhar belgisining hajmli ko'rinishi: tosh o'z o'qi atrofida to'xtovsiz aylanadi,
 * qirralari yorug'likka qaraganda yaltiraydi. Kadrlar React'ni qayta chizmasdan,
 * to'g'ridan-to'g'ri SVG atributlari orqali yangilanadi.
 */
export function SpinningGem({ className }: { className?: string }) {
  const gradientId = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const initial = useMemo<GemFrame>(() => gemFrame(REST_ANGLE), []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || typeof requestAnimationFrame !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const polygons = [...svg.querySelectorAll('polygon')];
    const lines = [...svg.querySelectorAll('line')];
    let request = 0;

    const draw = (now: number) => {
      // Burchak umumiy soatdan olinadi — sahifadagi barcha belgilar bir xil aylanadi.
      const frame = gemFrame(REST_ANGLE + (now / TURN_MS) * Math.PI * 2);
      frame.faces.forEach((face, index) => {
        const polygon = polygons[index];
        polygon?.setAttribute('points', face.points);
        polygon?.setAttribute('fill-opacity', String(faceOpacity(face)));
      });
      frame.edges.forEach((edge, index) => {
        const line = lines[index];
        if (!line) return;
        const style = EDGE_STYLE[edge.kind];
        line.setAttribute('x1', String(edge.x1));
        line.setAttribute('y1', String(edge.y1));
        line.setAttribute('x2', String(edge.x2));
        line.setAttribute('y2', String(edge.y2));
        line.setAttribute('stroke-width', String(style.width));
        line.setAttribute('stroke-opacity', String(style.opacity));
      });
      request = requestAnimationFrame(draw);
    };

    request = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(request);
  }, []);

  return (
    <svg
      ref={svgRef}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={cn('size-10', className)}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="8"
          y1="10"
          x2="56"
          y2="56"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#F3DFA2" />
          <stop offset="0.45" stopColor="#C9A24B" />
          <stop offset="1" stopColor="#A9772A" />
        </linearGradient>
      </defs>
      <g fill="#F6E3A6">
        {initial.faces.map((face, index) => (
          <polygon key={index} points={face.points} fillOpacity={faceOpacity(face)} />
        ))}
      </g>
      <g stroke={`url(#${gradientId})`} strokeLinecap="round">
        {initial.edges.map((edge, index) => (
          <line
            key={index}
            x1={edge.x1}
            y1={edge.y1}
            x2={edge.x2}
            y2={edge.y2}
            strokeWidth={EDGE_STYLE[edge.kind].width}
            strokeOpacity={EDGE_STYLE[edge.kind].opacity}
          />
        ))}
      </g>
    </svg>
  );
}
