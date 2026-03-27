import { Router, type IRouter } from "express";
import { db, moodEntriesTable, chatMessagesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

function getUserId(req: any): string {
  return (req.session as any)?.userId ?? "anonymous";
}

const CHARACTER_STATES: Record<string, { expression: string; message: string; energy: number; accessory: string }> = {
  joyful: {
    expression: "😄",
    message: "You're doing amazing! Keep that positive energy going! ✨",
    energy: 1.0,
    accessory: "sparkles",
  },
  calm: {
    expression: "😌",
    message: "You seem centered today. That's wonderful! 🌿",
    energy: 0.6,
    accessory: "leaf",
  },
  supportive: {
    expression: "🤗",
    message: "I'm right here with you. You're not alone in this. 💙",
    energy: 0.7,
    accessory: "heart",
  },
  worried: {
    expression: "😟",
    message: "I notice you might be going through something. Want to talk? 🫂",
    energy: 0.5,
    accessory: "cloud",
  },
  encouraging: {
    expression: "💪",
    message: "You've got this! Every step forward counts. 🌟",
    energy: 0.85,
    accessory: "star",
  },
  neutral: {
    expression: "😊",
    message: "Hello! I'm Mia, your mental wellness companion. How are you feeling? 👋",
    energy: 0.7,
    accessory: "none",
  },
};

router.get("/state", async (req, res) => {
  const userId = getUserId(req);

  const recentMoods = await db
    .select()
    .from(moodEntriesTable)
    .where(eq(moodEntriesTable.userId, userId))
    .orderBy(desc(moodEntriesTable.createdAt))
    .limit(3);

  const recentMessages = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.userId, userId))
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(5);

  let characterMood = "neutral";

  const emotions = recentMessages
    .filter(m => m.role === "user" && m.emotion)
    .map(m => m.emotion as string);

  if (emotions.includes("happy")) characterMood = "joyful";
  else if (emotions.includes("hopeful")) characterMood = "encouraging";
  else if (emotions.includes("sad") || emotions.includes("anxious")) characterMood = "supportive";
  else if (emotions.includes("stressed")) characterMood = "worried";
  else if (recentMoods.length > 0) {
    const scores: Record<string, number> = { very_happy: 5, happy: 4, neutral: 3, sad: 2, very_sad: 1 };
    const avg = recentMoods.reduce((a, m) => a + (scores[m.mood] ?? 3), 0) / recentMoods.length;
    if (avg >= 4) characterMood = "joyful";
    else if (avg >= 3.5) characterMood = "calm";
    else if (avg >= 3) characterMood = "neutral";
    else if (avg >= 2) characterMood = "supportive";
    else characterMood = "worried";
  }

  const state = CHARACTER_STATES[characterMood] ?? CHARACTER_STATES.neutral;

  res.json({
    mood: characterMood,
    ...state,
  });
});

export default router;
