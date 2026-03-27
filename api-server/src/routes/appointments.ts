import { Router, type IRouter } from "express";
import { db, appointmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

const PSYCHOLOGISTS: Record<string, string> = {
  "psych-1": "Dr. Sarah Chen",
  "psych-2": "Dr. Marcus Rivera",
  "psych-3": "Dr. Priya Patel",
  "psych-4": "Dr. James Okonkwo",
};

function getUserId(req: any): string {
  return (req.session as any)?.userId ?? "anonymous";
}

router.get("/", async (req, res) => {
  const userId = getUserId(req);
  const appointments = await db
    .select()
    .from(appointmentsTable)
    .where(eq(appointmentsTable.userId, userId));
  res.json(appointments.map(a => ({
    id: a.id,
    psychologistId: a.psychologistId,
    psychologistName: a.psychologistName,
    date: a.date,
    time: a.time,
    type: a.type,
    status: a.status,
    notes: a.notes,
    createdAt: a.createdAt,
  })));
});

router.post("/", async (req, res) => {
  const userId = getUserId(req);
  const { psychologistId, date, time, type, notes } = req.body;
  const psychologistName = PSYCHOLOGISTS[psychologistId];
  if (!psychologistName) {
    res.status(404).json({ error: "Psychologist not found" });
    return;
  }
  const id = crypto.randomUUID();
  await db.insert(appointmentsTable).values({
    id,
    userId,
    psychologistId,
    psychologistName,
    date,
    time,
    type,
    status: "pending",
    notes: notes ?? null,
  });
  res.status(201).json({
    id,
    psychologistId,
    psychologistName,
    date,
    time,
    type,
    status: "pending",
    notes,
    createdAt: new Date(),
  });
});

export default router;
