import { Router, type IRouter } from "express";
import { db, appointmentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

const router: IRouter = Router();

function getUserId(req: any): string {
  return (req.session as any)?.userId ?? "anonymous";
}

const PSYCHOLOGISTS = [
  {
    id: "psych-1",
    name: "Dr. Sarah Chen",
    title: "Clinical Psychologist",
    specialties: ["anxiety", "depression", "youth", "trauma"],
    languages: ["English", "Mandarin"],
    rating: 4.9,
    reviewCount: 128,
    sessionPrice: 80,
    bio: "Dr. Chen specializes in working with youth and young adults, using evidence-based approaches including CBT and mindfulness.",
    availability: ["Mon 10AM", "Wed 2PM", "Fri 11AM"],
    avatarInitials: "SC",
    isOnline: true,
  },
  {
    id: "psych-2",
    name: "Dr. Marcus Rivera",
    title: "Therapist & Counselor",
    specialties: ["stress", "relationships", "identity", "LGBTQ+"],
    languages: ["English", "Spanish"],
    rating: 4.8,
    reviewCount: 94,
    sessionPrice: 70,
    bio: "Marcus creates a safe, affirming space for all identities. He focuses on building resilience and self-compassion.",
    availability: ["Tue 9AM", "Thu 3PM", "Sat 10AM"],
    avatarInitials: "MR",
    isOnline: false,
  },
  {
    id: "psych-3",
    name: "Dr. Priya Patel",
    title: "Child & Adolescent Psychiatrist",
    specialties: ["ADHD", "autism", "anxiety", "school stress"],
    languages: ["English", "Hindi", "Gujarati"],
    rating: 4.95,
    reviewCount: 211,
    sessionPrice: 95,
    bio: "Dr. Patel has 15 years of experience helping adolescents navigate academic pressure, ADHD, and anxiety with compassion.",
    availability: ["Mon 2PM", "Wed 10AM", "Thu 4PM"],
    avatarInitials: "PP",
    isOnline: true,
  },
  {
    id: "psych-4",
    name: "Dr. James Okonkwo",
    title: "Trauma Specialist",
    specialties: ["trauma", "grief", "PTSD", "family issues"],
    languages: ["English", "Yoruba"],
    rating: 4.85,
    reviewCount: 76,
    sessionPrice: 75,
    bio: "Specializing in trauma-informed care, Dr. Okonkwo helps young people process difficult experiences and rebuild confidence.",
    availability: ["Tue 11AM", "Fri 9AM", "Sat 2PM"],
    avatarInitials: "JO",
    isOnline: true,
  },
];

router.get("/", async (req, res) => {
  let psychs = [...PSYCHOLOGISTS];
  const { specialty, language } = req.query as { specialty?: string; language?: string };
  if (specialty) {
    psychs = psychs.filter(p => p.specialties.some(s => s.toLowerCase().includes(specialty.toLowerCase())));
  }
  if (language) {
    psychs = psychs.filter(p => p.languages.some(l => l.toLowerCase().includes(language.toLowerCase())));
  }
  res.json(psychs);
});

router.get("/appointments", async (req, res) => {
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

router.post("/appointments", async (req, res) => {
  const userId = getUserId(req);
  const { psychologistId, date, time, type, notes } = req.body;
  const psych = PSYCHOLOGISTS.find(p => p.id === psychologistId);
  if (!psych) {
    res.status(404).json({ error: "Psychologist not found" });
    return;
  }
  const id = crypto.randomUUID();
  await db.insert(appointmentsTable).values({
    id,
    userId,
    psychologistId,
    psychologistName: psych.name,
    date,
    time,
    type,
    status: "pending",
    notes: notes ?? null,
  });
  res.status(201).json({
    id,
    psychologistId,
    psychologistName: psych.name,
    date,
    time,
    type,
    status: "pending",
    notes,
    createdAt: new Date(),
  });
});

export default router;
