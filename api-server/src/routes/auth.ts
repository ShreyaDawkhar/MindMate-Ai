import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { createHash } from "crypto";

const router: IRouter = Router();

function hashPassword(password: string): string {
  return createHash("sha256").update(password + "mindmate_salt").digest("hex");
}

function getUserId(req: any): string | null {
  return (req.session as any)?.userId ?? null;
}

router.get("/me", async (req, res) => {
  const userId = getUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user[0]) {
    res.status(401).json({ error: "User not found" });
    return;
  }
  const u = user[0];
  res.json({
    id: u.id,
    name: u.name,
    email: u.email,
    isAnonymous: u.isAnonymous,
    emotionalProfile: u.emotionalProfile,
    streakDays: u.streakDays,
    createdAt: u.createdAt,
  });
});

router.post("/anonymous", async (req, res) => {
  const id = crypto.randomUUID();
  await db.insert(usersTable).values({
    id,
    isAnonymous: true,
    streakDays: 0,
    lastActiveDate: new Date().toISOString().split("T")[0],
  });
  (req.session as any).userId = id;
  res.json({
    id,
    isAnonymous: true,
    streakDays: 0,
    createdAt: new Date(),
  });
});

router.post("/register", async (req, res) => {
  const { name, email, password, preferences } = req.body;
  if (!name || !email || !password) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  if (existing[0]) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }
  const id = crypto.randomUUID();
  await db.insert(usersTable).values({
    id,
    name,
    email,
    passwordHash: hashPassword(password),
    isAnonymous: false,
    emotionalProfile: preferences ?? [],
    streakDays: 0,
    lastActiveDate: new Date().toISOString().split("T")[0],
  });
  (req.session as any).userId = id;
  res.json({
    id,
    name,
    email,
    isAnonymous: false,
    emotionalProfile: preferences ?? [],
    streakDays: 0,
    createdAt: new Date(),
  });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Missing email or password" });
    return;
  }
  const users = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
  const user = users[0];
  if (!user || user.passwordHash !== hashPassword(password)) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  (req.session as any).userId = user.id;
  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    isAnonymous: user.isAnonymous,
    emotionalProfile: user.emotionalProfile,
    streakDays: user.streakDays,
    createdAt: user.createdAt,
  });
});

router.post("/logout", async (req, res) => {
  (req.session as any).userId = null;
  res.json({ success: true });
});

export default router;
