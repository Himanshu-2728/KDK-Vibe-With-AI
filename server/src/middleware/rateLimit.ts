import type { RequestHandler } from "express";

export function createRateLimiter(options: {
  max: number;
  windowMs: number;
}): RequestHandler {
  const hits = new Map<string, number[]>();

  return (req, res, next) => {
    const key = (req as { user?: { id: string } }).user?.id ?? req.ip ?? "anon";
    const now = Date.now();
    const cutoff = now - options.windowMs;
    const list = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length >= options.max) {
      res.status(429).json({
        error: `Rate limit reached — please wait before submitting more reports.`,
      });
      return;
    }
    list.push(now);
    hits.set(key, list);
    next();
  };
}