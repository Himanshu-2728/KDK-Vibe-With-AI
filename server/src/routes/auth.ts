import crypto from "node:crypto";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getDb } from "../db.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import type { User } from "../types.js";

const router = Router();

const signupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().min(1).max(60),
});

const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
});

function toUser(row: {
  id: string;
  email: string;
  display_name: string;
  role: string;
  avatar_url: string | null;
  created_at: string;
}): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role as User["role"],
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
  };
}

function createSession(userId: string): string {
  const token = crypto.randomBytes(32).toString("hex");
  getDb().prepare("INSERT INTO sessions (id, user_id) VALUES (?,?)").run(token, userId);
  return token;
}

router.post("/signup", (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { email, password, displayName } = parsed.data;
  const db = getDb();
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email.toLowerCase());
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO users (id, email, password_hash, display_name, role) VALUES (?,?,?,?,?)",
  ).run(id, email.toLowerCase(), bcrypt.hashSync(password, 10), displayName, "citizen");
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as never as {
    id: string;
    email: string;
    display_name: string;
    role: string;
    avatar_url: string | null;
    created_at: string;
  };
  res.status(201).json({ token: createSession(id), user: toUser(row) });
});

router.post("/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and password" });
    return;
  }
  const { email, password } = parsed.data;
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email.toLowerCase()) as
    | {
        id: string;
        email: string;
        password_hash: string;
        display_name: string;
        role: string;
        avatar_url: string | null;
        created_at: string;
      }
    | undefined;
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    res.status(401).json({ error: "Incorrect email or password" });
    return;
  }
  res.json({ token: createSession(row.id), user: toUser(row) });
});

router.get("/me", requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

export default router;