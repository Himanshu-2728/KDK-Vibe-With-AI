export interface AreaPreset {
  label: string;
  description: string;
  lat: number;
  lng: number;
}

/**
 * Real Nagpur streets/localities (coordinates from the Photon map API). Seed
 * areas align with this dataset so duplicates can be exercised: the flagship
 * pothole sits exactly on “Great Nag Rd, Nandanvan”.
 */
export const AREA_PRESETS: AreaPreset[] = [
  { label: "Great Nag Rd, Nandanvan", description: "Near KDK College", lat: 21.1413, lng: 79.12673 },
  { label: "Katol Rd, Dharampeth", description: "Main market stretch", lat: 21.14097, lng: 79.06243 },
  { label: "Ramdaspeth", description: "Hospitals & cafes", lat: 21.13659, lng: 79.07499 },
  { label: "Sitabuldi", description: "City centre market", lat: 21.14023, lng: 79.08716 },
  { label: "Gandhi Sagar Bridge", description: "Over the Nag river", lat: 21.14579, lng: 79.09873 },
  { label: "Civil Lines Rd", description: "Government offices", lat: 21.15493, lng: 79.07893 },
  { label: "Manewada Rd, Hanuman Nagar", description: "Busy commuter road", lat: 21.11752, lng: 79.10448 },
  { label: "Hanuman Nagar", description: "School crossing", lat: 21.1263, lng: 79.10209 },
  { label: "Amravati Rd, Bajaj Nagar", description: "Past VNIT", lat: 21.12871, lng: 79.05729 },
  { label: "Ambazari Lake", description: "Lakeside path", lat: 21.12869, lng: 79.04574 },
  { label: "Subhash Nagar", description: "Quiet residential", lat: 21.12332, lng: 79.04205 },
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
    if (!raw) return null;
    const loc = JSON.parse(raw) as LocatedAt;
    // Drop stale saves that a broken label ever wrote (e.g. "near Hillcrest
    // Ave, undefined") so they re-resolve instead of lingering.
    if (!loc.label || loc.label.includes("undefined") || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
      localStorage.removeItem(STORE_KEY);
      return null;
    }
    return loc;
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

/** Label a coordinate with the closest known spot, e.g. "near Great Nag Rd, Nandanvan". */
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

/**
 * "near <street>" or "near <street>, <area>" — never a stray "undefined".
 * Used when no map API label is available for a GPS fix.
 */
export function nearPresetLabel(preset: AreaPreset): string {
  const parts = preset.label
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 ? `near ${parts[0]}, ${parts[1]}` : `near ${parts[0] ?? preset.label}`;
}