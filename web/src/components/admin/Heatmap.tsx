import { useMemo, useState } from "react";
import { AREA_PRESETS } from "../../lib/geo";

export interface HeatCell {
  area: string;
  lat: number;
  lng: number;
  total: number;
  unresolved: number;
  intensity: number;
}

interface Props {
  cells: HeatCell[];
  /** Called when an area cluster is clicked, so the admin can drill in. */
  onPick?: (area: string) => void;
}

const W = 560;
const H = 300;

/**
 * Clickable density map of the demo city. Area clusters are drawn as heat
 * blobs; individual unresolved issues appear as pins whose size/color follow
 * their priority, and a click on a cluster drills into that area's queue.
 */
export function Heatmap({ cells, onPick }: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const { areas, px } = useMemo(() => {
    const pts = [
      ...AREA_PRESETS.map((p) => ({ lat: p.lat, lng: p.lng })),
      ...cells.map((c) => ({ lat: c.lat, lng: c.lng })),
    ];
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    const minLat = Math.min(...lats) - 0.0008;
    const maxLat = Math.max(...lats) + 0.0008;
    const minLng = Math.min(...lngs) - 0.0015;
    const maxLng = Math.max(...lngs) + 0.0015;
    const pad = 40;
    const spanLat = Math.max(0.005, maxLat - minLat);
    const spanLng = Math.max(0.01, maxLng - minLng);
    const px = (lat: number, lng: number): [number, number] => [
      pad + ((lng - minLng) / spanLng) * (W - pad * 2),
      pad + (1 - (lat - minLat) / spanLat) * (H - pad * 2),
    ];
    const areas = AREA_PRESETS.map((p) => ({
      label: p.label,
      lat: p.lat,
      lng: p.lng,
      cell: cells.find((c) => c.area === p.label),
    }));
    return { areas, px };
  }, [cells]);

  const select = (area: string) => {
    setPicked((prev) => (prev === area ? null : area));
    onPick?.(area);
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Issue density map — click an area to open its queue"
      style={{ width: "100%", height: "auto", display: "block" }}
    >
      <defs>
        <linearGradient id="hm-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--surface-2)" />
          <stop offset="100%" stopColor="var(--surface-3)" />
        </linearGradient>
        <pattern id="hm-park" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="22" height="22" fill="rgba(34,197,94,0.12)" />
          <circle cx="11" cy="11" r="3" fill="rgba(34,197,94,0.25)" />
        </pattern>
      </defs>

      <rect width={W} height={H} rx="12" fill="url(#hm-bg)" />

      {/* Park + lake accents */}
      <rect x={W * 0.06} y={H * 0.14} width={W * 0.14} height={H * 0.24} rx="8" fill="url(#hm-park)" />
      <ellipse cx={W * 0.86} cy={H * 0.16} rx={W * 0.1} ry={H * 0.07} fill="rgba(14,165,233,0.2)" />

      {/* Road grid */}
      <g stroke="var(--surface)" strokeWidth="7" strokeLinecap="round" opacity="0.55">
        <path d={`M-10 ${H * 0.4} Q ${W * 0.5} ${H * 0.34} ${W + 10} ${H * 0.42}`} fill="none" />
        <path d={`M-10 ${H * 0.78} Q ${W * 0.45} ${H * 0.82} ${W + 10} ${H * 0.76}`} fill="none" />
        <path d={`M${W * 0.24} -10 Q ${W * 0.28} ${H * 0.5} ${W * 0.22} ${H + 10}`} fill="none" />
        <path d={`M${W * 0.68} -10 Q ${W * 0.62} ${H * 0.5} ${W * 0.7} ${H + 10}`} fill="none" />
      </g>

      {/* Neighborhood nameplate */}
      <text x={W * 0.5} y={H - 10} textAnchor="middle" fontSize="12" fontWeight="800" fill="var(--text-3)" opacity="0.85">
        Mapleton demo city — unresolved issues
      </text>

      {/* Area heat blobs + labels (click to drill in) */}
      {areas.map((a) => {
        if (!a.cell || a.cell.unresolved === 0) return null;
        const [x, y] = px(a.lat, a.lng);
        const c = a.cell;
        const isSel = picked === a.label || hovered === a.label;
        const r = 12 + c.intensity * 26;
        const color =
          c.intensity < 0.34 ? "rgba(34,197,94,0.5)" : c.intensity < 0.67 ? "rgba(250,204,21,0.55)" : "rgba(239,68,68,0.55)";
        return (
          <g
            key={a.label}
            onMouseEnter={() => setHovered(a.label)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => select(a.label)}
            style={{ cursor: "pointer" }}
          >
            <circle cx={x} cy={y} r={isSel ? r + 6 : r + 3} fill={color} />
            <circle cx={x} cy={y} r={isSel ? r + 6 : r + 3} fill="none" stroke={isSel ? "var(--text)" : "transparent"} strokeWidth="1.5" strokeDasharray="4 3" />
            <text
              x={x}
              y={y + 4}
              textAnchor="middle"
              fontSize="11"
              fontWeight="800"
              fill="var(--text)"
              style={{ pointerEvents: "none" }}
            >
              {a.label.split(",")[0]}
            </text>
            <text
              x={x}
              y={y + 17}
              textAnchor="middle"
              fontSize="9.5"
              fontWeight="700"
              fill="var(--text-2)"
              style={{ pointerEvents: "none" }}
            >
              {c.unresolved} open
            </text>
          </g>
        );
      })}

      {/* Issue pins */}
      {cells.flatMap((cell) =>
        [...Array(Math.min(cell.total, 12))].map((_, i) => {
          // Scatter pins deterministically around the area centroid so repeat
          // renders look stable.
          const angle = (i * 2.399) + cell.lat;
          const jitterLat = Math.sin(angle) * 0.0009;
          const jitterLng = Math.cos(angle * 1.3) * 0.0011;
          const [x, y] = px(cell.lat + jitterLat, cell.lng + jitterLng);
          const hot = cell.intensity >= 0.67;
          return (
            <circle
              key={`${cell.area}-${i}`}
              cx={x}
              cy={y}
              r={hot ? 3.6 : 2.4}
              fill={hot ? "#dc2626" : "#f59e0b"}
              stroke="var(--surface)"
              strokeWidth="1"
              opacity={0.9}
            />
          );
        }),
      )}
    </svg>
  );
}
