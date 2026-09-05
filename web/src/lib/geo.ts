export interface AreaPreset {
  label: string;
  description: string;
  lat: number;
  lng: number;
}

/** Seed areas align with the demo dataset so duplicates can be exercised. */
export const AREA_PRESETS: AreaPreset[] = [
  { label: "Oak St, Riverside", description: "Near Riverside school", lat: 40.7135, lng: -74.0032 },
  { label: "Elm Ave, Riverside", description: "Residential block", lat: 40.7148, lng: -74.0075 },
  { label: "Maple Dr, Westbrook", description: "By the shops", lat: 40.7112, lng: -74.009 },
  { label: "Highland Rd, Westbrook", description: "Hill road", lat: 40.7095, lng: -74.011 },
  { label: "Riverside Bridge", description: "Pedestrian crossing", lat: 40.7155, lng: -74.0045 },
  { label: "Riverside Park", description: "Main entrance", lat: 40.717, lng: -74.002 },
  { label: "Mill Rd, Old Mill", description: "Old factory district", lat: 40.7186, lng: -74.0148 },
  { label: "Foundry St, Old Mill", description: "Back lots", lat: 40.7178, lng: -74.0135 },
  { label: "Hillcrest Ave", description: "Tree-lined street", lat: 40.7068, lng: -74.0012 },
  { label: "Lakeside Dr", description: "By the lake", lat: 40.7218, lng: -74.0032 },
  { label: "Northgate Crossing", description: "School crossing", lat: 40.7222, lng: -74.0125 },
];

export interface LocatedAt {
  lat: number;
  lng: number;
  label: string;
  /** true when the label is approximate (from a saved spot / area pick). */
  approximate?: boolean;
}

const STORE_KEY = "civicpulse_where";

export function savedLocation(): LocatedAt | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as LocatedAt) : null;
  } catch {
    return null;
  }
}

export function saveLocation(loc: LocatedAt): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(loc));
}

export function clearSavedLocation(): void {
  localStorage.removeItem(STORE_KEY);
}

export type LocationResult =
  | { ok: true; lat: number; lng: number }
  | { ok: false; reason: "denied" | "unavailable" | "timeout" | "unsupported" };

export function requestLocation(): Promise<LocationResult> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) {
      resolve({ ok: false, reason: "unsupported" });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ ok: true, lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const reason =
          err.code === err.PERMISSION_DENIED
            ? "denied"
            : err.code === err.TIMEOUT
              ? "timeout"
              : "unavailable";
        resolve({ ok: false, reason });
      },
      { timeout: 6000, maximumAge: 120_000 },
    );
  });
}

/** Label a coordinate with the closest known spot, e.g. "near Oak St, Riverside". */
export function nearestArea(lat: number, lng: number): { preset: AreaPreset; distanceM: number } {
  let best = AREA_PRESETS[0]!;
  let bestD = Infinity;
  for (const p of AREA_PRESETS) {
    const d = (lat - p.lat) ** 2 + (lng - p.lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return { preset: best, distanceM: Math.sqrt(bestD) * 111_000 };
}

export function presetLabel(preset: AreaPreset, distanceM: number): string {
  if (distanceM < 120) return preset.label;
  return `${preset.label.split(",")[0]} area`;
}