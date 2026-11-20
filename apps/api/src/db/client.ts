import { AsyncLocalStorage } from "node:async_hooks";
import postgres from "postgres";
import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";
import { runSchemaAndRlsBootstrap } from "./bootstrap-ddl.js";

const ADMIN_URL =
  process.env.DATABASE_ADMIN_URL ??
  "postgres://lingdong:lingdong_v3_dev_password@127.0.0.1:5433/ontology_v3";

const APP_URL =
  process.env.DATABASE_APP_URL ??
  "postgres://lingdong_app:lingdong_app_password@127.0.0.1:5433/ontology_v3";

const SANDBOX_ERP_URL =
  process.env.SANDBOX_ERP_URL ??
  "postgres://lingdong:lingdong_v3_dev_password@127.0.0.1:5433/sandbox_erp";

export const adminSql = postgres(ADMIN_URL, {
  max: Number(process.env.PG_ADMIN_POOL_MAX ?? 10),
  idle_timeout: 20,
  onnotice: () => {},
});
export const appSql = postgres(APP_URL, {
  max: Number(process.env.PG_POOL_MAX ?? 32),
  idle_timeout: 20,
  max_lifetime: 1800,
  onnotice: () => {},
});
export const sandboxErpSql = postgres(SANDBOX_ERP_URL, { max: 8, idle_timeout: 20, onnotice: () => {} });

export const adminDb = drizzle(adminSql, { schema });
export const appDb = drizzle(appSql, { schema });

export type AppDb = PostgresJsDatabase<typeof schema>;

const tenantTxStorage = new AsyncLocalStorage<{ tenantId: string; txDb: AppDb }>();

/**
 * Executes a callback inside a Drizzle transaction bound to `lingdong_app` (non-superuser)
 * with `set_config('app.current_tenant_id', tenantId, true)` so PostgreSQL native RLS
 * strictly isolates all tenant rows at the database engine level.
 * Reuses the active same-tenant transaction via AsyncLocalStorage to prevent pool deadlocks.
 */
export async function withTenantDb<T>(
  tenantId: string,
  fn: (txDb: AppDb) => Promise<T>
): Promise<T> {
  if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
    throw new Error("Invalid tenant identifier");
  }
  const active = tenantTxStorage.getStore();
  if (active && active.tenantId === tenantId) {
    return fn(active.txDb);
  }
  return appDb.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`);
    const typedTx = tx as unknown as AppDb;
    return tenantTxStorage.run({ tenantId, txDb: typedTx }, () => fn(typedTx));
  });
}

export async function ensureDatabaseSchemaAndRls(): Promise<void> {
  await runSchemaAndRlsBootstrap(adminSql);
}
