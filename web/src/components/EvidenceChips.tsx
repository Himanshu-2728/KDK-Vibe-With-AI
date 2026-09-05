/**
 * Renders the AI's evidence signals as small chips — what the classifier
 * actually looked at (photo pixels, keywords, category cues).
 */
export function EvidenceChips({
  signals,
  imageAnalyzed,
}: {
  signals?: string[];
  imageAnalyzed?: boolean;
}) {
  if (!signals || signals.length === 0) return null;
  const emojiOf = (s: string) => {
    const m = s.match(/^(\p{Extended_Pictographic})\s*/u);
    return m ? m[1] : "🧩";
  };
  const textOf = (s: string) => s.replace(/^\p{Extended_Pictographic}\s*/u, "").trim();

  return (
    <div style={{ margin: "10px 0 2px" }}>
      <div className="muted" style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>
        {imageAnalyzed ? "📷 Photo & text evidence" : "📝 Text evidence"}
      </div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
        {signals.map((s, i) => (
          <span
            key={i}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              borderRadius: 8,
              padding: "3px 8px",
              fontSize: 11.5,
              fontWeight: 600,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-2)",
            }}
          >
            <span aria-hidden style={{ fontSize: 12 }}>{emojiOf(s)}</span>
            {textOf(s)}
          </span>
        ))}
      </div>
    </div>
  );
}
