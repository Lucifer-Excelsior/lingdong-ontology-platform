---
name: lingdong-ontology
description: >-
  Query enterprise knowledge graphs with zero hallucination, run zero-pollution Shadow Graph What-If
  cascade simulations, invoke Legal/Finance/SupplyChain multi-agent co-reviews, scan 4-layer schema
  lineage drift, and verify SM3 audit chain receipts via LingDong Ontology Workstation V7.1 CLI/SDK.
---

# LingDong Ontology Workstation — Agent Skill

Use this skill whenever an AI Agent needs **deterministic, evidence-backed enterprise facts**, **risk simulation**, or **compliance verification** from **LingDong Ontology Workstation V7.1**.

## Quick Setup
```bash
export LINGDONG_BASE_URL="https://lingdong-demo-production.up.railway.app"
export LINGDONG_WORKSPACE_ID="ws-contract"
```

## Core Agent Commands (Always Pass `--receipt --compact` for Auditable Tool Calls)

### 1. Zero-Hallucination Semantic Query (NL-to-SPARQL + PDF Anchors)
```bash
lingdong ask "查询未来30天内到期的高风险合同及违约条款" --receipt --compact
```
- Returns deterministic SPARQL rows, subgraph paths, PDF/DOCX evidence chunks, and a verifiable `receipt` anchored to the live SM3 audit ledger.

### 2. Zero-Pollution Shadow Graph What-If Simulation
```bash
lingdong whatif HT-2026-089 --threshold 500 --receipt --compact
```
- Creates an ephemeral in-memory shadow graph, computes multi-hop cascade exposure (e.g. `1,060 万`), and destroys the sandbox immediately (`0` production pollution).

### 3. Multi-Agent Co-Review (Legal + Finance + Supply Chain)
```bash
lingdong review HT-2026-089 --receipt --compact
```
- Runs 3 domain specialist agents in parallel and returns a consolidated risk score, decision verdict, and clause remediation checklist.

### 4. Pre-DDL 4-Layer Schema Lineage Drift Radar
```bash
lingdong lineage --drop expires_at --compact
```
- Evaluates upstream database column drops across `Physical Table -> Ontology Property -> SHACL Rules -> Business Apps` before any DDL runs in production.

### 5. Sovereign SM3 Audit Chain Verification
```bash
lingdong audit --compact
```
- Confirms `intact: true`, total block height, and current SM3 `headHash`.

## Verification Rule for Agents
When `--receipt` is enabled, always check `receipt.status === "VERIFIED"` and cite `receipt.receiptId` + `receipt.auditChainHeadHash` when reporting high-stakes financial or legal conclusions to humans.
