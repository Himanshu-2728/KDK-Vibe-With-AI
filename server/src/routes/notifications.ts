import { Router } from "express";
import { getDb } from "../db.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

/** GET /api/notifications */
router.get("/", (req: AuthedRequest, res) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT n.*, i.title AS issue_title, i.status AS issue_status
       FROM notifications n LEFT JOIN issues i ON i.id = n.issue_id
       WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 50`,
    )
    .all(req.user!.id);
  const unreadCount = (
    db
      .prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0")
      .get(req.user!.id) as { n: number }
  ).n;
  res.json({ items: rows, unreadCount });
});

/** POST /api/notifications/:id/read */
router.post("/:id/read", (req: AuthedRequest, res) => {
  getDb()
    .prepare("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?")
    .run(req.params.id, req.user!.id);
  res.json({ ok: true });
});

/** POST /api/notifications/read-all */
router.post("/read-all", (req: AuthedRequest, res) => {
  getDb()
    .prepare("UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0")
    .run(req.user!.id);
  res.json({ ok: true });
});

export default router;