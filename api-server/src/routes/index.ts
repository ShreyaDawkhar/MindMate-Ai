import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import chatRouter from "./chat";
import moodRouter from "./mood";
import recommendationsRouter from "./recommendations";
import psychologistsRouter from "./psychologists";
import appointmentsRouter from "./appointments";
import communityRouter from "./community";
import characterRouter from "./character";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/chat", chatRouter);
router.use("/mood", moodRouter);
router.use("/recommendations", recommendationsRouter);
router.use("/wellness/tasks", recommendationsRouter);
router.use("/psychologists", psychologistsRouter);
router.use("/appointments", appointmentsRouter);
router.use("/community", communityRouter);
router.use("/character", characterRouter);

export default router;
