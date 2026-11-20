import { ensureSeeded } from "./seed-service.js";
import { adminSql, appSql, sandboxErpSql } from "../db/client.js";

async function main() {
  await ensureSeeded();
  console.log("✓ Lingdong Ontology Studio V3 database + Oxigraph ABox seeded successfully.");
  await adminSql.end();
  await appSql.end();
  await sandboxErpSql.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
