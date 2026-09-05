import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import type { User } from "../lib/types";

interface AuthResponse {
  token: string;
  user: User;
}

export default function Auth() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">(
    params.get("demo") ? "login" : "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const afterAuth = (res: AuthResponse) => {
    login(res.token, res.user);
    const from = params.get("from") || (res.user.role === "authority" ? "/admin" : "/feed");
    navigate(from, { replace: true });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res =
        mode === "login"
          ? await api.post<AuthResponse>("/api/auth/login", { email, password })
          : await api.post<AuthResponse>("/api/auth/signup", {
              email,
              password,
              displayName,
            });
      afterAuth(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const demoLogin = async (demoEmail: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<AuthResponse>("/api/auth/login", {
        email: demoEmail,
        password: "demo1234",
      });
      afterAuth(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 440, margin: "0 auto", padding: "24px 16px" }}>
      <div className="landing-hero" style={{ padding: "8px 0 20px" }}>
        <h1 style={{ fontSize: 26 }}>
          {mode === "login" ? "Welcome back" : "Join your neighborhood"}
        </h1>
        <p className="tagline" style={{ fontSize: 14 }}>
          {mode === "login"
            ? "Log in to upvote and report issues near you."
            : "Create a free account — reporting takes seconds."}
        </p>
      </div>

      {params.get("demo") && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div className="section-title" style={{ margin: "0 0 8px" }}>
            One-tap demo logins
          </div>
          <div className="option-list">
            <button className="option-card" disabled={busy} onClick={() => demoLogin("aisha@example.com")}>
              <span style={{ fontSize: 22 }}>🧑🏽</span>
              <span>
                <strong>Aisha Khan</strong> — citizen reporter with a story to tell
              </span>
            </button>
            <button className="option-card" disabled={busy} onClick={() => demoLogin("rahul@city.gov")}>
              <span style={{ fontSize: 22 }}>🏛</span>
              <span>
                <strong>Rahul Deshmukh</strong> — city authority with dashboard access
              </span>
            </button>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 18 }}>
        <div className="row" style={{ marginBottom: 16 }}>
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              className="pill-btn"
              style={{
                flex: 1,
                justifyContent: "center",
                background: mode === m ? "var(--brand)" : "var(--surface-2)",
                color: mode === m ? "var(--on-brand)" : "var(--text)",
              }}
              onClick={() => {
                setMode(m);
                setError(null);
              }}
            >
              {m === "login" ? "Log in" : "Sign up"}
            </button>
          ))}
        </div>

        <form onSubmit={submit}>
          {mode === "signup" && (
            <div className="field">
              <label htmlFor="name">Display name</label>
              <input
                id="name"
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alex Rivera"
                required
                minLength={1}
              />
            </div>
          )}
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="pw">Password</label>
            <input
              id="pw"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === "signup" ? "At least 8 characters" : "••••••••"}
              required
              minLength={mode === "signup" ? 8 : 1}
            />
          </div>
          {error && <div className="form-error">{error}</div>}
          <button className="btn btn-primary btn-block btn-lg" disabled={busy} style={{ marginTop: 6 }}>
            {busy ? "One sec…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </div>

      <p className="muted" style={{ textAlign: "center", marginTop: 16 }}>
        Try it instantly: tap a demo account above.
      </p>
    </div>
  );
}