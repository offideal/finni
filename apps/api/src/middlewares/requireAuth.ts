import { type Request, type Response, type NextFunction } from "express";
import { TENANT_EDITOR_ROLES, type TenantEditorRole } from "../auth/roles";

export { TENANT_EDITOR_ROLES };
export type { TenantEditorRole };

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.session.userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (!roles.includes(req.session.role ?? "")) {
      res.status(403).json({ error: "Insufficient permissions" });
      return;
    }
    next();
  };
}

/** Mutations that change tenant data (not admin-only user management). */
export function requireTenantEditor(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (!TENANT_EDITOR_ROLES.includes(req.session.role as TenantEditorRole)) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }
  next();
}
