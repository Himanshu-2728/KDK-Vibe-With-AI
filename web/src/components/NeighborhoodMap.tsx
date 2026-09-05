import { AREA_PRESETS, type AreaPreset } from "../lib/geo";

interface Props {
  selected?: string | null; // area label
  onPick: (preset: AreaPreset) => void;
  /** Optional extra pins (e.g. an existing issue nearby) drawn distinctly. */
  extraPins?: Array<{ label: string; lat: number; lng: number }>;
}

/**
 * A tiny stylized map of the demo city. Real map tiles are mocked by design;
 * this keeps the “drop a pin” gesture visual without a mapping service.
 */
export function NeighborhoodMap({ selected, onPick, extraPins = [] }: Props) {
  const all = [...AREA_PRESETS, ...extraPins];
  const lats = all.map((p) => p.lat);
  const lngs = all.map((p) => p.lng);
  const minLat = Math.min(...lats) - 0.0006;
  const maxLat = Math.max(...lats) + 0.0006;
  const minLng = Math.min(...lngs) - 0.0006;
  const maxLng = Math.max(...lngs) + 0.0006;
  const pad = 26;
  const spanLat = Math.max(0.004, maxLat - minLat);
  const spanLng = Math.max(0.004, maxLng - minLng);

  const px = (lat: number, lng: number): [number, number] => [
    pad + ((lng - minLng) / spanLng) * (220 - pad * 2),
    pad + (1 - (lat - minLat) / spanLat) * (220 - pad * 2),
  ];

  return (
    <svg viewBox="0 0 220 220" role="group" aria-label="Neighborhood map — pick a spot">
      <rect width="220" height="220" rx="10" fill="var(--surface-3)" opacity="0.35" />
      {/* Park + lake accents */}
      <rect x="20" y="22" width="54" height="38" rx="8" fill="rgba(34,197,94,0.16)" />
      <ellipse cx="180" cy="40" rx="30" ry="16" fill="rgba(14,165,233,0.22)" />
      {/* Road grid */}
      <g stroke="rgba(255,255,255,0.85)" strokeWidth="5" strokeLinecap="round" opacity="0.9">
        <path d="M-5 60 Q110 44 225 62" fill="none" />
        <path d="M-5 150 Q110 158 225 144" fill="none" />
        <path d="M52 -5 Q64 110 44 225" fill="none" />
        <path d="M150 -5 Q138 110 158 225" fill="none" />
      </g>
      {/* Neighborhood labels */}
      <g fill="var(--text-3)" fontSize="6.5" fontWeight="700" textAnchor="middle" opacity="0.9">
        <text x="47" y="18">Riverside Park</text>
        <text x="180" y="24">Lakeside</text>
        <text x="112" y="212">city center ↓</text>
      </g>

      {AREA_PRESETS.map((p) => {
        const [x, y] = px(p.lat, p.lng);
        const isSel = selected === p.label;
        const [lx, ly] = isSel ? [x, y - 2] : [x, y];
        return (
          <g
            key={p.label}
            transform={`translate(${lx}, ${ly})`}
            style={{ cursor: "pointer" }}
            onClick={(e) => {
              e.stopPropagation();
              onPick(p);
            }}
          >
            <title>{p.label}</title>
            <circle r={isSel ? 13 : 10} fill={isSel ? "rgba(245,158,11,0.28)" : "rgba(255,255,255,0.6)"} />
            <path
              d="M0 -7.5 C-4 -7.5 -5.5 -4.6 -5.5 -2 C-5.5 2.2 0 7.5 0 7.5 C0 7.5 5.5 2.2 5.5 -2 C5.5 -4.6 4 -7.5 0 -7.5 Z"
              fill={isSel ? "var(--accent)" : "var(--brand)"}
              stroke="#fff"
              strokeWidth="1.4"
            />
            <circle cy={-3} r="1.8" fill="#fff" />
            <text
              y={13}
              textAnchor="middle"
              fontSize="7.5"
              fontWeight={isSel ? 800 : 600}
              fill={isSel ? "var(--accent-strong)" : "var(--text-2)"}
              style={{ pointerEvents: "none" }}
            >
              {p.label.split(",")[0]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}