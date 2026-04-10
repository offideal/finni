import { Router, type IRouter } from "express";
import { db, projectsTable, reportsTable, versionsTable } from "@workspace/db";
import { eq, and, desc, asc } from "drizzle-orm";
import { newId } from "../lib/id";
import { requireAuth } from "../middlewares/requireAuth";
import path from "path";
import fs from "fs";
import { getVersionWithProjectForTenant } from "../access/tenantResources";
import {
  allocateReportTempPath,
  auditReportExport,
  loadVersionExportSnapshot,
  safeUnlink,
  writePdfExportFile,
  writeXlsxExportFile,
} from "../services/reportExportService";
import type { Request, Response } from "express";

const router: IRouter = Router({ mergeParams: true });

router.get("/:versionId/reports", requireAuth, async (req, res): Promise<void> => {
  const { versionId } = req.params as { versionId: string };
  const access = await getVersionWithProjectForTenant(versionId, req.session.tenantId!);
  if (!access) {
    res.status(404).json({ error: "Version not found" });
    return;
  }

  const reports = await db
    .select()
    .from(reportsTable)
    .where(eq(reportsTable.versionId, versionId))
    .orderBy(desc(reportsTable.createdAt), asc(reportsTable.id));
  res.json(reports);
});

async function handleExport(req: Request, res: Response, format: "PDF" | "XLSX"): Promise<void> {
  const { versionId } = req.params as { versionId: string };
  const tenantId = req.session.tenantId!;
  const userId = req.session.userId!;

  const loaded = await loadVersionExportSnapshot(versionId, tenantId);
  if (!loaded.ok) {
    res.status(loaded.httpStatus).json(loaded.body);
    return;
  }

  const { snapshot } = loaded;
  const ext = format === "PDF" ? ".pdf" : ".xlsx";
  const filePath = allocateReportTempPath(versionId, ext);

  try {
    if (format === "PDF") {
      await writePdfExportFile(snapshot, filePath);
    } else {
      await writeXlsxExportFile(snapshot, filePath);
    }
  } catch (err) {
    await safeUnlink(filePath);
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({
      error: "Export failed",
      code: "EXPORT_FAILED",
      summary: message,
    });
    return;
  }

  const [report] = await db
    .insert(reportsTable)
    .values({
      id: newId(),
      versionId,
      type: format,
      filePath,
      createdByUserId: userId,
    })
    .returning();

  await auditReportExport({
    tenantId: snapshot.project.tenantId,
    actorUserId: userId,
    versionId,
    projectId: snapshot.project.id,
    reportId: report.id,
    format,
  });

  res.json(report);
}

router.post("/:versionId/reports/pdf", requireAuth, async (req, res): Promise<void> => {
  await handleExport(req, res, "PDF");
});

router.post("/:versionId/reports/xlsx", requireAuth, async (req, res): Promise<void> => {
  await handleExport(req, res, "XLSX");
});

const reportDownloadRouter: IRouter = Router();

reportDownloadRouter.get("/:reportId/download", requireAuth, async (req, res): Promise<void> => {
  const { reportId } = req.params as { reportId: string };
  const tenantId = req.session.tenantId!;

  const [row] = await db
    .select({ report: reportsTable })
    .from(reportsTable)
    .innerJoin(versionsTable, eq(reportsTable.versionId, versionsTable.id))
    .innerJoin(projectsTable, eq(versionsTable.projectId, projectsTable.id))
    .where(and(eq(reportsTable.id, reportId), eq(projectsTable.tenantId, tenantId)))
    .limit(1);

  const report = row?.report;
  if (!report) {
    res.status(404).json({ error: "Report not found" });
    return;
  }

  if (!fs.existsSync(report.filePath)) {
    res.status(404).json({ error: "Report file not found" });
    return;
  }

  const ext = path.extname(report.filePath).toLowerCase();
  const contentType =
    ext === ".pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="finni-report${ext}"`);
  fs.createReadStream(report.filePath).pipe(res);
});

export { router as versionReportsRouter, reportDownloadRouter };
