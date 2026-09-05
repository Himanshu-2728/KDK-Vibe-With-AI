import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EvidenceChips } from "../components/EvidenceChips";
import { LocationPickerModal } from "../components/LocationPickerModal";
import { api } from "../lib/api";
import { useLocationSpot } from "../lib/useLocation";
import type { AreaPreset } from "../lib/geo";
import type { AiClassification, IssueSummary } from "../lib/types";

type Step = "photo" | "location" | "details" | "ai" | "done";

interface AiReview extends AiClassification {
  categoryId: number | null;
}

const CATEGORY_OPTIONS = [
  { id: 1, name: "Infrastructure", icon: "🛣" },
  { id: 2, name: "Sanitation", icon: "🗑" },
  { id: 3, name: "Water", icon: "💧" },
  { id: 4, name: "Electrical", icon: "💡" },
  { id: 5, name: "Safety", icon: "⚠️" },
  { id: 6, name: "Environment", icon: "🌳" },
];

const CATEGORY_ID_BY_NAME: Record<string, number> = Object.fromEntries(
  CATEGORY_OPTIONS.map((c) => [c.name, c.id]),
);

const STEP_LABELS: Step[] = ["photo", "location", "details", "ai"];

export default function Report() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("photo");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { loc, status: locStatus, locate: gpsLocate, pickPreset } = useLocationSpot();
  const locBusy = locStatus === "locating";
  const locBlocked = locStatus === "denied" || locStatus === "unavailable" || locStatus === "unsupported";
  const [description, setDescription] = useState("");
  const [pickedCategory, setPickedCategory] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // After submit
  const [reportId, setReportId] = useState<string | null>(null);
  const [ai, setAi] = useState<AiReview | null>(null);
  const [duplicate, setDuplicate] = useState<{
    issueId: string;
    title: string;
    distanceM: number;
    upvoteCount: number;
    reportCount: number;
    status: string;
  } | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [correctedCategory, setCorrectedCategory] = useState<number | null>(null);
  const [correctedSeverity, setCorrectedSeverity] = useState("high");
  const [correctedType, setCorrectedType] = useState("");
  const [done, setDone] = useState<{ merged: boolean; issueId: string; issue?: IssueSummary } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const stepIndex = STEP_LABELS.indexOf(step);

  const pickFile = (file: File | undefined | null) => {
    if (!file || !file.type.startsWith("image/")) {
      setError("Please choose an image file (JPEG, PNG, WebP…).");
      return;
    }
    setError(null);
    setPhoto(file);
    const url = URL.createObjectURL(file);
    setPreview(url);
  };

  const useMyLocation = async () => {
    setError(null);
    const got = await gpsLocate();
    if (got) setPickerOpen(false);
  };

  const pickSpot = (preset: AreaPreset) => {
    pickPreset(preset);
    setPickerOpen(false);
    setError(null);
  };

  const submit = async () => {
    if (!photo || !loc || busy) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("photo", photo);
      form.append("description", description.trim());
      form.append("lat", String(loc.lat));
      form.append("lng", String(loc.lng));
      form.append("locationName", loc.label);
      const res = await api.postForm<{
        reportId: string;
        ai: AiClassification;
        duplicate: {
          issueId: string;
          title: string;
          distanceM: number;
          upvoteCount: number;
          reportCount: number;
          status: string;
        } | null;
      }>("/api/reports", form);
      setReportId(res.reportId);
      setAi({ ...res.ai, categoryId: CATEGORY_ID_BY_NAME[res.ai.category] ?? null });
      setCorrectedCategory(CATEGORY_ID_BY_NAME[res.ai.category] ?? null);
      setCorrectedSeverity(res.ai.severity);
      setCorrectedType(res.ai.type);
      setDuplicate(res.duplicate);
      // Pre-open the correction panel if the user picked a different category.
      if (pickedCategory && CATEGORY_ID_BY_NAME[res.ai.category] !== pickedCategory) {
        setCorrecting(true);
        setCorrectedCategory(pickedCategory);
      }
      setStep("ai");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit your report");
    } finally {
      setBusy(false);
    }
  };

  const finalize = async (decision: "create" | "merge") => {
    if (!reportId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const body =
        decision === "merge"
          ? { decision: "merge", issueId: duplicate?.issueId }
          : {
              decision: "create",
              categoryId: correcting ? correctedCategory : ai?.categoryId,
              severity: correcting ? correctedSeverity : ai?.severity,
              type: correcting ? correctedType : ai?.type,
            };
      const res = await api.post<{ merged: boolean; issueId: string; issue?: IssueSummary }>(
        `/api/reports/${reportId}/finalize`,
        body,
      );
      setDone(res);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't finish posting");
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setStep("photo");
    setPhoto(null);
    setPreview(null);
    setDescription("");
    setPickedCategory(null);
    setReportId(null);
    setAi(null);
    setDuplicate(null);
    setCorrecting(false);
    setDone(null);
    setError(null);
  };

  return (
    <div className="fade-in" style={{ maxWidth: 640, margin: "0 auto", width: "100%" }}>
      <div className="page-head">
        <h1>
          {step === "done" ? "You're all set" : "Report an issue"}
        </h1>
        <p>Photo → location → done. It takes less than a minute.</p>
      </div>

      {step !== "done" && (
        <div className="step-dots">
          {STEP_LABELS.map((s, i) => (
            <span key={s} className={`step-dot ${i === stepIndex ? "on" : i < stepIndex ? "on" : ""}`} />
          ))}
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}

      {step === "photo" && (
        <div className="report-card card slide-up">
          {preview ? (
            <div className="photo-preview">
              <img src={preview} alt="Preview" />
              <div className="row" style={{ position: "absolute", bottom: 10, right: 10 }}>
                <button className="pill-btn" onClick={() => fileRef.current?.click()} style={{ background: "rgba(0,0,0,0.55)", color: "#fff" }}>
                  📷 Retake
                </button>
              </div>
            </div>
          ) : (
            <div className="photo-drop" onClick={() => fileRef.current?.click()} onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()} tabIndex={0} role="button">
              <div style={{ fontSize: 40 }}>📸</div>
              <strong>Snap or upload a photo</strong>
              <p className="muted">The issue itself — a pothole, leak, dumped trash…</p>
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => pickFile(e.target.files?.[0])}
          />
          <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 16 }} disabled={!photo} onClick={() => setStep("location")}>
            Continue →
          </button>
        </div>
      )}

      {step === "location" && (
        <div className="report-card card slide-up">
          {loc ? (
            <>
              <div
                className="card"
                style={{
                  background: "color-mix(in srgb, var(--brand-soft) 45%, var(--surface))",
                  border: "1.5px solid var(--brand)",
                  padding: 14,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <span style={{ fontSize: 26 }}>📌</span>
                <div style={{ flex: 1 }}>
                  <strong style={{ fontSize: 15 }}>{loc.label}</strong>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
                    {loc.approximate ? " · approximate pin — tap to fine-tune" : " · from GPS"}
                  </div>
                </div>
                <button className="pill-btn" onClick={() => setPickerOpen(true)}>
                  Change
                </button>
              </div>
              <p className="muted" style={{ fontSize: 12.5, margin: "8px 2px 0" }}>
                🗺 Spot on the map looks off? Fine-tune by choosing the closest street below.
              </p>
            </>
          ) : (
            <>
              <div className="field">
                <label>Where is it?</label>
                <button className="btn btn-ghost btn-block" disabled={locBusy} onClick={() => void useMyLocation()}>
                  {locBusy ? "📍 Locating…" : "📍 Use my current location"}
                </button>
              </div>
              {locBlocked && (
                <p className="muted" style={{ fontSize: 13, margin: "2px 2px 10px" }}>
                  {locStatus === "denied"
                    ? "Location permission is blocked — drop a pin on the map instead, the demo works just as well."
                    : locStatus === "unsupported"
                      ? "This browser can't provide GPS — drop a pin on the map instead."
                      : "No GPS fix — drop a pin on the map instead."}
                </p>
              )}
              <div className="field" style={{ marginTop: 8 }}>
                <label>Or drop a pin on the map</label>
                <button className="btn btn-ghost btn-block" style={{ borderStyle: "dashed" }} onClick={() => setPickerOpen(true)}>
                  🗺 Open the map
                </button>
              </div>
            </>
          )}
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setStep("photo")}>← Back</button>
            <button className="btn btn-primary btn-lg" style={{ flex: 1 }} disabled={!loc} onClick={() => setStep("details")}>
              Continue →
            </button>
          </div>
          <LocationPickerModal
            open={pickerOpen}
            status={locStatus}
            selectedLabel={loc?.label ?? null}
            onClose={() => setPickerOpen(false)}
            onLocate={useMyLocation}
            onPick={pickSpot}
          />
        </div>
      )}

      {step === "details" && (
        <div className="report-card card slide-up">
          <div className="field">
            <label>What's happening? (optional but helps)</label>
            <textarea
              className="textarea"
              placeholder='e.g. "Deep pothole near the school — cars are swerving"'
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
            />
          </div>
          <div className="field">
            <label>I know what this is (optional)</label>
            <div className="option-list">
              {CATEGORY_OPTIONS.map((c) => (
                <button
                  key={c.id}
                  className={`option-card ${pickedCategory === c.id ? "recommended" : ""}`}
                  onClick={() => setPickedCategory((v) => (v === c.id ? null : c.id))}
                >
                  <span style={{ fontSize: 18 }}>{c.icon}</span>
                  <span>{c.name}</span>
                  {pickedCategory === c.id && <span className="chip tier-low" style={{ marginLeft: "auto" }}>✓</span>}
                </button>
              ))}
            </div>
            <p className="muted" style={{ marginTop: 4 }}>
              Not sure? Skip it — our AI will take a guess and you can confirm.
            </p>
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn btn-ghost" onClick={() => setStep("location")}>← Back</button>
            <button className="btn btn-primary btn-lg" style={{ flex: 1 }} disabled={busy} onClick={() => void submit()}>
              {busy ? "Analyzing…" : "🚀 Submit report"}
            </button>
          </div>
        </div>
      )}

      {step === "ai" && ai && (
        <div className="report-card card slide-up">
          <div className="sparkle-row">
            <span className="sparkle">✨</span> AI analyzed your photo & description
          </div>

          {duplicate && !correcting && (
            <div className="card" style={{ background: "color-mix(in srgb, var(--accent-soft) 40%, var(--surface))", borderColor: "var(--accent)", marginTop: 12, padding: 14 }}>
              <strong style={{ fontSize: 15 }}>👥 This looks like an existing report</strong>
              <p style={{ fontSize: 13.5, margin: "6px 0" }}>
                <strong>{duplicate.title}</strong> is {duplicate.distanceM}m away with{" "}
                <strong>{duplicate.upvoteCount} upvotes</strong> from {duplicate.reportCount}{" "}
                {duplicate.reportCount === 1 ? "person" : "people"} ({duplicate.status.replace("_", " ")}).
              </p>
              {ai.signals && ai.signals.length > 0 && (
                <div className="muted" style={{ fontSize: 12, margin: "4px 0 8px" }}>
                  <strong>Why the match:</strong> {ai.explanation.split(".")[0]}. (
                  {ai.signals.slice(0, 3).map((s) => s.replace(/^\p{Extended_Pictographic}\s*/u, "")).join("; ")})
                </div>
              )}
              <div className="option-list">
                <button className="option-card recommended" onClick={() => void finalize("merge")} disabled={busy}>
                  <span style={{ fontSize: 20 }}>👍</span>
                  <span>
                    <strong>Add your upvote instead</strong>
                    <span className="muted" style={{ display: "block" }}>
                      Joins the crowd — gets it fixed faster, no duplicate card
                    </span>
                  </span>
                </button>
                <button className="option-card" onClick={() => setCorrecting(true)} disabled={busy}>
                  <span style={{ fontSize: 20 }}>➕</span>
                  <span>
                    <strong>Post separately anyway</strong>
                    <span className="muted" style={{ display: "block" }}>Review the AI analysis first</span>
                  </span>
                </button>
              </div>
            </div>
          )}

          {(!duplicate || correcting) && (
            <>
              <div className="card" style={{ background: "var(--surface-2)", boxShadow: "none", padding: 14, marginTop: 12 }}>
                <div className="ai-badge-row">
                  <span className="chip" style={{ background: "var(--brand-soft)", color: "var(--brand-strong)", fontWeight: 800, fontSize: 14 }}>
                    {correcting ? correctedType : ai.type}
                  </span>
                  <span className={`chip tier-${correcting ? correctedSeverity : ai.severity}`}>
                    {correcting ? correctedSeverity : ai.severity} severity
                  </span>
                  {!correcting && (
                    <span className="muted">
                      {Math.round(ai.confidence * 100)}% confidence
                    </span>
                  )}
                </div>
                {!correcting && <p className="ai-explanation">{ai.explanation}</p>}
                {!correcting && <EvidenceChips signals={ai.signals} imageAnalyzed={ai.imageAnalyzed} />}

                {!correcting && (
                  <button className="btn btn-ghost" onClick={() => { setCorrecting(true); setCorrectedType(ai.type); setCorrectedSeverity(ai.severity); setCorrectedCategory(ai.categoryId); }}>
                    ✏️ That's not quite right — correct it
                  </button>
                )}
              </div>

              {correcting && (
                <div className="card" style={{ background: "var(--surface-2)", boxShadow: "none", padding: 14, marginTop: 12 }}>
                  <strong style={{ fontSize: 14 }}>What is it actually?</strong>
                  <div className="field" style={{ marginTop: 10 }}>
                    <label>Type</label>
                    <input className="input" value={correctedType} onChange={(e) => setCorrectedType(e.target.value)} maxLength={80} />
                  </div>
                  <div className="field">
                    <label>Category</label>
                    <div className="option-list">
                      {CATEGORY_OPTIONS.map((c) => (
                        <button
                          key={c.id}
                          className={`option-card ${correctedCategory === c.id ? "recommended" : ""}`}
                          onClick={() => setCorrectedCategory(c.id)}
                        >
                          <span>{c.icon}</span>
                          <span style={{ fontSize: 13.5 }}>{c.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="field">
                    <label>Severity</label>
                    <div className="row" style={{ flexWrap: "wrap" }}>
                      {(["low", "medium", "high", "critical"] as const).map((s) => (
                        <button
                          key={s}
                          className={`sort-chip ${correctedSeverity === s ? "active" : ""}`}
                          onClick={() => setCorrectedSeverity(s)}
                          style={{ background: correctedSeverity === s ? undefined : "var(--surface)" }}
                        >
                          {s === "critical" ? "🚨 " : ""}{s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="muted">AI results are always suggestions — your correction is final.</p>
                </div>
              )}

              <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 14 }} disabled={busy} onClick={() => void finalize("create")}>
                {busy ? "Posting…" : correcting ? "Post with my correction" : "✅ Looks right — post it"}
              </button>
              {correcting && (
                <button className="btn btn-ghost btn-block" style={{ marginTop: 8 }} onClick={() => setCorrecting(false)}>
                  Back to AI suggestion
                </button>
              )}
            </>
          )}
        </div>
      )}

      {step === "done" && done && (
        <div className="report-card card slide-up" style={{ textAlign: "center", padding: 28 }}>
          <div style={{ fontSize: 52 }}>{done.merged ? "👥" : "🚀"}</div>
          <h2 style={{ marginTop: 8 }}>
            {done.merged ? "You joined the crowd!" : "Posted!"}
          </h2>
          {done.merged ? (
            <p style={{ color: "var(--text-2)" }}>
              Your report was merged into <strong>“{done.issue?.title ?? "the issue"}”</strong> and your upvote counts.
              Every report pushes it higher on the city's list.
            </p>
          ) : (
            <p style={{ color: "var(--text-2)" }}>
              Your issue is live. We notified you once AI analysis completes, and upvotes will
              push it up the priority scale.
            </p>
          )}
          <div className="row" style={{ justifyContent: "center", marginTop: 18 }}>
            <Link to={`/issue/${done.issueId}`} className="btn btn-primary">View issue</Link>
            <button className="btn btn-ghost" onClick={() => { reset(); navigate("/feed"); }}>
              Back to feed
            </button>
          </div>
          {!done.merged && (
            <button className="btn btn-ghost btn-block" style={{ marginTop: 14 }} onClick={() => { reset(); navigate("/report"); }}>
              + Report another
            </button>
          )}
        </div>
      )}
    </div>
  );
}