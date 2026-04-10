import { Router, type IRouter } from "express";
import { requireRole } from "../middlewares/requireAuth";
import {
  createUserForTenant,
  deleteUserFromTenant,
  listUsersForTenant,
  updateUserForTenant,
} from "../services/userService";

const router: IRouter = Router();

/** Tenant-admin only: list users in the current tenant (session tenantId). */
router.get("/", requireRole("admin"), async (req, res): Promise<void> => {
  const users = await listUsersForTenant(req.session.tenantId!);
  res.json(users);
});

router.post("/", requireRole("admin"), async (req, res): Promise<void> => {
  const { email, fullName, password, role } = req.body as Record<string, unknown>;
  if (!email || !fullName || !password || !role) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const result = await createUserForTenant({
    tenantId: req.session.tenantId!,
    actorUserId: req.session.userId!,
    email: String(email),
    fullName: String(fullName),
    password: String(password),
    role: String(role),
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  res.status(201).json(result.user);
});

router.patch("/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params["id"]!;
  const { fullName, role } = req.body as { fullName?: string; role?: string };

  const result = await updateUserForTenant({
    tenantId: req.session.tenantId!,
    actorUserId: req.session.userId!,
    userId: id,
    fullName,
    role,
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  if (id === req.session.userId) {
    req.session.role = result.user.role;
  }

  res.json(result.user);
});

router.delete("/:id", requireRole("admin"), async (req, res): Promise<void> => {
  const id = req.params["id"]!;

  const result = await deleteUserFromTenant({
    tenantId: req.session.tenantId!,
    actorUserId: req.session.userId!,
    userId: id,
  });

  if (!result.ok) {
    res.status(result.status).json({ error: result.message });
    return;
  }

  if (id === req.session.userId) {
    req.session.destroy(() => {
      res.json({ message: "Deleted" });
    });
    return;
  }

  res.json({ message: "Deleted" });
});

export default router;
