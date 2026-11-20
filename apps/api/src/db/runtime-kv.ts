import { and, eq } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { adminDb, withTenantDb } from "./client.js";

export const runtimeKvState = pgTable("runtime_kv_state", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  namespace: text("namespace").notNull(),
  stateKey: text("state_key").notNull(),
  payloadJson: jsonb("payload_json").$type<Record<string, unknown>>().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export async function saveRuntimeKv(
  tenantId: string,
  namespace: string,
  stateKey: string,
  payload: Record<string, unknown>
): Promise<void> {
  const id = `${tenantId}:${namespace}:${stateKey}`;
  await withTenantDb(tenantId, async (txDb) => {
    await txDb
      .insert(runtimeKvState)
      .values({ id, tenantId, namespace, stateKey, payloadJson: payload, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: runtimeKvState.id,
        set: { payloadJson: payload, updatedAt: new Date() },
      });
  });
}

export async function loadRuntimeKv<T = Record<string, unknown>>(
  tenantId: string,
  namespace: string,
  stateKey: string
): Promise<T | null> {
  return withTenantDb(tenantId, async (txDb) => {
    const [row] = await txDb
      .select()
      .from(runtimeKvState)
      .where(
        and(
          eq(runtimeKvState.tenantId, tenantId),
          eq(runtimeKvState.namespace, namespace),
          eq(runtimeKvState.stateKey, stateKey)
        )
      );
    return (row?.payloadJson as T | undefined) ?? null;
  });
}

export async function deleteRuntimeKv(
  tenantId: string,
  namespace: string,
  stateKey: string
): Promise<void> {
  const id = `${tenantId}:${namespace}:${stateKey}`;
  await withTenantDb(tenantId, async (txDb) => {
    await txDb.delete(runtimeKvState).where(eq(runtimeKvState.id, id));
  });
}

export async function hydrateRuntimeNamespaceAllTenants<T = Record<string, unknown>>(
  namespace: string
): Promise<Array<{ tenantId: string; stateKey: string; payload: T }>> {
  try {
    const rows = await adminDb
      .select()
      .from(runtimeKvState)
      .where(eq(runtimeKvState.namespace, namespace));
    return rows.map((r) => ({
      tenantId: r.tenantId,
      stateKey: r.stateKey,
      payload: r.payloadJson as T,
    }));
  } catch {
    return [];
  }
}
