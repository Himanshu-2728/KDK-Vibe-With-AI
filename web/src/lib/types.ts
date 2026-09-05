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

export interface User {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  avatarUrl: string | null;
  createdAt: string;
}

export interface AiClassification {
  type: string;
  category: string;
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

export interface IssueImage {
  id: string;
  url: string;
  thumbUrl: string;
  kind: "report" | "after_fix";
  createdAt: string;
  uploadedBy?: string;
}

export interface HistoryEntry {
  id: string;
  fromStatus: string | null;
  toStatus: IssueStatus;
  note: string | null;
  createdAt: string;
  changedByName: string | null;
}

export interface Comment {
  id: string;
  body: string;
  upvoteCount: number;
  createdAt: string;
  authorName: string;
  authorId: string;
}

export interface Resolution {
  id: string;
  note: string | null;
  afterPhotoUrl: string | null;
  resolvedAt: string;
  resolvedBy: string;
  resolvedByName: string | null;
  confirmed: number;
  confirmedBy: string | null;
  confirmedByName: string | null;
  confirmedAt: string | null;
  rejected: number;
  rejectionReason: string | null;
}

export interface IssueReportRow {
  id: string;
  description: string | null;
  latitude: number;
  longitude: number;
  locationName: string | null;
  createdAt: string;
  reporterName: string;
  reporterId: string;
}

export interface IssueDetail {
  issue: IssueSummary;
  images: IssueImage[];
  history: HistoryEntry[];
  comments: Comment[];
  resolution: Resolution | null;
  reports: IssueReportRow[];
  priorityBreakdown: PriorityBreakdown | null;
  aiResult: AiClassification | null;
  department: string | null;
  isReporter: boolean;
}

export interface FeedResponse {
  items: IssueSummary[];
  page: number;
  hasMore: boolean;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  type: string;
  issue_id: string | null;
  body: string;
  read: number;
  created_at: string;
  issue_title: string | null;
  issue_status: string | null;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  icon: string;
  departmentId: number;
  departmentName: string;
}

export const STATUS_LABELS: Record<IssueStatus, string> = {
  reported: "Reported",
  ai_analyzed: "AI Analyzed",
  verified: "Verified",
  assigned: "Assigned",
  in_progress: "In Progress",
  resolved: "Resolved",
  confirmed: "Confirmed",
};

export const TIER_LABELS: Record<PriorityTier, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};