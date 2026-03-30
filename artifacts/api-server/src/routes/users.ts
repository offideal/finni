import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { hashPassword } from "../lib/auth";
import { newId } from "../lib/id";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/", requireAuth, async (req, res): Promise<void> => {
  const users = await db.select({
    id: usersTable.id,
    email: usersTable.email,
    fullName: usersTable.fullName,
    role: usersTable.role,
    tenantId: usersTable.tenantId,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(eq(usersTable.tenantId, req.session.tenantId!));
  res.json(users);
});

router.post("/", requireRole("admin"), async (req, res): Promise<void> => {
  const { email, fullName, password, role } = req.body;
  if (!email || !fullName || !password || !role) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }
  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(usersTable).values({
    id: newId(),
    email: email.toLowerCase().trim(),
    fullName,
    passwordHash,
    role,
    tenantId: req.session.tenantId!,
  }).returning({
    id: usersTable.id,
    email: usersTable.email,
    fullName: usersTable.fullName,
    role: usersTable.role,
    tenantId: usersTable.tenantId,
    createdAt: usersTable.createdAt,
  });
  res.status(201).json(user);
});

router.patch("/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const { fullName, role } = req.body;
  const updates: Record<string, unknown> = {};
  if (fullName !== undefined) updates["fullName"] = fullName;
  if (role !== undefined) updates["role"] = role;

  const [user] = await db.update(usersTable)
    .set(updates)
    .where(and(eq(usersTable.id, req.params["id"]!), eq(usersTable.tenantId, req.session.tenantId!)))
    .returning({
      id: usersTable.id,
      email: usersTable.email,
      fullName: usersTable.fullName,
      role: usersTable.role,
      tenantId: usersTable.tenantId,
      createdAt: usersTable.createdAt,
    });

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(user);
});

export default router;
