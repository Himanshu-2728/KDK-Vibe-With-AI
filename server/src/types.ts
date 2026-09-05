export type Role = "citizen" | "authority";

export type IssueStatus =
  | "reported"
  | "ai_analyzed"
  | "verified"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "confirmed";

export type Severity = "low" | "medium" | "high" | "critical";

export type PriorityTier = "low" | "medium" | "high" | "critical";

export type CategoryName =
  | "Infrastructure"
  | "Sanitation"
  | "Water"
  | "Electrical"
  | "Safety"
  | "Environment";

export interface CategoryInfo {
  id: number;
  name: CategoryName;
  color: string;
  icon: string;
  departmentId: number;
  departmentName: string;
}

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  avatarUrl: string | null;
  createdAt: string;
}

export interface IssueSummary {
  id: string;
  title: string;
  description: string;
  categoryId: number;
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
  status: IssueStatus;
  severity: Severity;
  priorityScore: number;
  priorityTier: PriorityTier;
  upvoteCount: number;
  reportCount: number;
  commentCount: number;
  photoUrl: string | null;
  thumbUrl: string | null;
  areaName: string;
  latitude: number;
  longitude: number;
  distanceM: number | null;
  createdAt: string;
  firstReportedAt: string;
  lastReportedAt: string;
  userUpvoted: boolean;
  duplicateNote: string | null;
  aiResult: AiClassification | null;
}

export interface AiClassification {
  type: string;
  category: CategoryName;
  confidence: number;
  severity: Severity;
  explanation: string;
  safetyRisk: number;
  locationImportance: number;
  /** Human-readable evidence chips (photo + text), for the confirm step & detail. */
  signals?: string[];
  imageAnalyzed?: boolean;
}

export interface PriorityBreakdown {
  baseSeverity: number;
  popularity: number;
  safetyRisk: number;
  locationImportance: number;
  ageDecay: number;
  total: number;
  tier: PriorityTier;
}