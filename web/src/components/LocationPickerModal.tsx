import { useEffect, useState } from "react";
import { AREA_PRESETS, type AreaPreset } from "../lib/geo";
import type { LocStatus } from "../lib/useLocation";
import { NeighborhoodMap } from "./NeighborhoodMap";

interface Props {
  open: boolean;
  status: LocStatus;
  selectedLabel?: string | null;
  onClose: () => void;
  onLocate: () => void | Promise<unknown>;
  onPick: (preset: AreaPreset) => void;
}

export function LocationPickerModal({ open, status, selectedLabel, onClose, onLocate, onPick }: Props) {
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (open) setWorking(false);
  }, [open]);

  if (!open) return null;

  const locateNow = async () => {
    setWorking(true);
    try {
      await onLocate();
    } finally {
      setWorking(false);
    }
  };

  const statusHint: Record<LocStatus, string> = {
    idle: "",
    locating: "Locating you…",
    denied: "Location permission was blocked. Pick a spot on the map instead — the demo works just as well.",
    unavailable: "We couldn't get a GPS fix. Pick a spot on the map instead.",
    timeout: "GPS timed out. Pick a spot on the map instead.",
    unsupported: "This browser has no location support. Pick a spot on the map instead.",
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "grid", placeItems: "end center", background: "rgba(10,18,36,0.55)", backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div
        className="card slide-up"
        style={{ width: "100%", maxWidth: 560, maxHeight: "86dvh", overflow: "auto", borderRadius: "22px 22px 0 0", padding: 18 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="spread">
          <h3 style={{ fontSize: 17 }}>Where are you?</h3>
          <button className="pill-btn" onClick={onClose}>Done</button>
        </div>
        <p className="muted" style={{ margin: "4px 0 12px" }}>
          Used for “nearest” sorting and to show distances. Never shared.
        </p>

        <button
          className="btn btn-ghost btn-block"
          disabled={working || status === "locating"}
          onClick={() => void locateNow()}
        >
          {status === "locating" || working ? "📍 Locating…" : "📍 Use my location"}
        </button>
        {statusHint[status] && (
          <p className="muted" style={{ margin: "6px 0 0", fontSize: 12.5 }}>{statusHint[status]}</p>
        )}

        <div style={{ display: "flex", gap: 14, marginTop: 14 }}>
          <div style={{ flexShrink: 0 }}>
            <NeighborhoodMap
              selected={selectedLabel}
              onPick={(p) => {
                onPick(p);
                onClose();
              }}
            />
          </div>
          <div style={{ flex: 1, maxHeight: 220, overflowY: "auto" }}>
            <div className="option-list">
              {AREA_PRESETS.map((p) => (
                <button
                  key={p.label}
                  className={`option-card ${selectedLabel === p.label ? "recommended" : ""}`}
                  onClick={() => {
                    onPick(p);
                    onClose();
                  }}
                  style={{ padding: "7px 10px", gap: 8 }}
                >
                  <span style={{ fontSize: 13 }}>📍</span>
                  <span style={{ fontSize: 12.5 }}>
                    <strong>{p.label.split(",")[0]}</strong>
                    <span className="muted" style={{ display: "block" }}>{p.label.split(",")[1]?.trim()}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}