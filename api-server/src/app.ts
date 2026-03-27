import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const SESSION_COOKIE = "mindmate_session";
const sessions: Record<string, { userId: string }> = {};

app.use((req: any, _res, next) => {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (sessionId && sessions[sessionId]) {
    req.session = sessions[sessionId];
    req.sessionId = sessionId;
  } else {
    req.session = {};
    req.sessionId = null;
  }
  next();
});

import { createHash } from "crypto";

app.use((req: any, res: any, next) => {
  const originalJson = res.json.bind(res);
  res.json = (body: any) => {
    if (req.session?.userId && !req.sessionId) {
      const newSessionId = createHash("sha256")
        .update(req.session.userId + Date.now())
        .digest("hex");
      sessions[newSessionId] = { userId: req.session.userId };
      res.cookie(SESSION_COOKIE, newSessionId, {
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000,
        sameSite: "lax",
      });
    }
    return originalJson(body);
  };
  next();
});

app.use("/api", router);

export default app;
