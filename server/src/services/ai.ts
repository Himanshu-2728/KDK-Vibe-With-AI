import type {
  AiClassification,
  CategoryName,
  Severity,
} from "../types.js";
import { analyzeImage, describeSignals, type ImageSignals } from "./imageSignals.js";

/**
 * The AI pipeline is behind a single interface so the surrounding flow never
 * changes. The MVP implementation combines:
 *   1. real pixel analysis of the uploaded photo (darkness, color dominance),
 *   2. description keyword matching,
 * and states its confidence honestly. Swapping in a pretrained classifier
 * (e.g. MobileNet fine-tuned on infrastructure photos) only means implementing
 * this interface differently.
 */
export interface AiService {
  classify(input: {
    description: string;
    imagePath?: string | null;
  }): Promise<AiClassification>;
}

interface TypeRule {
  type: string;
  category: CategoryName;
  keywords: string[];
}

const TYPE_RULES: TypeRule[] = [
  {
    type: "Pothole",
    category: "Infrastructure",
    keywords: ["pothole", "potholes", "crater", "sinkhole", "wheel"],
  },
  {
    type: "Broken Streetlight",
    category: "Electrical",
    keywords: [
      "streetlight",
      "street light",
      "lamp",
      "light out",
      "dark street",
      "no light",
    ],
  },
  {
    type: "Water Leakage",
    category: "Water",
    keywords: ["leak", "leaking", "pipe", "gushing", "flood", "flooding", "water"],
  },
  {
    type: "Garbage Dumping",
    category: "Sanitation",
    keywords: ["garbage", "trash", "dumping", "dump", "waste", "litter", "rubbish"],
  },
  {
    type: "Fallen Tree",
    category: "Environment",
    keywords: ["tree", "fallen", "branch", "limb", "uprooted"],
  },
  {
    type: "Electrical Hazard",
    category: "Electrical",
    keywords: ["spark", "sparking", "wire", "power line", "exposed"],
  },
  {
    type: "Damaged Infrastructure",
    category: "Infrastructure",
    keywords: [
      "railing",
      "guardrail",
      "crack",
      "cracked",
      "sidewalk",
      "road",
      "roadway",
      "damaged",
      "broken",
      "collapsed",
    ],
  },
  {
    type: "Safety Hazard",
    category: "Safety",
    keywords: ["accident", "danger", "dangerous", "child", "school", "injury"],
  },
];

const CRITICAL_WORDS = [
  "deep",
  "huge",
  "massive",
  "flood",
  "flooding",
  "gushing",
  "sparking",
  "spark",
  "crash",
  "injury",
  "fall",
  "collapsed",
  "collapse",
  "dangerous",
  "emergency",
  "almost",
  "wrecked",
  "serious",
];

const HIGH_WORDS = [
  "large",
  "severe",
  "major",
  "broken",
  "wreck",
  "unsafe",
  "burst",
  "bad",
  "hole",
];

const MEDIUM_WORDS = [
  "cracked",
  "damaged",
  "blocked",
  "dented",
  "flickering",
  "partial",
  "leak",
];

const SAFETY_WORDS: Array<[string, number]> = [
  ["school", 8],
  ["hospital", 8],
  ["children", 6],
  ["kids", 6],
  ["crossing", 5],
  ["elderly", 5],
  ["crash", 10],
  ["accident", 10],
  ["traffic", 4],
  ["injury", 10],
  ["fall", 8],
];

const LOCATION_WORDS: Array<[string, number]> = [
  ["school", 8],
  ["hospital", 8],
  ["clinic", 6],
  ["main road", 7],
  ["highway", 6],
  ["avenue", 5],
  ["market", 5],
  ["park", 3],
];

/** Photo-palette expectations per category, used as a corroborating signal. */
function paletteMatches(category: CategoryName, s: ImageSignals): number {
  switch (category) {
    case "Infrastructure":
      // Asphalt-ish: dark or mid-dark, low color variance.
      return s.darknessRatio + s.darknessMidRatio > 0.55 && s.variance < 0.35 ? 0.8 : 0.25;
    case "Water":
      return s.blueRatio > 0.2 ? 0.9 : 0.3;
    case "Environment":
      return s.greenRatio > 0.25 ? 0.9 : 0.3;
    case "Electrical":
      // Night scene with bright warm spots (a lamp that is on — or should be).
      return s.meanBrightness < 120 && (s.warmRatio > 0.01 || s.darknessRatio > 0.4) ? 0.75 : 0.3;
    case "Sanitation":
      // Dumping tends to be visually busy / colorful against a street backdrop.
      return s.variance > 0.25 ? 0.65 : 0.35;
    default:
      return 0.4;
  }
}

/** When there is no textual hint at all, fall back to the strongest palette guess. */
function paletteGuess(s: ImageSignals): TypeRule | null {
  const candidates: Array<[TypeRule, number]> = [
    [TYPE_RULES[0]!, paletteMatches("Infrastructure", s)],
    [TYPE_RULES[2]!, paletteMatches("Water", s)],
    [TYPE_RULES[4]!, paletteMatches("Environment", s)],
    [TYPE_RULES[1]!, paletteMatches("Electrical", s)],
    [TYPE_RULES[3]!, paletteMatches("Sanitation", s)],
  ];
  const best = candidates.reduce((a, b) => (b[1] > a[1] ? b : a));
  return best[1] >= 0.7 ? best[0] : null;
}

function countMatches(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter((k) => lower.includes(k)).length;
}

function estimateSeverity(
  description: string,
  category: CategoryName,
  signals: ImageSignals | null,
): Severity {
  const lower = description.toLowerCase();
  const wordSeverity = (): Severity => {
    if (countMatches(lower, CRITICAL_WORDS) >= 1) return "critical";
    if (countMatches(lower, HIGH_WORDS) >= 1) return "high";
    if (countMatches(lower, MEDIUM_WORDS) >= 1) return "medium";
    // Category-defaults keep reports without strong keywords from being "low" forever.
    if (category === "Safety") return "high";
    if (category === "Water" || category === "Electrical") return "medium";
    return "low";
  };

  let severity = wordSeverity();

  // The photo can raise (never lower) the estimate when damage is clearly visible.
  if (signals) {
    if (category === "Infrastructure" && signals.darknessRatio > 0.35) {
      severity = rankMax(severity, "high");
    }
    if (category === "Water" && signals.blueRatio > 0.2) {
      severity = rankMax(severity, "high");
    }
    if (category === "Electrical" && signals.meanBrightness < 80 && signals.warmRatio < 0.005) {
      // Pitch-dark with no functioning light source at all.
      severity = rankMax(severity, "medium");
    }
  }
  return severity;
}

const SEV_RANK: Severity[] = ["low", "medium", "high", "critical"];
function rankMax(a: Severity, b: Severity): Severity {
  return SEV_RANK.indexOf(a) >= SEV_RANK.indexOf(b) ? a : b;
}

export class RuleBasedAiService implements AiService {
  async classify(input: {
    description: string;
    imagePath?: string | null;
  }): Promise<AiClassification> {
    // Simulate a little latency so the flow behaves like a real model call.
    await new Promise((r) => setTimeout(r, 350));

    const description = input.description ?? "";
    const lower = description.toLowerCase();
    const signals = analyzeImage(input.imagePath ?? null);

    let best: TypeRule | null = null;
    let bestHits = 0;
    for (const rule of TYPE_RULES) {
      const hits = countMatches(lower, rule.keywords);
      if (hits > bestHits) {
        best = rule;
        bestHits = hits;
      }
    }

    // Photo-first fallback when the description gives no signal.
    if (!best && signals && signals.analyzed) {
      best = paletteGuess(signals);
    }

    const type = best?.type ?? "Civic Issue";
    const category = best?.category ?? "Infrastructure";

    // Confidence: keyword evidence + photo corroboration, honestly capped.
    let confidence = 0.5 + bestHits * 0.12 + (bestHits >= 2 ? 0.08 : 0);
    if (signals?.analyzed) {
      const match = paletteMatches(category, signals);
      if (match >= 0.7) confidence += 0.07;
      else if (match >= 0.45) confidence += 0.02;
      if (!best && bestHits === 0) confidence = 0.58; // visual-only guess
    }
    confidence = clamp01(confidence);

    const severity = estimateSeverity(description, category, signals);

    const safetyRisk = SAFETY_WORDS.reduce(
      (sum, [word, weight]) => (lower.includes(word) ? sum + weight : sum),
      0,
    );
    const locationImportance = LOCATION_WORDS.reduce(
      (sum, [word, weight]) => (lower.includes(word) ? sum + weight : sum),
      0,
    );

    const matchedWords = best ? best.keywords.filter((k) => lower.includes(k)) : [];
    const textEvidence = matchedWords.length
      ? `your description (“${matchedWords.slice(0, 3).join("”, “")}”)`
      : null;

    const imageEvidence = signals?.analyzed
      ? `the photo (${describeSignals(signals).slice(0, 2).join("; ")})`
      : signals === null && input.imagePath
        ? null
        : null;
    const visualGuessNote =
      bestHits === 0 && signals?.analyzed
        ? " The description was too vague to classify, so this guess leans on the image."
        : "";

    const sources = [textEvidence, imageEvidence].filter(Boolean).join(", and from ");
    const evidence = sources
      ? `Detected “${type}” from ${sources}.`
      : `Detected “${type}” from the general wording of your description.`;

    const severityReason =
      severity === "critical"
        ? "strong risk language like “deep”, “flooding” or “dangerous”"
        : severity === "high"
          ? signals?.analyzed && category === "Infrastructure" && signals.darknessRatio > 0.35
            ? "a large dark area in the photo suggests real damage"
            : "language suggesting a significant problem"
          : severity === "medium"
            ? "signs of visible damage or disruption"
            : "no strong risk indicators";

    const explanation = `${evidence} Severity estimated ${severity} — ${severityReason}. This is an AI suggestion; please confirm or correct it.${visualGuessNote}`;

    const signalsList: string[] = [];
    if (signals?.analyzed) {
      signalsList.push("📷 photo analyzed");
      signalsList.push(...describeSignals(signals).slice(0, 3).map((s) => `📷 ${s}`));
      const palette = paletteMatches(category, signals);
      signalsList.push(
        palette >= 0.7
          ? `📷 image tones strongly match “${category}”`
          : `📷 image tones are only weakly tied to “${category}”`,
      );
    } else if (input.imagePath) {
      signalsList.push("⚠️ photo format couldn't be pixel-analyzed — relying on your description");
    }

    return {
      type,
      category,
      confidence,
      severity,
      explanation,
      safetyRisk,
      locationImportance,
      signals: signalsList,
      imageAnalyzed: signals?.analyzed ?? false,
    };
  }
}

function clamp01(v: number): number {
  return Math.min(0.95, Math.max(0.5, Math.round(v * 100) / 100));
}

export const aiService: AiService = new RuleBasedAiService();