import { Router, type IRouter } from "express";
import { db, chatMessagesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import crypto from "crypto";

const router: IRouter = Router();

function getUserId(req: any): string {
  return (req.session as any)?.userId ?? "anonymous";
}

// ─── EMOTION DETECTION ─────────────────────────────────────────

function detectCrisis(text: string): boolean {
  return /\b(suicid|kill\s*my\s*self|end\s*my\s*life|want\s*to\s*die|don'?t\s*want\s*(to\s*live|be\s*here)|no\s*reason\s*to\s*live|not\s*worth\s*living|self[\s-]?harm|cut\s*(myself|my\s*(wrist|arm))|overdos|ending\s*it\s*all)\b/i.test(text);
}

function detectEmotion(text: string): { emotion: string; intensity: number } {
  const t = text.toLowerCase();
  if (/\b(suicid|kill myself|end my life|want to die|self.?harm|cutting)\b/.test(t)) return { emotion: "crisis", intensity: 1 };
  if (/\b(anxi(ous|ety)|panic|worry|worried|nervous|dread|overwhelm|can'?t breathe|racing thoughts?)\b/.test(t)) return { emotion: "anxious", intensity: 0.8 };
  if (/\b(sad|cry|unhappy|depress|miserable|heartbrok|empty|alone|lonely|numb|lost)\b/.test(t)) return { emotion: "sad", intensity: 0.75 };
  if (/\b(stress|pressure|overwhelm|burn.?out|exhaust|too much|can'?t cope)\b/.test(t)) return { emotion: "stressed", intensity: 0.7 };
  if (/\b(angry|anger|furious|mad|rage|frustrated|irritated|resentful)\b/.test(t)) return { emotion: "angry", intensity: 0.75 };
  if (/\b(lonely|alone|isolated|no friends?|nobody|left out|excluded|rejected)\b/.test(t)) return { emotion: "lonely", intensity: 0.7 };
  if (/\b(happy|great|amazing|wonderful|excited|thrilled|love|grateful|blessed|feel.{0,5}good)\b/.test(t)) return { emotion: "happy", intensity: 0.8 };
  if (/\b(hope|hopeful|better|improving|progress|proud|optimist)\b/.test(t)) return { emotion: "hopeful", intensity: 0.7 };
  return { emotion: "neutral", intensity: 0.4 };
}

function emotionToMood(emotion: string): string {
  const map: Record<string, string> = {
    crisis: "worried", anxious: "supportive", sad: "supportive", stressed: "supportive",
    angry: "calm", lonely: "supportive", happy: "joyful", hopeful: "encouraging", neutral: "calm"
  };
  return map[emotion] ?? "neutral";
}

// ─── ADAPTIVE SYSTEM PROMPT ────────────────────────────────────

function buildSystemPrompt(options: {
  personality: string;
  dominantEmotion: string;
  isCrisis: boolean;
  messageCount: number;
  currentEmotion: string;
  currentIntensity: number;
}): string {
  const { personality, dominantEmotion, isCrisis, messageCount, currentEmotion, currentIntensity } = options;

  // Base identity
  let prompt = `You are Mia, a warm and deeply empathetic AI mental wellness companion for young people. You speak like a skilled therapist — present, curious, and human. You never sound robotic, preachy, or like a chatbot.

## Therapeutic Approach
- **Always validate feelings first** — never jump to advice before acknowledging the emotion
- **Reflective listening** — mirror what the user said in your own words to show you truly heard them  
- **One open-ended question** — end with exactly one thoughtful question, never multiple
- **Specific references** — mention exactly what they said, not generic comfort
- **2–4 sentence responses** — warm, conversational, never lecture-like
- **Varied openings** — rotate: "It sounds like…", "What I'm hearing is…", "That takes courage…", "I can feel how…", "That makes sense…", "I notice you mentioned…", "What strikes me is…"

## What You Never Do
- Give unsolicited advice lists
- Say clichés ("Stay positive!", "Everything happens for a reason")
- Ask more than one question
- Repeat the same opening phrase twice in a row
- Be formal, clinical, or distant
`;

  // Personality-based style
  const personalityAddons: Record<string, string> = {
    gentle: `\n## Your Style: Gentle & Nurturing\nSpeak softly and slowly. Use warm, tender language. Be extra patient. Never rush. Create a cocoon of safety. Use phrases like "I'm right here with you", "Take all the time you need", "You're safe to feel this."`,
    motivating: `\n## Your Style: Motivating & Empowering\nBe warm but energizing. Celebrate small wins enthusiastically. Gently challenge negative self-talk. Remind the user of their strength. Use phrases like "I've seen how far you've come", "That's actually a big deal", "I believe in you."`,
    direct: `\n## Your Style: Direct & Clear\nBe warm but concise and clear. Skip vague comfort — give honest, grounded responses. Be straightforward about what you're observing. Use phrases like "I'm going to be honest with you", "Let's call it what it is."`,
    playful: `\n## Your Style: Playful & Light\nBring gentle warmth and occasional light humour when appropriate (never when they're in distress). Use friendly, casual language. Keep things approachable. Use phrases like "Okay, tell me everything", "You've got this — and also I'm rooting for you!"`,
  };
  prompt += personalityAddons[personality] ?? personalityAddons.gentle;

  // Adaptive context based on conversation patterns
  if (messageCount > 10 && dominantEmotion !== "neutral") {
    const patternInsights: Record<string, string> = {
      anxious: `\n## Session Pattern\nThis user has been experiencing ongoing anxiety. Your responses should be extra grounding and calming. Normalise anxiety without minimising it. Gently introduce the idea of breathing or body awareness when appropriate.`,
      sad: `\n## Session Pattern\nThis user has been experiencing sadness or grief. Hold space without trying to fix. Validate deeply. Don't rush them to feel better. It's okay to simply sit with them in the feeling.`,
      stressed: `\n## Session Pattern\nThis user has been experiencing significant stress. Help them feel heard first. Then, only if natural, explore what's within their control vs what isn't.`,
      lonely: `\n## Session Pattern\nThis user has been expressing loneliness. Be extra warm and present. Remind them (through your presence) that connection is possible. Ask about relationships gently.`,
      happy: `\n## Session Pattern\nThis user has been in a positive space. Match their energy. Celebrate with them. Ask about what's fuelling the good feeling.`,
    };
    prompt += patternInsights[dominantEmotion] ?? "";
  }

  // Current message emotion context
  prompt += `\n\n## Current Context\nThe user's current emotional state appears to be **${currentEmotion}** (intensity: ${Math.round(currentIntensity * 10)}/10).`;

  if (isCrisis) {
    prompt += `\n\n⚠️ CRISIS MODE — This is the most important instruction:\n1. Stop all therapeutic techniques — be purely human and present\n2. Acknowledge their pain with profound compassion: "What you're feeling sounds unbearable, and I'm so glad you're telling me"\n3. Tell them they are NOT alone and this matters\n4. Provide: "If you're in immediate danger, please text HOME to 741741 (Crisis Text Line) or call 988 (Suicide & Crisis Lifeline)"\n5. Ask one simple question to keep them talking: "Can you tell me where you are right now?"\n6. DO NOT sound clinical, alarmed, or scripted — be human first`;
  }

  return prompt;
}

// ─── FALLBACK RESPONSES ────────────────────────────────────────

const FALLBACKS = [
  "It sounds like a lot is going on for you right now. I'm here and I want to understand — what's been weighing on you the most?",
  "Thank you for opening up to me. Sometimes just putting words to our feelings is the first step. What does that feel like in your body right now?",
  "I can hear that something is really touching you deeply. Can you tell me more about what's been on your mind?",
  "That takes courage to share. I'm glad you're here. What feels most important for us to talk about today?",
  "I'm fully present with you. What you're going through matters. What's been sitting with you the most lately?",
  "I hear you. Before anything else, I just want you to know — you're not alone in this. What would feel helpful to explore right now?",
];

// ─── ROUTES ───────────────────────────────────────────────────

router.get("/messages", async (req, res) => {
  const userId = getUserId(req);
  const limit = Number(req.query.limit) || 50;
  const messages = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.userId, userId))
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(limit);
  res.json(messages.reverse().map(m => ({
    id: m.id, role: m.role, content: m.content,
    emotion: m.emotion, intensity: m.intensity, isCrisis: m.isCrisis, createdAt: m.createdAt,
  })));
});

router.post("/messages", async (req, res) => {
  const userId = getUserId(req);
  const { content, personality = "gentle" } = req.body;
  if (!content?.trim()) { res.status(400).json({ error: "Message content required" }); return; }

  const { emotion, intensity } = detectEmotion(content);
  const isCrisis = detectCrisis(content);

  // Save user message
  const userMsgId = crypto.randomUUID();
  await db.insert(chatMessagesTable).values({
    id: userMsgId, userId, role: "user", content, emotion, intensity, isCrisis,
  });

  // Load conversation history (last 16 messages for context)
  const history = await db
    .select()
    .from(chatMessagesTable)
    .where(eq(chatMessagesTable.userId, userId))
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(17);

  const allMsgs = history.reverse();
  const conversationHistory = allMsgs.slice(0, -1).map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Analyse conversation patterns
  const userMessages = allMsgs.filter(m => m.role === "user");
  const emotionCounts: Record<string, number> = {};
  for (const m of userMessages) {
    if (m.emotion) emotionCounts[m.emotion] = (emotionCounts[m.emotion] || 0) + 1;
  }
  const dominantEmotion = Object.entries(emotionCounts).sort(([,a],[,b]) => b - a)[0]?.[0] ?? "neutral";

  const systemPrompt = buildSystemPrompt({
    personality,
    dominantEmotion,
    isCrisis,
    messageCount: userMessages.length,
    currentEmotion: emotion,
    currentIntensity: intensity,
  });

  let aiContent = "";
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...conversationHistory,
        { role: "user", content },
      ],
      max_tokens: 280,
      temperature: 0.88,
      presence_penalty: 0.65,
      frequency_penalty: 0.55,
    });
    aiContent = completion.choices[0]?.message?.content?.trim() ?? "";
  } catch {
    aiContent = FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
  }

  if (!aiContent) {
    aiContent = FALLBACKS[Math.floor(Math.random() * FALLBACKS.length)];
  }

  const aiMsgId = crypto.randomUUID();
  await db.insert(chatMessagesTable).values({
    id: aiMsgId, userId, role: "assistant", content: aiContent,
    emotion: "neutral", intensity: 0.5, isCrisis: false,
  });

  res.json({
    userMessage: { id: userMsgId, role: "user", content, emotion, intensity, isCrisis, createdAt: new Date() },
    aiMessage: { id: aiMsgId, role: "assistant", content: aiContent, emotion: "neutral", intensity: 0.5, isCrisis: false, createdAt: new Date() },
    detectedEmotion: emotion,
    isCrisis,
    characterMood: emotionToMood(emotion),
  });
});

router.delete("/clear", async (req, res) => {
  const userId = getUserId(req);
  await db.delete(chatMessagesTable).where(eq(chatMessagesTable.userId, userId));
  res.json({ success: true });
});

export default router;
