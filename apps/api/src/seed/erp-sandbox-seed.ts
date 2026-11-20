import { sandboxErpSql } from "../db/client.js";

export async function seedSandboxErpDatabase(): Promise<void> {
  await sandboxErpSql`
    CREATE TABLE IF NOT EXISTS public.customers (
      customer_id VARCHAR(64) PRIMARY KEY,
      customer_name VARCHAR(160) NOT NULL,
      industry VARCHAR(80) NOT NULL,
      credit_tier VARCHAR(16) NOT NULL
    );
  `;
  await sandboxErpSql`
    CREATE TABLE IF NOT EXISTS public.account_owners (
      owner_id VARCHAR(64) PRIMARY KEY,
      owner_name VARCHAR(80) NOT NULL,
      department VARCHAR(80) NOT NULL
    );
  `;
  await sandboxErpSql`
    CREATE TABLE IF NOT EXISTS public.contracts (
      contract_no VARCHAR(64) PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      customer_id VARCHAR(64) NOT NULL,
      owner_id VARCHAR(64) NOT NULL,
      signed_at DATE NOT NULL,
      expires_at DATE NOT NULL,
      total_amount NUMERIC(18,2) NOT NULL,
      status VARCHAR(32) NOT NULL,
      risk_note TEXT NOT NULL
    );
  `;
  await sandboxErpSql`
    CREATE TABLE IF NOT EXISTS public.renewal_cases (
      case_id VARCHAR(64) PRIMARY KEY,
      contract_no VARCHAR(64) NOT NULL,
      case_status VARCHAR(32) NOT NULL,
      owner_id VARCHAR(64) NOT NULL
    );
  `;
  await sandboxErpSql`
    CREATE TABLE IF NOT EXISTS public.follow_up_tasks (
      task_id VARCHAR(64) PRIMARY KEY,
      contract_no VARCHAR(64) NOT NULL,
      assignee_name VARCHAR(80) NOT NULL,
      summary TEXT NOT NULL,
      status VARCHAR(32) NOT NULL
    );
  `;

  await sandboxErpSql`
    INSERT INTO public.customers (customer_id, customer_name, industry, credit_tier) VALUES
      ('CUST-01', '华东智算中心科技有限公司', '算力基础设施', 'AAA'),
      ('CUST-02', '国网数智云联通信集团', '能源通信', 'AAA'),
      ('CUST-03', '长三角工业互联网研究院', '智能制造', 'AA+'),
      ('CUST-04', '中移物联政企事业部', '电信运营商', 'AAA')
    ON CONFLICT (customer_id) DO NOTHING;
  `;

  await sandboxErpSql`
    INSERT INTO public.account_owners (owner_id, owner_name, department) VALUES
      ('OWN-01', '周明', '政企大客户一部'),
      ('OWN-02', '陈楠', '运营商战略客户部'),
      ('OWN-03', '赵恒', '华东区域交付部')
    ON CONFLICT (owner_id) DO NOTHING;
  `;

  await sandboxErpSql`
    INSERT INTO public.contracts (contract_no, title, customer_id, owner_id, signed_at, expires_at, total_amount, status, risk_note) VALUES
      ('HT-2026-089', '华东智算中心年度维保合同', 'CUST-01', 'OWN-01', '2025-12-01', '2026-11-30', 2850000.00, 'ACTIVE', '关键风险：含第 4.2 条自动顺延排他条款，建议本周内发出续签确认函。'),
      ('HT-2026-104', '核心网络设备年度框架协议', 'CUST-02', 'OWN-02', '2025-12-12', '2026-12-12', 6400000.00, 'ACTIVE', '高金额战略合同（640 万），状态变更受独立审批门禁保护。'),
      ('HT-2026-118', '工业标识解析节点运维协议', 'CUST-03', 'OWN-03', '2026-01-15', '2027-01-14', 1350000.00, 'ACTIVE', '履约指标正常，尚未进入 30 天预警窗口。'),
      ('HT-2026-126', '5G 专网切片SLA保障补充协议', 'CUST-04', 'OWN-02', '2026-02-01', '2027-02-01', 3200000.00, 'ACTIVE', '已完成季度巡检归档。'),
      ('HT-2026-BAD1', '异常测试记录：到期早于签署A', 'CUST-01', 'OWN-01', '2026-09-01', '2026-03-01', 500000.00, 'DRAFT', '源库录入倒挂脏数据，用于验证 SHACL 隔离区拦截'),
      ('HT-2026-BAD2', '异常测试记录：到期早于签署B', 'CUST-03', 'OWN-03', '2026-10-15', '2026-04-10', 420000.00, 'DRAFT', '源库录入倒挂脏数据，用于验证 SHACL 隔离区拦截')
    ON CONFLICT (contract_no) DO NOTHING;
  `;

  await sandboxErpSql`
    INSERT INTO public.renewal_cases (case_id, contract_no, case_status, owner_id) VALUES
      ('CASE-2026-01', 'HT-2026-089', 'IN_WINDOW', 'OWN-01'),
      ('CASE-2026-02', 'HT-2026-104', 'AWAITING_APPROVAL', 'OWN-02')
    ON CONFLICT (case_id) DO NOTHING;
  `;
}
