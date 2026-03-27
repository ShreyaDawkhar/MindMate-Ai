import { Router, type IRouter } from "express";
import { db, communityPostsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

router.get("/posts", async (req, res) => {
  const limit = Number(req.query.limit) || 20;
  const posts = await db
    .select()
    .from(communityPostsTable)
    .orderBy(desc(communityPostsTable.createdAt))
    .limit(limit);
  res.json(posts.map(p => ({
    id: p.id,
    content: p.content,
    emotion: p.emotion,
    supportCount: p.supportCount,
    createdAt: p.createdAt,
    timeAgo: timeAgo(new Date(p.createdAt)),
  })));
});

router.post("/posts", async (req, res) => {
  const { content, emotion } = req.body;
  if (!content?.trim()) {
    res.status(400).json({ error: "Content required" });
    return;
  }
  const id = crypto.randomUUID();
  await db.insert(communityPostsTable).values({
    id,
    content: content.trim(),
    emotion: emotion ?? null,
    supportCount: 0,
  });
  res.status(201).json({
    id,
    content: content.trim(),
    emotion,
    supportCount: 0,
    createdAt: new Date(),
    timeAgo: "just now",
  });
});

export default router;
