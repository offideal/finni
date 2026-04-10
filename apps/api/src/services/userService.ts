import { db, usersTable } from "@workspace/db";
import { eq, and, count } from "drizzle-orm";
import { hashPassword } from "../lib/auth";
import { newId } from "../lib/id";
import { writeAuditLog } from "./auditService";

export const USER_ROLES = ["admin", "editor", "reviewer", "viewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

function isUserRole(r: string): r is UserRole {
  return (USER_ROLES as readonly string[]).includes(r);
}

export type UserPublic = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  tenantId: string;
  createdAt: Date;
};

function toPublic(u: typeof usersTable.$inferSelect): UserPublic {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    tenantId: u.tenantId,
    createdAt: u.createdAt,
  };
}

async function countAdminsInTenant(tenantId: string): Promise<number> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(usersTable)
    .where(and(eq(usersTable.tenantId, tenantId), eq(usersTable.role, "admin")));
  return Number(n);
}

/** Returns error message or null if OK. */
async function assertMinimumOneAdminAfterChange(
  tenantId: string,
  targetUserId: string,
  operation: "delete" | { newRole: string },
): Promise<string | null> {
  const [u] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, targetUserId), eq(usersTable.tenantId, tenantId)));
  if (!u) return "User not found";

  const adminCount = await countAdminsInTenant(tenantId);
  const targetIsAdmin = u.role === "admin";

  if (operation === "delete") {
    if (targetIsAdmin && adminCount <= 1) {
      return "Cannot remove the last tenant admin";
    }
    return null;
  }

  if (targetIsAdmin && operation.newRole !== "admin" && adminCount <= 1) {
    return "Cannot change the role of the last tenant admin";
  }
  return null;
}

export async function listUsersForTenant(tenantId: string): Promise<UserPublic[]> {
  const rows = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      fullName: usersTable.fullName,
      role: usersTable.role,
      tenantId: usersTable.tenantId,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.tenantId, tenantId));
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    fullName: r.fullName,
    role: r.role,
    tenantId: r.tenantId,
    createdAt: r.createdAt,
  }));
}

export async function createUserForTenant(input: {
  tenantId: string;
  actorUserId: string;
  email: string;
  fullName: string;
  password: string;
  role: string;
}): Promise<{ ok: true; user: UserPublic } | { ok: false; status: 400 | 409; message: string }> {
  if (!isUserRole(input.role)) {
    return { ok: false, status: 400, message: "Invalid role" };
  }

  const passwordHash = await hashPassword(input.password);
  const email = input.email.toLowerCase().trim();

  try {
    const [row] = await db
      .insert(usersTable)
      .values({
        id: newId(),
        email,
        fullName: input.fullName,
        passwordHash,
        role: input.role,
        tenantId: input.tenantId,
      })
      .returning();

    const user = toPublic(row);
    await writeAuditLog({
      tenantId: input.tenantId,
      actorUserId: input.actorUserId,
      entityType: "user",
      entityId: user.id,
      action: "user.created",
      diff: { email: user.email, role: user.role, fullName: user.fullName },
    });

    return { ok: true, user };
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code === "23505") {
      return { ok: false, status: 409, message: "Email already registered" };
    }
    throw e;
  }
}

export async function updateUserForTenant(input: {
  tenantId: string;
  actorUserId: string;
  userId: string;
  fullName?: string;
  role?: string;
}): Promise<
  { ok: true; user: UserPublic } | { ok: false; status: 400 | 404; message: string }
> {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, input.userId), eq(usersTable.tenantId, input.tenantId)));
  if (!existing) {
    return { ok: false, status: 404, message: "User not found" };
  }

  if (input.role !== undefined && !isUserRole(input.role)) {
    return { ok: false, status: 400, message: "Invalid role" };
  }

  if (input.role !== undefined) {
    const guard = await assertMinimumOneAdminAfterChange(input.tenantId, input.userId, {
      newRole: input.role,
    });
    if (guard) {
      return { ok: false, status: 400, message: guard };
    }
  }

  const updates: Record<string, unknown> = {};
  if (input.fullName !== undefined) updates["fullName"] = input.fullName;
  if (input.role !== undefined) updates["role"] = input.role;

  if (Object.keys(updates).length === 0) {
    return { ok: true, user: toPublic(existing) };
  }

  const [row] = await db
    .update(usersTable)
    .set(updates)
    .where(and(eq(usersTable.id, input.userId), eq(usersTable.tenantId, input.tenantId)))
    .returning();

  if (!row) {
    return { ok: false, status: 404, message: "User not found" };
  }

  const user = toPublic(row);
  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    entityType: "user",
    entityId: user.id,
    action: "user.updated",
    diff: {
      before: { fullName: existing.fullName, role: existing.role },
      after: { fullName: user.fullName, role: user.role },
    },
  });

  return { ok: true, user };
}

export async function deleteUserFromTenant(input: {
  tenantId: string;
  actorUserId: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; status: 400 | 404; message: string }> {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.id, input.userId), eq(usersTable.tenantId, input.tenantId)));
  if (!existing) {
    return { ok: false, status: 404, message: "User not found" };
  }

  const guard = await assertMinimumOneAdminAfterChange(input.tenantId, input.userId, "delete");
  if (guard) {
    return { ok: false, status: 400, message: guard };
  }

  await db.delete(usersTable).where(eq(usersTable.id, input.userId));

  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    entityType: "user",
    entityId: input.userId,
    action: "user.deleted",
    diff: { email: existing.email, role: existing.role, fullName: existing.fullName },
  });

  return { ok: true };
}
