import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Landing() {
  const navigate = useNavigate();
  const { user, booting } = useAuth();

  const go = () => {
    if (user) navigate(user.role === "authority" ? "/admin" : "/feed");
    else navigate("/auth");
  };

  return (
    <div className="landing standalone-page" style={{ margin: "0 auto" }}>
      <div className="landing-hero fade-in">
        <span className="logo" style={{ width: 56, height: 56, fontSize: 28, borderRadius: 18, margin: "0 auto", display: "grid", placeItems: "center" }}>
          ⚡
        </span>
        <h1>
          Your city's issues,
          <br />
          surfaced by the people who live there.
        </h1>
        <p className="tagline">
          Spot a pothole, a broken streetlight, a water leak? Report it in seconds.
          The issues your neighbors care about most rise to the top — and get fixed first.
        </p>
        <div className="row" style={{ justifyContent: "center", marginTop: 20 }}>
          <button className="btn btn-primary btn-lg" onClick={go} disabled={booting}>
            {user ? "Open CivicPulse" : "See what's happening"}
          </button>
        </div>
      </div>

      <div className="feature-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", maxWidth: 860, margin: "0 auto" }}>
        <div className="feature-tile">
          <div className="fi">📸</div>
          <h4>Report in seconds</h4>
          <p>Photo + location + one line. That's it.</p>
        </div>
        <div className="feature-tile">
          <div className="fi">👍</div>
          <h4>Upvote what matters</h4>
          <p>Popular issues surface and get prioritized.</p>
        </div>
        <div className="feature-tile">
          <div className="fi">🧠</div>
          <h4>AI classifies it</h4>
          <p>Type, severity and risk — always a suggestion you confirm.</p>
        </div>
        <div className="feature-tile">
          <div className="fi">🔗</div>
          <h4>No duplicate splinters</h4>
          <p>Nearby reports merge, so upvotes concentrate.</p>
        </div>
        <div className="feature-tile">
          <div className="fi">🏛</div>
          <h4>Tracked to done</h4>
          <p>Watch an issue move from reported to confirmed fixed.</p>
        </div>
        <div className="feature-tile">
          <div className="fi">📊</div>
          <h4>Transparent priority</h4>
          <p>Every score shows its math — no black box.</p>
        </div>
      </div>

      <div className="state-box">
        <p style={{ marginBottom: 4 }}>
          <strong>Try the demo</strong> — seeded with a live neighborhood story.
        </p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn btn-ghost" onClick={() => navigate("/auth?demo=citizen")}>
            🧑🏽 Citizen demo
          </button>
          <button className="btn btn-ghost" onClick={() => navigate("/auth?demo=authority")}>
            🏛 Authority demo
          </button>
        </div>
      </div>
    </div>
  );
}