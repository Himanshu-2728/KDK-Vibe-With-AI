import { useCallback, useState } from "react";
import { api } from "./api";
import {
  clearSavedLocation,
  nearPresetLabel,
  nearestArea,
  requestLocation,
  saveLocation,
  savedLocation,
  type AreaPreset,
  type LocatedAt,
} from "./geo";

export type LocStatus = "idle" | "locating" | "denied" | "unavailable" | "timeout" | "unsupported";

/**
 * The app's sense of “where I am”. Falls back to a neighborhood preset when
 * GPS is denied/unsupported, and remembers the spot across visits so the feed
 * can keep showing distances and the “nearest” sort stays usable.
 */
export function useLocationSpot() {
  const [loc, setLocState] = useState<LocatedAt | null>(() => savedLocation());
  const [status, setStatus] = useState<LocStatus>("idle");
  const [attempts, setAttempts] = useState(0);

  const locate = useCallback(async (): Promise<LocatedAt | null> => {
    if (savedLocation()) return savedLocation();
    setStatus("locating");
    setAttempts((a) => a + 1);
    const res = await requestLocation();
    if (res.ok) {
      const { preset, distanceM } = nearestArea(res.lat, res.lng);
      // Prefer the real place name from the map API (reverse geocoding). If the
      // lookup fails we fall back to the closest demo preset, with a label that
      // never contains a stray "undefined".
      let label: string | null = null;
      let approximate = false;
      try {
        const geo = await api.get<{ ok: boolean; label: string | null }>(
          `/api/geo/reverse?lat=${res.lat}&lng=${res.lng}`,
        );
        if (geo.ok && geo.label) label = geo.label;
      } catch {
        /* geocoder unreachable — fall back below */
      }
      if (!label) {
        label = distanceM < 120 ? preset.label : nearPresetLabel(preset);
        approximate = true; // guessed from the demo presets, not a real name
      }
      const next: LocatedAt = { lat: res.lat, lng: res.lng, label, approximate };
      saveLocation(next);
      setLocState(next);
      setStatus("idle");
      return next;
    }
    setStatus(res.reason === "denied" ? "denied" : res.reason);
    return null;
  }, []);

  const pickPreset = useCallback((p: AreaPreset): LocatedAt => {
    const next: LocatedAt = { lat: p.lat, lng: p.lng, label: p.label, approximate: true };
    saveLocation(next);
    setLocState(next);
    setStatus("idle");
    return next;
  }, []);

  const clear = useCallback(() => {
    clearSavedLocation();
    setLocState(null);
    setStatus("idle");
  }, []);

  return { loc, status, attempts, locate, pickPreset, clear };
}