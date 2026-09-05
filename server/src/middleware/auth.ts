import type { NextFunction, Request, RequestHandler, Response } from "express";
import { getDb } from "../db.js";
import type { Role, User } from "../types.js";

export interface AuthedRequest extends Request {
  user?: User;
}

interface SessionRow {
  user_id: string;
  email: string;
  display_name: string;
  role: Role;
  avatar_url: string | null;
  created_at: string;
}

function resolveUser(token: string | undefined): User | null {
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT s.user_id, u.email, u.display_name, u.role, u.avatar_url, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ?`,
    )
    .get(token) as SessionRow | undefined;
  if (!row) return null;
  return {
    id: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  };
}

export function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice("Bearer ".length).trim();
}

export const requireAuth: RequestHandler = (req: AuthedRequest, res, next) => {
  const user = resolveUser(bearerToken(req));
  if (!user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  req.user = user;
  next();
};

export function requireRole(role: Role): RequestHandler {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (req.user.role !== role) {
      res.status(403).json({ error: "Authority access required" });
      return;
    }
    next();
  };
}

export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const user = resolveUser(bearerToken(req));
  if (user) req.user = user;
  next();
}