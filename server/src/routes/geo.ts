import { Router } from "express";

/**
 * Reverse geocoding proxy — turns a GPS coordinate into a real place name
 * ("Great Nag Road, Nandanvan") instead of guessing from nearby demo presets.
 *
 * Backed by the free, no-key Photon (komoot) API. Proxying server-side keeps
 * the provider swappable (Nominatim / Mapbox / Google later) and lets us cache,
 * so we never hammer a shared public API. Unknown coordinates or geocoder
 * outages degrade to `{ label: null }` and the client falls back gracefully.
 */
const router = Router();

const GEOCODER_URL = "https://photon.komoot.io/reverse";

interface PhotonProperties {
  name?: string;
  street?: string;
  locality?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
}

export interface ReverseGeocode {
  label: string | null;
  road: string | null;
  area: string | null;
}

export function geocodeLabel(props: PhotonProperties): ReverseGeocode {
  const road = props.street || props.name || null;
  const area =
    props.locality || props.district || props.city || props.county || props.state || null;
  if (road && area) return { label: `${road}, ${area}`, road, area };
  if (road) return { label: road, road, area };
  if (area) return { label: area, road: null, area };
  return { label: null, road: null, area: null };
}

// In-memory cache keyed by rounded coordinates — repeat lookups of the same
// spot (the common case) never leave the server.
const cache = new Map<string, ReverseGeocode>();
const CACHE_MAX = 500;

function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/** GET /api/geo/reverse?lat=21.14035&lng=79.13001 → { ok, label, road, area } */
router.get("/reverse", async (req, res, next) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      !Number.isFinite(lng) ||
      lng < -180 ||
      lng > 180
    ) {
      res.status(400).json({ error: "Valid lat and lng are required" });
      return;
    }

    const key = cacheKey(lat, lng);
    const hit = cache.get(key);
    if (hit !== undefined) {
      res.json({ ok: true, ...hit });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const resp = await fetch(
        `${GEOCODER_URL}?lon=${lng}&lat=${lat}`,
        { signal: controller.signal, headers: { Accept: "application/json" } },
      );
      if (!resp.ok) throw new Error(`geocoder responded ${resp.status}`);
      const data = (await resp.json()) as {
        features?: Array<{ properties?: PhotonProperties }>;
      };
      const props = data.features?.[0]?.properties ?? null;
      const result: ReverseGeocode = props
        ? geocodeLabel(props)
        : { label: null, road: null, area: null };

      cache.set(key, result);
      if (cache.size > CACHE_MAX) {
        cache.delete(cache.keys().next().value as string);
      }
      res.json({ ok: true, ...result });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    next(err);
  }
});

export default router;