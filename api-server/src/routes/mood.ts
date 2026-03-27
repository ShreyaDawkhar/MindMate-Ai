import { Router, type IRouter } from "express";
import { db, moodEntriesTable } from "@workspace/db";
import { eq, desc, gte } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

function getUserId(req: any): string {
  return (req.session as any)?.userId ?? "anonymous";
}

const moodScore: Record<string, number> = {
  very_happy: 5,
  happy: 4,
  neutral: 3,
  sad: 2,
  very_sad: 1,
};

router.get("/entries", async (req, res) => {
  const userId = getUserId(req);
  const days = Number(req.query.days) || 30;
  const since = new Date();
  since.setDate(since.getDate() - days);

  const entries = await db
    .select()
    .from(moodEntriesTable)
    .where(eq(moodEntriesTable.userId, userId))
    .orderBy(desc(moodEntriesTable.createdAt))
    .limit(days);

  res.json(entries.map(e => ({
    id: e.id,
    mood: e.mood,
    emotion: e.emotion,
    note: e.note,
    intensity: e.intensity,
    createdAt: e.createdAt,
  })));
});

router.post("/entries", async (req, res) => {
  const userId = getUserId(req);
  const { mood, emotion, note, intensity } = req.body;
  if (!mood) {
    res.status(400).json({ error: "mood required" });
    return;
  }
  const id = crypto.randomUUID();
  await db.insert(moodEntriesTable).values({
    id,
    userId,
    mood,
    emotion: emotion ?? "neutral",
    note: note ?? null,
    intensity: intensity ?? 0.5,
  });
  res.status(201).json({ id, mood, emotion, note, intensity, createdAt: new Date() });
});

router.get("/insights", async (req, res) => {
  const userId = getUserId(req);
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const entries = await db
    .select()
    .from(moodEntriesTable)
    .where(eq(moodEntriesTable.userId, userId))
    .orderBy(desc(moodEntriesTable.createdAt))
    .limit(30);

  if (entries.length === 0) {
    res.json({
      averageMood: 3,
      trend: "stable",
      peakStressTime: "Evening",
      dominantEmotion: "neutral",
      weeklyData: [],
      patterns: ["Start logging your mood daily to see insights!"],
      alertLevel: "none",
    });
    return;
  }

  const scores = entries.map(e => moodScore[e.mood] ?? 3);
  const averageMood = scores.reduce((a, b) => a + b, 0) / scores.length;

  const recentAvg = scores.slice(0, 7).reduce((a, b) => a + b, 0) / Math.min(scores.length, 7);
  const olderAvg = scores.slice(7, 14).reduce((a, b) => a + b, 0) / Math.max(1, Math.min(scores.length - 7, 7));
  const trend = recentAvg > olderAvg + 0.3 ? "improving" : recentAvg < olderAvg - 0.3 ? "declining" : "stable";

  const emotionCounts: Record<string, number> = {};
  entries.forEach(e => {
    if (e.emotion) emotionCounts[e.emotion] = (emotionCounts[e.emotion] ?? 0) + 1;
  });
  const dominantEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "neutral";

  const weeklyData = entries.slice(0, 7).reverse().map(e => ({
    date: new Date(e.createdAt).toLocaleDateString("en-US", { weekday: "short" }),
    score: moodScore[e.mood] ?? 3,
    emotion: e.emotion ?? "neutral",
  }));

  const patterns: string[] = [];
  if (trend === "declining") patterns.push("Your mood has been declining. Consider speaking to someone.");
  if (dominantEmotion === "anxious") patterns.push("Anxiety seems to be a recurring theme. Try breathing exercises.");
  if (dominantEmotion === "stressed") patterns.push("High stress detected. A mindfulness session might help.");
  if (averageMood >= 4) patterns.push("You've been maintaining a positive mood!");
  if (patterns.length === 0) patterns.push("Keep logging to discover your mood patterns.");

  const alertLevel = averageMood < 2 ? "high" : averageMood < 2.5 ? "medium" : averageMood < 3 ? "low" : "none";

  res.json({
    averageMood,
    trend,
    peakStressTime: "Evening",
    dominantEmotion,
    weeklyData,
    patterns,
    alertLevel,
  });
});

export default router;
