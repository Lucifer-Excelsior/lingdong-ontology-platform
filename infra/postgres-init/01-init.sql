-- Create isolated sandbox ERP business database alongside ontology_v3 metadata DB
CREATE DATABASE sandbox_erp OWNER lingdong;

-- Create non-superuser runtime role so PostgreSQL Row-Level Security (RLS) is strictly enforced
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'lingdong_app') THEN
    CREATE ROLE lingdong_app LOGIN PASSWORD 'lingdong_app_password';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE ontology_v3 TO lingdong_app;
GRANT USAGE, CREATE ON SCHEMA public TO lingdong_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO lingdong_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO lingdong_app;
