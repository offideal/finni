import { type Request, type Response, type NextFunction } from "express";
import {
  AUDIT_VIEW_ROLES,
  TENANT_EDITOR_ROLES,
  TENANT_EPD_MANAGER_ROLES,
  type AuditViewerRole,
  type TenantEditorRole,
  type TenantEpdManagerRole,
} from "../auth/roles";

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

/** Read-only audit log endpoints (project / version history). */
/** Tenant-scoped custom EPD / emission factor catalog management. */
export function requireTenantEpdManager(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (!TENANT_EPD_MANAGER_ROLES.includes(req.session.role as TenantEpdManagerRole)) {
    res.status(403).json({ error: "Insufficient permissions to manage tenant EPD records" });
    return;
  }
  next();
}

export function requireAuditViewer(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  if (!AUDIT_VIEW_ROLES.includes(req.session.role as AuditViewerRole)) {
    res.status(403).json({ error: "Insufficient permissions to view audit log" });
    return;
  }
  next();
}
