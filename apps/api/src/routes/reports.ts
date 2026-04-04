import { Router, type IRouter } from "express";
import { db, buildingsTable, projectsTable, productsTable, reportsTable, versionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { newId } from "../lib/id";
import { requireAuth } from "../middlewares/requireAuth";
import path from "path";
import fs from "fs";
import os from "os";
import { getVersionWithProjectForTenant } from "../access/tenantResources";
import { productCo2eTotal } from "../domain/calculation";

const router: IRouter = Router({ mergeParams: true });

router.get("/:versionId/reports", requireAuth, async (req, res): Promise<void> => {
  const { versionId } = req.params as { versionId: string };
  const access = await getVersionWithProjectForTenant(versionId, req.session.tenantId!);
  if (!access) {
    res.status(404).json({ error: "Version not found" });
    return;
  }

  const reports = await db.select().from(reportsTable).where(eq(reportsTable.versionId, versionId));
  res.json(reports);
});

router.post("/:versionId/reports/pdf", requireAuth, async (req, res): Promise<void> => {
  const { versionId } = req.params as { versionId: string };
  const access = await getVersionWithProjectForTenant(versionId, req.session.tenantId!);
  if (!access) {
    res.status(404).json({ error: "Version not found" });
    return;
  }

  const { version, project } = access;
  const products = await db.select().from(productsTable).where(eq(productsTable.versionId, versionId));
  const [building] = await db
    .select()
    .from(buildingsTable)
    .where(eq(buildingsTable.projectId, project.id));

  const reportsDir = path.join(os.tmpdir(), "finni-reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const fileName = `report-${versionId}-${Date.now()}.pdf`;
  const filePath = path.join(reportsDir, fileName);

  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ margin: 50 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  doc.fontSize(20).text("CO2 Climate Report", { align: "center" });
  doc.moveDown();
  doc.fontSize(14).text(`Project: ${project.name}`);
  doc.fontSize(12).text(`Location: ${project.locationCountry}`);
  doc.text(`Building Type: ${project.buildingType}`);
  doc.text(`Version: v${version.versionNumber} (${version.status})`);
  if (building?.grossAreaM2) doc.text(`Gross Area: ${building.grossAreaM2} m²`);
  doc.moveDown();

  doc.fontSize(14).text("Products & CO2 Emissions");
  doc.moveDown(0.5);
  let grandTotal = 0;
  for (const p of products) {
    const total = productCo2eTotal(p) ?? 0;
    grandTotal += total;
    doc
      .fontSize(11)
      .text(
        `${p.name} (${p.category}): ${p.quantityValue ?? 0} ${p.quantityUnit ?? ""} × ${p.co2ePerUnitSnapshot ?? 0} = ${total.toFixed(2)} kg CO2e`,
      );
  }
  doc.moveDown();
  doc.fontSize(14).text(`Grand Total: ${grandTotal.toFixed(2)} kg CO2e`);
  doc.end();

  await new Promise<void>((resolve) => stream.on("finish", resolve));

  const [report] = await db
    .insert(reportsTable)
    .values({
      id: newId(),
      versionId,
      type: "PDF",
      filePath,
      createdByUserId: req.session.userId!,
    })
    .returning();

  res.json(report);
});

router.post("/:versionId/reports/xlsx", requireAuth, async (req, res): Promise<void> => {
  const { versionId } = req.params as { versionId: string };
  const access = await getVersionWithProjectForTenant(versionId, req.session.tenantId!);
  if (!access) {
    res.status(404).json({ error: "Version not found" });
    return;
  }

  const { version, project } = access;
  const products = await db.select().from(productsTable).where(eq(productsTable.versionId, versionId));

  const reportsDir = path.join(os.tmpdir(), "finni-reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  const fileName = `report-${versionId}-${Date.now()}.xlsx`;
  const filePath = path.join(reportsDir, fileName);

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Products");
  ws.addRow(["Project", project.name, "Version", `v${version.versionNumber}`, "Status", version.status]);
  ws.addRow([]);
  ws.addRow(["Name", "Category", "Qty", "Unit", "CO2e/unit", "A1-A3", "A4", "A5", "B", "C", "Total CO2e"]);
  for (const p of products) {
    const total = productCo2eTotal(p) ?? 0;
    ws.addRow([
      p.name,
      p.category,
      p.quantityValue,
      p.quantityUnit,
      p.co2ePerUnitSnapshot,
      p.moduleA1A3Share,
      p.moduleA4Share,
      p.moduleA5Share,
      p.moduleBShare,
      p.moduleCShare,
      total.toFixed(2),
    ]);
  }

  await wb.xlsx.writeFile(filePath);

  const [report] = await db
    .insert(reportsTable)
    .values({
      id: newId(),
      versionId,
      type: "XLSX",
      filePath,
      createdByUserId: req.session.userId!,
    })
    .returning();

  res.json(report);
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
