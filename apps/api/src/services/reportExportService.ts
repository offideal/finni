import fs from "fs";
import path from "path";
import os from "os";
import { db, buildingsTable, productsTable, spacesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import type { Building, Product, Project, Space, Version } from "@workspace/db";
import { getVersionWithProjectForTenant, PROJECT_ARCHIVED_ERROR_CODE } from "../access/tenantResources";
import { productCo2eTotal } from "../domain/calculation";
import { newId } from "../lib/id";
import { writeAuditLog } from "./auditService";

export type VersionExportSnapshot = {
  version: Version;
  project: Project;
  building: Building | null;
  /** Sorted by `id` ascending. */
  spaces: Space[];
  /** Sorted by `id` ascending. */
  products: Product[];
};

export type ExportFailureBody = { error: string; code?: string };

export async function loadVersionExportSnapshot(
  versionId: string,
  tenantId: string,
): Promise<
  | { ok: true; snapshot: VersionExportSnapshot }
  | { ok: false; httpStatus: number; body: ExportFailureBody }
> {
  const access = await getVersionWithProjectForTenant(versionId, tenantId);
  if (!access) {
    return { ok: false, httpStatus: 404, body: { error: "Version not found" } };
  }
  const { version, project } = access;
  if (project.archivedAt) {
    return {
      ok: false,
      httpStatus: 400,
      body: { error: "Project is archived", code: PROJECT_ARCHIVED_ERROR_CODE },
    };
  }

  const products = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.versionId, versionId))
    .orderBy(asc(productsTable.id));

  const [building] = await db.select().from(buildingsTable).where(eq(buildingsTable.versionId, versionId));

  let spaces: Space[] = [];
  if (building) {
    spaces = await db
      .select()
      .from(spacesTable)
      .where(eq(spacesTable.buildingId, building.id))
      .orderBy(asc(spacesTable.id));
  }

  return {
    ok: true,
    snapshot: {
      version,
      project,
      building: building ?? null,
      spaces,
      products,
    },
  };
}

export function allocateReportTempPath(versionId: string, ext: ".pdf" | ".xlsx"): string {
  const reportsDir = path.join(os.tmpdir(), "finni-reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  return path.join(reportsDir, `export-${versionId}-${newId()}${ext}`);
}

function grandTotalKgCo2e(products: Product[]): number {
  let sum = 0;
  for (const p of products) {
    const t = productCo2eTotal(p);
    if (t != null) sum += t;
  }
  return sum;
}

/** Fixed numeric formatting for reproducible exports. */
function fmtCo2e(n: number): string {
  return n.toFixed(2);
}

export async function writePdfExportFile(snapshot: VersionExportSnapshot, filePath: string): Promise<void> {
  const { version, project, building, spaces, products } = snapshot;
  const PDFDocument = (await import("pdfkit")).default;
  const doc = new PDFDocument({ margin: 50 });
  const stream = fs.createWriteStream(filePath);
  doc.pipe(stream);

  doc.fontSize(20).text("CO2 Climate Report", { align: "center" });
  doc.moveDown();
  doc.fontSize(14).text(`Project: ${project.name}`);
  doc.fontSize(12).text(`Location: ${project.locationCountry}`);
  doc.text(`Building type: ${project.buildingType}`);
  doc.text(`Version: v${version.versionNumber} (${version.status})`);
  doc.text(`Version id: ${version.id}`);
  if (building?.grossAreaM2 != null) {
    doc.text(`Gross area: ${building.grossAreaM2.toFixed(2)} m²`);
  }
  doc.moveDown();

  if (version.status !== "locked") {
    doc.fontSize(11).fillColor("#b45309").text("DRAFT — This export is not an official locked report.", {
      align: "left",
    });
    doc.fillColor("#000000");
    doc.moveDown();
  }

  if (spaces.length > 0) {
    doc.fontSize(14).text("Spaces");
    doc.moveDown(0.5);
    doc.fontSize(11);
    for (const s of spaces) {
      doc.text(`${s.name}: ${s.areaM2.toFixed(2)} m² (space id: ${s.id})`);
    }
    doc.moveDown();
  }

  doc.fontSize(14).text("Products & CO2 emissions");
  doc.moveDown(0.5);

  const total = grandTotalKgCo2e(products);
  doc.fontSize(11);
  for (const p of products) {
    const lineTotal = productCo2eTotal(p);
    const displayTotal = lineTotal != null ? fmtCo2e(lineTotal) : "—";
    doc.text(
      `${p.name} (${p.category}) [${p.id}]: ${p.quantityValue ?? "—"} ${p.quantityUnit ?? ""} × ${p.co2ePerUnitSnapshot ?? "—"} = ${displayTotal} kg CO2e`,
    );
  }
  doc.moveDown();
  doc.fontSize(14).text(`Grand total: ${fmtCo2e(total)} kg CO2e`);
  doc.end();

  await new Promise<void>((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

export async function writeXlsxExportFile(snapshot: VersionExportSnapshot, filePath: string): Promise<void> {
  const { version, project, building, spaces, products } = snapshot;
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Finni";
  wb.created = new Date(0);

  const summary = wb.addWorksheet("Summary", { state: "visible" });
  const summaryRows: [string, string][] = [
    ["Project name", project.name],
    ["Project id", project.id],
    ["Location", project.locationCountry],
    ["Building type", project.buildingType],
    ["Version number", String(version.versionNumber)],
    ["Version id", version.id],
    ["Version status", version.status],
    ["Gross area m²", building?.grossAreaM2 != null ? fmtCo2e(building.grossAreaM2) : ""],
    ["Product row count", String(products.length)],
    ["Space row count", String(spaces.length)],
    ["Grand total kg CO2e", fmtCo2e(grandTotalKgCo2e(products))],
  ];
  if (version.status !== "locked") {
    summaryRows.push(["Export note", "DRAFT — not a locked official version"]);
  }
  for (const [k, v] of summaryRows) {
    summary.addRow([k, v]);
  }

  const ws = wb.addWorksheet("Products", { state: "visible" });
  ws.addRow([
    "Product id",
    "Name",
    "Category",
    "Qty",
    "Unit",
    "CO2e/unit",
    "A1-A3",
    "A4",
    "A5",
    "B",
    "C",
    "Total kg CO2e",
  ]);
  for (const p of products) {
    const total = productCo2eTotal(p);
    ws.addRow([
      p.id,
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
      total != null ? fmtCo2e(total) : "",
    ]);
  }

  const sp = wb.addWorksheet("Spaces", { state: "visible" });
  sp.addRow(["Space id", "Name", "Area m²"]);
  for (const s of spaces) {
    sp.addRow([s.id, s.name, s.areaM2]);
  }

  await wb.xlsx.writeFile(filePath);
}

export async function safeUnlink(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath);
  } catch {
    // ignore
  }
}

export async function auditReportExport(input: {
  tenantId: string;
  actorUserId: string;
  versionId: string;
  projectId: string;
  reportId: string;
  format: "PDF" | "XLSX";
}): Promise<void> {
  await writeAuditLog({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    entityType: "version",
    entityId: input.versionId,
    action: "report.exported",
    diff: {
      format: input.format,
      reportId: input.reportId,
      projectId: input.projectId,
    },
  });
}
