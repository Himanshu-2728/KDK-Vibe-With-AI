import { useCallback, useState } from "react";
import {
  clearSavedLocation,
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
      const next: LocatedAt = {
        lat: res.lat,
        lng: res.lng,
        label: distanceM < 120 ? preset.label : `near ${preset.label.split(",")[0]}, ${preset.label.split(",")[1]?.trim()}`,
      };
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