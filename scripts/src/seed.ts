import { db, tenantsTable, usersTable, emissionFactorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";

async function main() {
  console.log("Seeding database...");

  const TENANT_ID = "tenant-finni-demo";
  const ADMIN_EMAIL = "admin@finni.fi";

  const [existingTenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, TENANT_ID));
  if (!existingTenant) {
    await db.insert(tenantsTable).values({
      id: TENANT_ID,
      name: "Finni Demo Oy",
    });
    console.log("Created tenant: Finni Demo Oy");
  }

  const [existingAdmin] = await db.select().from(usersTable).where(eq(usersTable.email, ADMIN_EMAIL));
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash("admin123", 10);
    await db.insert(usersTable).values({
      id: uuidv4(),
      email: ADMIN_EMAIL,
      passwordHash,
      fullName: "Admin User",
      role: "admin",
      tenantId: TENANT_ID,
    });
    console.log(`Created admin user: ${ADMIN_EMAIL} / admin123`);

    await db.insert(usersTable).values({
      id: uuidv4(),
      email: "reviewer@finni.fi",
      passwordHash: await bcrypt.hash("reviewer123", 10),
      fullName: "Reviewer User",
      role: "reviewer",
      tenantId: TENANT_ID,
    });
    console.log("Created reviewer user: reviewer@finni.fi / reviewer123");

    await db.insert(usersTable).values({
      id: uuidv4(),
      email: "editor@finni.fi",
      passwordHash: await bcrypt.hash("editor123", 10),
      fullName: "Editor User",
      role: "editor",
      tenantId: TENANT_ID,
    });
    console.log("Created editor user: editor@finni.fi / editor123");
  }

  const [existingFactors] = await db.select().from(emissionFactorsTable).limit(1);
  if (!existingFactors) {
    const factors = [
      { id: uuidv4(), sourceType: "generic", sourceName: "Concrete C25/30", category: "concrete", unit: "kg", co2ePerUnit: 0.159, active: true },
      { id: uuidv4(), sourceType: "generic", sourceName: "Concrete C30/37", category: "concrete", unit: "kg", co2ePerUnit: 0.172, active: true },
      { id: uuidv4(), sourceType: "generic", sourceName: "Reinforcement Steel B500", category: "steel", unit: "kg", co2ePerUnit: 0.76, active: true },
      { id: uuidv4(), sourceType: "generic", sourceName: "Structural Steel S355", category: "steel", unit: "kg", co2ePerUnit: 1.55, active: true },
      { id: uuidv4(), sourceType: "generic", sourceName: "Glulam GL30h", category: "wood", unit: "kg", co2ePerUnit: 0.02, active: true },
      { id: uuidv4(), sourceType: "generic", sourceName: "Cross-Laminated Timber (CLT)", category: "wood", unit: "kg", co2ePerUnit: 0.05, active: true },
      { id: uuidv4(), sourceType: "generic", sourceName: "Mineral Wool Insulation", category: "insulation", unit: "kg", co2ePerUnit: 1.28, active: true },
      { id: uuidv4(), sourceType: "generic", sourceName: "EPS Insulation", category: "insulation", unit: "kg", co2ePerUnit: 2.55, active: true },
      { id: uuidv4(), sourceType: "generic", sourceName: "Float Glass", category: "glass", unit: "kg", co2ePerUnit: 0.86, active: true },
      { id: uuidv4(), sourceType: "generic", sourceName: "Triple Glazed Unit", category: "glass", unit: "m2", co2ePerUnit: 98.0, active: true },
      { id: uuidv4(), sourceType: "generic", sourceName: "Gypsum Board 12.5mm", category: "gypsum", unit: "m2", co2ePerUnit: 2.8, active: true },
      { id: uuidv4(), sourceType: "generic", sourceName: "HVAC Ductwork Steel", category: "HVAC", unit: "kg", co2ePerUnit: 1.55, active: true },
      { id: uuidv4(), sourceType: "generic", sourceName: "Heat Pump Unit", category: "HVAC", unit: "kg", co2ePerUnit: 3.2, active: true },
      { id: uuidv4(), sourceType: "generic", sourceName: "Copper Wiring", category: "electrical", unit: "kg", co2ePerUnit: 3.8, active: true },
      { id: uuidv4(), sourceType: "generic", sourceName: "Site Excavation", category: "site", unit: "m3", co2ePerUnit: 2.5, active: true },
      { id: uuidv4(), sourceType: "EPD", sourceName: "Paroc EXTRA (EPD)", category: "insulation", unit: "kg", co2ePerUnit: 1.15, active: true },
      { id: uuidv4(), sourceType: "EPD", sourceName: "Peikko DELTABEAM (EPD)", category: "steel", unit: "kg", co2ePerUnit: 0.68, active: true },
      { id: uuidv4(), sourceType: "EPD", sourceName: "Siporex AAC Block (EPD)", category: "concrete", unit: "kg", co2ePerUnit: 0.21, active: true },
      { id: uuidv4(), sourceType: "generic", sourceName: "Ready-Mix Concrete", category: "concrete", unit: "m3", co2ePerUnit: 350.0, active: true },
      { id: uuidv4(), sourceType: "generic", sourceName: "Precast Concrete Panel", category: "concrete", unit: "m2", co2ePerUnit: 85.0, active: true },
    ];
    await db.insert(emissionFactorsTable).values(factors);
    console.log(`Seeded ${factors.length} emission factors`);
  }

  console.log("Seeding complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
