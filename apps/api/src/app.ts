import express, { type Express, type Request } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import ConnectPgSimple from "connect-pg-simple";
import { randomUUID } from "node:crypto";
import { pool } from "@workspace/db";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

if (process.env["TRUST_PROXY"] === "1" || process.env["BEHIND_PROXY"] === "1") {
  app.set("trust proxy", 1);
}

const PgSession = ConnectPgSimple(session);

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    store: new PgSession({ pool, createTableIfMissing: false }),
    secret: process.env["SESSION_SECRET"] ?? "finni-dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  }),
);

app.use(
  pinoHttp({
    logger,
    genReqId: (req) => {
      const h = req.headers["x-request-id"];
      return typeof h === "string" && h.trim() !== "" ? h.trim() : randomUUID();
    },
    customProps: (req) => {
      const r = req as Request;
      return {
        userId: r.session?.userId,
        tenantId: r.session?.tenantId,
      };
    },
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

app.use("/api", router);

export default app;
