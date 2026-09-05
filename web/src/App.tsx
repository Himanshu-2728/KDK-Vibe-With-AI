import { useEffect, useState, type ReactNode } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import { UserAvatar } from "./components/UserAvatar";
import { api } from "./lib/api";
import { useLocationSpot } from "./lib/useLocation";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import Feed from "./pages/Feed";
import Report from "./pages/Report";
import IssueDetail from "./pages/IssueDetail";
import Notifications from "./pages/Notifications";
import Profile from "./pages/Profile";
import AdminDashboard from "./pages/AdminDashboard";
import AdminIssues from "./pages/AdminIssues";
import AdminIssueDetail from "./pages/AdminIssueDetail";
import AdminAnalytics from "./pages/AdminAnalytics";

function ThemeToggle() {
  const [dark, setDark] = useState(
    document.documentElement.getAttribute("data-theme") === "dark",
  );
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute("data-theme", next ? "dark" : "light");
    localStorage.setItem("civicpulse_theme", next ? "dark" : "light");
  };
  return (
    <button className="icon-btn" onClick={toggle} title="Toggle theme" aria-label="Toggle theme">
      {dark ? "☀️" : "🌙"}
    </button>
  );
}

function Logo() {
  return (
    <span className="brand">
      <span className="logo">⚡</span>
      CivicPulse
    </span>
  );
}

export function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("civicpulse_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function CitizenLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/feed">
          <Logo />
        </NavLink>
        <div className="row">
          <ThemeToggle />
          <button
            className="icon-btn"
            title={user ? `Signed in as ${user.displayName}` : "Sign in"}
            onClick={() => (user ? navigate("/profile") : navigate("/auth"))}
          >
            {user ? <UserAvatar user={user} size={24} /> : <span>👤</span>}
          </button>
        </div>
      </header>
      <div className="desktop-shell">
        <DesktopSidebar onLogout={logout} />
        <main className="desktop-main">
          <Outlet />
        </main>
        <DesktopRail />
      </div>
      <BottomNav onLogout={logout} />
    </div>
  );
}

function DesktopSidebar({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch("/api/notifications", { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setUnread(data.unreadCount ?? 0);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user, location.pathname]);

  const item = (to: string, icon: string, label: string, badge = 0) => (
    <NavLink
      to={to}
      className={({ isActive }) => `ds-item ${isActive ? "active" : ""}`}
      onClick={(e) => {
        // Let the active nav link be clicked twice to refresh.
        if (location.pathname === to && to !== "/feed") e.preventDefault();
      }}
    >
      <span className="ds-icon">{icon}</span>
      <span>{label}</span>
      {badge > 0 && <span className="dot" />}
    </NavLink>
  );

  return (
    <aside className="desktop-sidebar">
      <NavLink to="/feed">
        <Logo />
      </NavLink>
      {item("/feed", "🏠", "Home")}
      {item("/notifications", "🔔", "Alerts", unread)}
      <button className="ds-report" onClick={() => navigate("/report")}>
        ➕ Report an issue
      </button>
      <div className="ds-item" style={{ cursor: "default" }}>
        <span className="ds-icon">📍</span>
        <span>My area</span>
      </div>
      <div className="ds-spacer" style={{ flex: 1 }} />
      <div className="ds-footer">
        <button
          className="icon-btn"
          title="Profile"
          onClick={() => navigate("/profile")}
          style={{ width: 34, height: 34 }}
        >
          {user ? <UserAvatar user={user} size={22} /> : <span>👤</span>}
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="ds-name">{user?.displayName ?? "Guest"}</div>
          <div className="ds-role">{user?.role === "authority" ? "City authority" : "Neighbor"}</div>
        </div>
        <button className="pill-btn" title="Sign out" onClick={onLogout} style={{ padding: "6px 10px", fontSize: 12 }}>
          ⎋
        </button>
      </div>
    </aside>
  );
}

function DesktopRail() {
  const [top, setTop] = useState<
    Array<{ id: string; title: string; priorityScore: number; priorityTier: string }>
  >([]);
  const { loc, status, locate, clear } = useLocationSpot();

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ items: Array<{ id: string; title: string; priorityScore: number; priorityTier: string }> }>(
        "/api/feed?sort=top&limit=5",
      )
      .then((res) => {
        if (!cancelled) setTop(res.items);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <aside className="desktop-rail">
      <div className="rail-card">
        <div className="rail-title">📍 My location</div>
        {loc ? (
          <>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}>{loc.label}</div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
              {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
              {loc.approximate ? " · approximate" : " · GPS"}
            </div>
            <button
              className="pill-btn"
              style={{ marginTop: 10, fontSize: 12 }}
              onClick={() => void locate()}
            >
              📍 Update
            </button>
            <button
              className="pill-btn"
              style={{ marginLeft: 6, fontSize: 12 }}
              onClick={clear}
              title="Forget location"
            >
              ✕
            </button>
            {(status === "denied" || status === "unavailable" || status === "unsupported") && (
              <div className="muted" style={{ fontSize: 11.5, marginTop: 8 }}>
                Location unavailable — distances & “Nearest” need a spot.
              </div>
            )}
          </>
        ) : (
          <>
            <div className="muted" style={{ fontSize: 12.5, marginBottom: 8 }}>
              Share your location to see distances and the “Nearest” sort.
            </div>
            <button className="btn btn-ghost btn-block" style={{ fontSize: 13 }} onClick={() => void locate()}>
              📍 Use my location
            </button>
          </>
        )}
      </div>

      <div className="rail-card">
        <div className="rail-title">🔥 Trending now</div>
        {top.length === 0 ? (
          <div className="muted" style={{ fontSize: 12.5 }}>Loading…</div>
        ) : (
          <div className="rail-list">
            {top.map((issue, i) => (
              <Link key={issue.id} to={`/issue/${issue.id}`} className="rail-item">
                <span className="rail-rank">{i + 1}</span>
                <span className="rail-title">{issue.title}</span>
                <span className={`chip tier-${issue.priorityTier}`} style={{ flexShrink: 0 }}>
                  {issue.priorityScore}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div className="rail-card">
        <div className="rail-title">⚡ Why CivicPulse</div>
        <p className="muted" style={{ fontSize: 12.5, margin: 0 }}>
          Every report is AI-checked, near-identical reports merge automatically, and
          upvotes push issues up a transparent priority score the city actually sees.
        </p>
      </div>
    </aside>
  );
}

function BottomNav({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetch("/api/notifications", { headers: authHeaders() })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setUnread(data.unreadCount ?? 0);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user, location.pathname]);

  const cls = (path: string) =>
    `nav-item ${location.pathname.startsWith(path) ? "active" : ""}`;

  return (
    <nav className="bottom-nav">
      <NavLink to="/feed" className={cls("/feed")}>
        <span className="nav-icon">🏠</span>
        <span>Home</span>
      </NavLink>
      <NavLink to="/notifications" className={cls("/notifications")}>
        <span className="nav-icon">🔔</span>
        <span>Alerts</span>
        {unread > 0 && <span className="dot" />}
      </NavLink>
      <button className="nav-report" title="Report an issue" onClick={() => navigate("/report")}>
        +
      </button>
      <NavLink to="/profile" className={cls("/profile")}>
        <span className="nav-icon">👤</span>
        <span>Profile</span>
      </NavLink>
      {user?.role === "authority" ? (
        <NavLink to="/admin" className={cls("/admin")}>
          <span className="nav-icon">🛠</span>
          <span>Admin</span>
        </NavLink>
      ) : (
        <button className="nav-item" onClick={onLogout} title="Sign out">
          <span className="nav-icon">⎋</span>
          <span>Sign out</span>
        </button>
      )}
    </nav>
  );
}

function AdminLayout() {
  const { user } = useAuth();
  return (
    <div className="app-shell admin-shell">
      <header className="admin-topbar">
        <div className="topbar">
          <Logo />
          <div className="row">
            {user && <UserAvatar user={user} size={26} />}
            <span className="muted">{user?.displayName}</span>
            <ThemeToggle />
            <NavLink to="/feed" className="pill-btn" title="Back to citizen feed">
              ← Feed
            </NavLink>
          </div>
        </div>
        <nav className="admin-tabs">
          <AdminTab to="/admin" end>
            Dashboard
          </AdminTab>
          <AdminTab to="/admin/issues">Issues</AdminTab>
          <AdminTab to="/admin/analytics">Analytics</AdminTab>
        </nav>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

function AdminTab({ to, end, children }: { to: string; end?: boolean; children: ReactNode }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) => `admin-tab ${isActive ? "active" : ""}`}>
      {children}
    </NavLink>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, booting } = useAuth();
  const location = useLocation();
  if (booting) return <BootScreen />;
  if (!user) return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  return <>{children}</>;
}

function RequireAuthority({ children }: { children: ReactNode }) {
  const { user, booting } = useAuth();
  const location = useLocation();
  if (booting) return <BootScreen />;
  if (!user) return <Navigate to="/auth" state={{ from: location.pathname }} replace />;
  if (user.role !== "authority") return <Navigate to="/feed" replace />;
  return <>{children}</>;
}

function BootScreen() {
  return (
    <div className="state-box">
      <div className="loader" style={{ margin: "0 auto" }} />
      <p>Loading CivicPulse…</p>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth" element={<Auth />} />

      <Route
        element={
          <RequireAuth>
            <CitizenLayout />
          </RequireAuth>
        }
      >
        <Route path="/feed" element={<Feed />} />
        <Route path="/report" element={<Report />} />
        <Route path="/issue/:id" element={<IssueDetail />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />
      </Route>

      <Route
        element={
          <RequireAuthority>
            <AdminLayout />
          </RequireAuthority>
        }
      >
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/issues" element={<AdminIssues />} />
        <Route path="/admin/issues/:id" element={<AdminIssueDetail />} />
        <Route path="/admin/analytics" element={<AdminAnalytics />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}