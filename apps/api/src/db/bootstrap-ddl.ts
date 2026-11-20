import type postgres from "postgres";

const RLS_TABLES = [
  "users",
  "credentials",
  "workspaces",
  "workspace_members",
  "competency_questions",
  "documents",
  "ontology_revisions",
  "changesets",
  "data_sources",
  "schema_snapshots",
  "semantic_mappings",
  "materialization_runs",
  "model_routes",
  "capabilities",
  "semantic_apps",
  "execution_runs",
  "releases",
  "audit_events",
  "runtime_kv_state",
  "async_jobs",
  "audit_hash_chain",
] as const;

const DDL_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), name TEXT NOT NULL, title TEXT NOT NULL, default_role TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), alias TEXT NOT NULL, env_var_name TEXT NOT NULL, allowed_roles JSONB NOT NULL, description TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), slug TEXT NOT NULL, name TEXT NOT NULL, version_label TEXT NOT NULL, status TEXT NOT NULL, description TEXT NOT NULL, namespace_iri TEXT NOT NULL, active_revision_id TEXT NOT NULL, published_revision_id TEXT, abox_instance_count INTEGER NOT NULL DEFAULT 0, work_items_json JSONB NOT NULL DEFAULT '[]'::jsonb, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS workspace_members (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id), user_id TEXT NOT NULL REFERENCES users(id), role TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS competency_questions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id), code TEXT NOT NULL, question TEXT NOT NULL, covered_concepts JSONB NOT NULL, bound_capability TEXT NOT NULL, status TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id), title TEXT NOT NULL, parser_status TEXT NOT NULL, chunk_count INTEGER NOT NULL, anchored_axiom_count INTEGER NOT NULL, sha256_digest TEXT NOT NULL, chunks_json JSONB NOT NULL DEFAULT '[]'::jsonb)`,
  `CREATE TABLE IF NOT EXISTS ontology_revisions (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id), revision_code TEXT NOT NULL, parent_revision_code TEXT, sha256_hash TEXT NOT NULL, classes_json JSONB NOT NULL, properties_json JSONB NOT NULL, diff_items_json JSONB NOT NULL DEFAULT '[]'::jsonb, backward_compatible BOOLEAN NOT NULL DEFAULT TRUE, turtle_source TEXT NOT NULL, tbox_graph_uri TEXT NOT NULL, shacl_graph_uri TEXT NOT NULL, created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS changesets (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id), base_revision_code TEXT NOT NULL, proposals_json JSONB NOT NULL, status TEXT NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS data_sources (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, kind TEXT NOT NULL, access_mode TEXT NOT NULL, status TEXT NOT NULL, connection_display_url TEXT NOT NULL, credential_alias TEXT NOT NULL, summary_text TEXT NOT NULL, last_latency_ms INTEGER NOT NULL DEFAULT 12)`,
  `CREATE TABLE IF NOT EXISTS schema_snapshots (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, data_source_id TEXT NOT NULL REFERENCES data_sources(id), snapshot_json JSONB NOT NULL, is_active_binding BOOLEAN NOT NULL DEFAULT TRUE)`,
  `CREATE TABLE IF NOT EXISTS semantic_mappings (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id), data_source_id TEXT NOT NULL REFERENCES data_sources(id), source_table TEXT NOT NULL, target_class_iri TEXT NOT NULL, target_class_display TEXT NOT NULL, subject_iri_template TEXT NOT NULL, watermark_column TEXT NOT NULL, rules_json JSONB NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS materialization_runs (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id), batch_code TEXT NOT NULL, executed_at TEXT NOT NULL, sync_mode TEXT NOT NULL, bound_revision_id TEXT NOT NULL, written_instances INTEGER NOT NULL, written_triples INTEGER NOT NULL, quarantined_count INTEGER NOT NULL, quarantine_summary TEXT NOT NULL, status TEXT NOT NULL, quarantine_records_json JSONB NOT NULL DEFAULT '[]'::jsonb)`,
  `CREATE TABLE IF NOT EXISTS model_routes (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, name TEXT NOT NULL, provider TEXT NOT NULL, model_id TEXT NOT NULL, status_label TEXT NOT NULL, status_tone TEXT NOT NULL, purpose TEXT NOT NULL, latency_ms INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS capabilities (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id), code TEXT NOT NULL, name TEXT NOT NULL, autonomy_tier TEXT NOT NULL, risk_level TEXT NOT NULL, description TEXT NOT NULL, target_entity_local_name TEXT NOT NULL, compensation_capability_code TEXT, mcp_exposed BOOLEAN NOT NULL DEFAULT FALSE, mcp_uri TEXT, quota_per_minute INTEGER NOT NULL DEFAULT 60)`,
  `CREATE TABLE IF NOT EXISTS semantic_apps (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id), slug TEXT NOT NULL, name TEXT NOT NULL, active_version TEXT NOT NULL, draft_version TEXT NOT NULL, bound_revision_id TEXT NOT NULL, status TEXT NOT NULL, benchmark_pass_rate_bp INTEGER NOT NULL DEFAULT 9820, benchmark_delta TEXT NOT NULL, out_of_scope_refusal_bp INTEGER NOT NULL DEFAULT 10000, out_of_scope_summary TEXT NOT NULL, regression_failures INTEGER NOT NULL DEFAULT 0, total_benchmark_cases INTEGER NOT NULL DEFAULT 58)`,
  `CREATE TABLE IF NOT EXISTS execution_runs (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id), plan_code TEXT NOT NULL, target_object_label TEXT NOT NULL, target_contract_no TEXT, capability_code TEXT NOT NULL, capability_chain TEXT NOT NULL, auth_and_idempotency_summary TEXT NOT NULL, status TEXT NOT NULL, status_label TEXT NOT NULL, requested_by TEXT NOT NULL, requested_by_id TEXT NOT NULL, approved_by TEXT, confirmation_token TEXT, preview_summary TEXT, conversation_json JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS releases (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id), version TEXT NOT NULL, revision_id TEXT NOT NULL, status TEXT NOT NULL, submitted_by TEXT NOT NULL, submitted_by_id TEXT NOT NULL, reviewed_by TEXT, sha256_manifest_hash TEXT NOT NULL, published_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id), category TEXT NOT NULL, category_label TEXT NOT NULL, actor_display TEXT NOT NULL, summary TEXT NOT NULL, actionable_by_role TEXT, occurred_at TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS runtime_kv_state (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), namespace TEXT NOT NULL, state_key TEXT NOT NULL, payload_json JSONB NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `CREATE TABLE IF NOT EXISTS async_jobs (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), workspace_id TEXT NOT NULL REFERENCES workspaces(id), job_type TEXT NOT NULL, status TEXT NOT NULL, progress_pct INTEGER NOT NULL DEFAULT 0, stage_label TEXT NOT NULL, payload_json JSONB NOT NULL DEFAULT '{}'::jsonb, result_json JSONB, error_message TEXT, attempts INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
  `ALTER TABLE async_jobs ADD COLUMN IF NOT EXISTS lease_owner TEXT`,
  `ALTER TABLE async_jobs ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ`,
  `ALTER TABLE async_jobs ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3`,
  `ALTER TABLE async_jobs ADD COLUMN IF NOT EXISTS dead_lettered BOOLEAN NOT NULL DEFAULT FALSE`,
  `CREATE TABLE IF NOT EXISTS audit_hash_chain (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL REFERENCES tenants(id), workspace_id TEXT NOT NULL REFERENCES workspaces(id), seq_no INTEGER NOT NULL, audit_event_id TEXT NOT NULL, prev_hash TEXT NOT NULL, curr_hash TEXT NOT NULL, hash_algo TEXT NOT NULL DEFAULT 'SM3', payload_summary TEXT NOT NULL, actor_display TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
];

export async function runSchemaAndRlsBootstrap(adminSql: postgres.Sql): Promise<void> {
  await adminSql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(828003)`;
    for (const stmt of DDL_STATEMENTS) {
      await tx.unsafe(stmt);
    }
    await tx`GRANT SELECT ON tenants TO lingdong_app`;
    for (const tbl of RLS_TABLES) {
      await tx.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${tbl} TO lingdong_app`);
      await tx.unsafe(`ALTER TABLE ${tbl} ENABLE ROW LEVEL SECURITY`);
      await tx.unsafe(`ALTER TABLE ${tbl} FORCE ROW LEVEL SECURITY`);
      await tx.unsafe(`DROP POLICY IF EXISTS tenant_isolation_policy ON ${tbl}`);
      await tx.unsafe(`
        CREATE POLICY tenant_isolation_policy ON ${tbl}
        USING (tenant_id = current_setting('app.current_tenant_id', true))
        WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true))
      `);
    }
  });
}
