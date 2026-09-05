import { useCallback, useEffect, useRef, useState } from "react";
import { IssueCard } from "../components/IssueCard";
import { LocationPickerModal } from "../components/LocationPickerModal";
import { api } from "../lib/api";
import type { AreaPreset } from "../lib/geo";
import { useLocationSpot } from "../lib/useLocation";
import type { FeedResponse, IssueSummary } from "../lib/types";

type Sort = "trending" | "top" | "recent" | "nearby";

const SORTS: Array<{ id: Sort; label: string; icon: string }> = [
  { id: "trending", label: "Trending", icon: "🔥" },
  { id: "top", label: "Most Upvoted", icon: "🏆" },
  { id: "recent", label: "Recent", icon: "🕐" },
  { id: "nearby", label: "Nearest", icon: "📍" },
];

interface FeedQuery {
  sort: Sort;
  category: string;
  status: string;
  criticalOnly: boolean;
}

const EMPTY_QUERY: FeedQuery = { sort: "trending", category: "", status: "", criticalOnly: false };

function SkeletonCard() {
  return (
    <div className="skeleton card" style={{ overflow: "hidden" }}>
      <div className="skeleton-media" />
      <div className="skeleton-chip" />
      <div className="skeleton-line short" />
      <div className="skeleton-line" />
      <div className="skeleton-line" />
    </div>
  );
}

export default function Feed() {
  const [query, setQuery] = useState<FeedQuery>(EMPTY_QUERY);
  const [items, setItems] = useState<IssueSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true); // first load
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { loc, status, locate, pickPreset, clear } = useLocationSpot();
  const sentinel = useRef<HTMLDivElement>(null);
  const requestSeq = useRef(0);
  const sortRef = useRef<Sort>("trending");
  sortRef.current = query.sort;

  const load = useCallback(
    async (pageToLoad: number, reset: boolean) => {
      const seq = ++requestSeq.current;
      setError(null);
      if (reset) setLoading(true);
      else setLoadingMore(true);
      try {
        const params = new URLSearchParams({
          sort: query.sort,
          page: String(pageToLoad),
          limit: "8",
        });
        if (query.category) params.set("category", query.category);
        if (query.status) params.set("status", query.status);
        if (query.criticalOnly) params.set("criticalOnly", "true");
        if (loc) {
          params.set("lat", String(loc.lat));
          params.set("lng", String(loc.lng));
        }
        const data = await api.get<FeedResponse>(`/api/feed?${params}`);
        if (seq !== requestSeq.current) return; // stale response
        setItems((prev) => (reset ? data.items : [...prev, ...data.items]));
        setPage(pageToLoad);
        setHasMore(data.hasMore);
      } catch (err) {
        if (seq !== requestSeq.current) return;
        setError(err instanceof Error ? err.message : "Couldn't load the feed");
        if (reset) setItems([]);
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [query, loc],
  );

  // Reload when the query or coordinates change.
  useEffect(() => {
    void load(1, true);
  }, [load]);

  // Infinite scroll.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !loadingMore && !loading) {
          void load(page + 1, false);
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, page, load]);

  const updateIssue = (issueId: string, patch: Partial<IssueSummary>) => {
    setItems((prev) => prev.map((i) => (i.id === issueId ? { ...i, ...patch } : i)));
  };

  const toggleFilter = (patch: Partial<FeedQuery>) => {
    setQuery((q) => ({ ...q, ...patch }));
  };

  const hasFilters = Boolean(
    query.category || query.status || query.criticalOnly || query.sort !== "trending",
  );

  // “Nearest” needs to know where you are: try GPS, then fall back to a picker.
  const requestNearest = useCallback(async () => {
    if (loc) {
      toggleFilter({ sort: "nearby" });
      return;
    }
    const got = await locate();
    if (got) toggleFilter({ sort: "nearby" });
    else setPickerOpen(true);
  }, [loc, locate]);

  const pickSpot = (preset: AreaPreset) => {
    pickPreset(preset);
    toggleFilter({ sort: "nearby" });
    setPickerOpen(false);
  };

  return (
    <div>
      <div className="page-head">
        <h1>Your neighborhood, live</h1>
        <p>
          {query.sort === "trending"
            ? "Issues gaining momentum right now"
            : query.sort === "top"
              ? "The issues your city cares about most"
              : query.sort === "recent"
                ? "The latest reports"
                : "Closest to you"}
        </p>
      </div>

      {/* Sort + filter chips */}
      <div className="sortbar">
        {SORTS.map((s) => (
          <button
            key={s.id}
            className={`sort-chip ${query.sort === s.id ? "active" : ""}`}
            onClick={() => (s.id === "nearby" ? void requestNearest() : toggleFilter({ sort: s.id }))}
          >
            {s.icon} {s.label}
          </button>
        ))}
        <FilterMenu query={query} onChange={toggleFilter} hasFilters={hasFilters} />
      </div>

      {loc && (
        <div className="row" style={{ padding: "4px 16px 0", gap: 6, flexWrap: "wrap" }}>
          <button className="pill-btn" onClick={() => setPickerOpen(true)} style={{ fontSize: 12 }}>
            📍 {loc.label}
            {loc.approximate ? " · approx" : ""}
          </button>
          <button className="pill-btn" onClick={clear} title="Forget location" style={{ fontSize: 12 }}>
            ✕
          </button>
        </div>
      )}
      {!loc && (status === "denied" || status === "unavailable" || status === "unsupported") && (
        <div className="row" style={{ padding: "4px 16px 0", gap: 6, flexWrap: "wrap" }}>
          <span className="muted" style={{ fontSize: 12.5 }}>
            Location unavailable — pick a spot to unlock distances & “Nearest”.
          </span>
          <button className="pill-btn" style={{ fontSize: 12 }} onClick={() => setPickerOpen(true)}>
            Choose a spot
          </button>
        </div>
      )}

      {/* Category strip when no category chosen */}
      <CategoryStrip query={query} onChange={toggleFilter} />

      {!!error && (
        <div className="error-banner">
          {error}
          <button className="pill-btn" style={{ marginLeft: 8 }} onClick={() => void load(1, true)}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="stack" style={{ paddingTop: 4 }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="state-box">
          <div className="state-icon">🫧</div>
          <h3>No issues here yet</h3>
          <p>
            {query.criticalOnly
              ? "Nothing critical right now — nice. Clear the filter to see everything."
              : "Be the first to report one — it takes less than a minute."}
          </p>
          <button className="btn btn-primary btn-lg" onClick={() => (window.location.href = "/report")}>
            + Report an issue
          </button>
        </div>
      ) : (
        <div className="desktop-feed stack" style={{ paddingTop: 4 }}>
          {items.map((issue) => (
            <IssueCard
              key={issue.id}
              issue={issue}
              showDistance={query.sort === "nearby" || !!loc}
              onUpvoteConfirmed={(id, { upvoteCount }) => updateIssue(id, { upvoteCount })}
            />
          ))}
          {loadingMore && <SkeletonCard />}
          <div ref={sentinel} style={{ height: 8 }} />
          {!hasMore && items.length > 3 && (
            <div className="muted" style={{ textAlign: "center", padding: 16, gridColumn: "1 / -1" }}>
              You're all caught up 🎉
            </div>
          )}
        </div>
      )}
      <LocationPickerModal
        open={pickerOpen}
        status={status}
        selectedLabel={loc?.label ?? null}
        onClose={() => setPickerOpen(false)}
        onLocate={async () => {
          const got = await locate();
          if (got) toggleFilter({ sort: "nearby" });
          return got;
        }}
        onPick={pickSpot}
      />
    </div>
  );
}

function FilterMenu({
  query,
  onChange,
  hasFilters,
}: {
  query: FeedQuery;
  onChange: (patch: Partial<FeedQuery>) => void;
  hasFilters: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", flexShrink: 0 }}>
      <button
        className={`sort-chip ${hasFilters ? "filter-active" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        ⚙ Filters
      </button>
      {open && (
        <div
          className="card"
          style={{
            position: "absolute",
            right: 0,
            top: 44,
            width: 260,
            padding: 12,
            zIndex: 30,
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div className="field">
            <label>Status</label>
            <select
              className="select"
              value={query.status}
              onChange={(e) => {
                onChange({ status: e.target.value });
                setOpen(false);
              }}
            >
              <option value="">Any status</option>
              <option value="reported">Reported</option>
              <option value="ai_analyzed">AI Analyzed</option>
              <option value="verified">Verified</option>
              <option value="assigned">Assigned</option>
              <option value="in_progress">In Progress</option>
              <option value="resolved">Resolved</option>
              <option value="confirmed">Confirmed</option>
            </select>
          </div>
          <label className="row" style={{ gap: 8, fontWeight: 700, fontSize: 13.5 }}>
            <input
              type="checkbox"
              checked={query.criticalOnly}
              onChange={(e) => onChange({ criticalOnly: e.target.checked })}
            />
            🚨 Critical only
          </label>
          {(query.status || query.criticalOnly) && (
            <button
              className="btn btn-ghost btn-block"
              style={{ marginTop: 10 }}
              onClick={() => {
                onChange({ status: "", criticalOnly: false });
                setOpen(false);
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      {open && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 20 }}
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}

const CATEGORIES = [
  { id: "1", name: "Infrastructure" },
  { id: "2", name: "Sanitation" },
  { id: "3", name: "Water" },
  { id: "4", name: "Electrical" },
  { id: "5", name: "Safety" },
  { id: "6", name: "Environment" },
];

function CategoryStrip({
  query,
  onChange,
}: {
  query: FeedQuery;
  onChange: (patch: Partial<FeedQuery>) => void;
}) {
  return (
    <div className="sortbar" style={{ paddingTop: 0, paddingBottom: 8 }}>
      <button
        className={`sort-chip ${query.category === "" ? "active" : ""}`}
        onClick={() => onChange({ category: "" })}
      >
        All
      </button>
      {CATEGORIES.map((c) => (
        <button
          key={c.id}
          className={`sort-chip ${query.category === c.id ? "active" : ""}`}
          onClick={() => onChange({ category: c.id })}
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}