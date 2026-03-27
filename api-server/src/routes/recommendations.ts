import { Router, type IRouter } from "express";
import { db, moodEntriesTable, chatMessagesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

function getUserId(req: any): string {
  return (req.session as any)?.userId ?? "anonymous";
}

const ALL_RECOMMENDATIONS = [
  { type: "breathing", title: "4-7-8 Breathing", description: "Inhale for 4s, hold 7s, exhale 8s. Reduces anxiety fast.", duration: "5 min", emoji: "🌬️", priority: 1 },
  { type: "meditation", title: "Guided Body Scan", description: "A mindful body scan meditation to release tension and ground yourself.", duration: "10 min", emoji: "🧘", priority: 2 },
  { type: "journaling", title: "Gratitude Journal", description: "Write 3 things you're grateful for today. Shifts focus to positivity.", duration: "5 min", emoji: "📔", priority: 3 },
  { type: "exercise", title: "5-Min Dance Break", description: "Put on your favorite song and move! Movement releases endorphins.", duration: "5 min", emoji: "💃", priority: 4 },
  { type: "breathing", title: "Box Breathing", description: "4-4-4-4 pattern to calm your nervous system instantly.", duration: "3 min", emoji: "📦", priority: 5 },
  { type: "creative", title: "Doodle Therapy", description: "Grab a paper and doodle freely for a few minutes. No art skills needed!", duration: "10 min", emoji: "🎨", priority: 6 },
  { type: "social", title: "Text a Friend", description: "Reach out to someone you haven't spoken to in a while. Connection heals.", duration: "10 min", emoji: "💬", priority: 7 },
  { type: "meditation", title: "Loving-Kindness Meditation", description: "Send good wishes to yourself and others. Builds compassion.", duration: "8 min", emoji: "❤️", priority: 8 },
  { type: "journaling", title: "Worry Dump", description: "Write all your worries down and then close the notebook. Clear your mind.", duration: "7 min", emoji: "🗒️", priority: 9 },
  { type: "exercise", title: "Mindful Walk", description: "Take a 10-minute walk outside, noticing 5 things you see, hear and feel.", duration: "15 min", emoji: "🚶", priority: 10 },
];

router.get("/", async (req, res) => {
  const userId = getUserId(req);
  const recentMood = await db
    .select()
    .from(moodEntriesTable)
    .where(eq(moodEntriesTable.userId, userId))
    .orderBy(desc(moodEntriesTable.createdAt))
    .limit(3);

  let recs = [...ALL_RECOMMENDATIONS];
  const emotions = recentMood.map(m => m.emotion ?? "neutral");

  if (emotions.includes("anxious") || emotions.includes("stressed")) {
    recs = recs.sort((a, b) => {
      const aIsBreath = a.type === "breathing" ? -1 : 0;
      const bIsBreath = b.type === "breathing" ? -1 : 0;
      return aIsBreath - bIsBreath;
    });
  } else if (emotions.includes("sad")) {
    recs = recs.sort((a, b) => {
      const aIsSocial = a.type === "social" ? -1 : 0;
      const bIsSocial = b.type === "social" ? -1 : 0;
      return aIsSocial - bIsSocial;
    });
  }

  res.json(recs.slice(0, 6).map(r => ({ id: crypto.randomUUID(), ...r })));
});

const DAILY_TASKS = [
  { title: "Morning check-in", description: "Log your mood to start the day mindfully", category: "mood", points: 10 },
  { title: "5-min breathing exercise", description: "Take 5 minutes to breathe and center yourself", category: "breathing", points: 15 },
  { title: "Gratitude moment", description: "Write one thing you appreciate today", category: "journaling", points: 10 },
  { title: "Move your body", description: "Any physical activity for 5+ minutes", category: "exercise", points: 20 },
  { title: "Connect with someone", description: "Reach out to a friend or family member", category: "social", points: 15 },
];

router.get("/wellness/tasks", async (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const tasks = DAILY_TASKS.map((t, i) => ({
    id: `task-${i}-${today}`,
    ...t,
    isCompleted: false,
    date: today,
  }));
  res.json(tasks);
});

router.patch("/wellness/tasks", async (req, res) => {
  const { taskId, isCompleted } = req.body;
  const today = new Date().toISOString().split("T")[0];
  const idx = parseInt(taskId.split("-")[1] ?? "0");
  const task = DAILY_TASKS[idx];
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json({
    id: taskId,
    ...task,
    isCompleted,
    date: today,
  });
});

export default router;
