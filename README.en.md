<div align="center">

# LingDong Ontology Workstation V7.1

[中文](./README.md) | **English**

**Enterprise Semantic Decision Operating System (OWL / SHACL / SPARQL 1.1 · Shadow Graph What-If · Multi-Agent Co-Review · SM3 Sovereign Security)**

[![Live Demo](https://img.shields.io/badge/Live_Demo-Online_Now-10b981?style=for-the-badge)](https://lingdong-demo-production.up.railway.app)
[![Version](https://img.shields.io/badge/version-v7.1.0_AI--Native-4f46e5?style=for-the-badge)](https://github.com/Lucifer-Excelsior/lingdong-ontology-platform/releases/tag/v7.0.0)
[![Tests](https://img.shields.io/badge/tests-62%2F62_passing-10b981?style=for-the-badge)](./.github/workflows/ci.yml)
[![Peak QPS](https://img.shields.io/badge/peak_QPS-451.2_QPS-0284c7?style=for-the-badge)](#benchmarks)

[🚀 Try Live Public Demo](https://lingdong-demo-production.up.railway.app) &nbsp;|&nbsp; [🎬 Watch 60s 1080P Launch Film](https://github.com/Lucifer-Excelsior/lingdong-ontology-platform/releases/tag/v7.0.0) &nbsp;|&nbsp; [📖 Live OpenAPI Docs](https://lingdong-demo-production.up.railway.app/api/docs)

</div>

---

## Why LingDong V7.1?

LingDong bridges the gap between **W3C Semantic Web rigor** (`Oxigraph RDF 1.1 / OWL / SPARQL 1.1 / SHACL`) and **executive business decision loops**:

- **Zero-Hallucination NL-to-SPARQL (`2.93 ms`)**: Compiles natural language into deterministic SPARQL, returns subgraph paths, and anchors every claim to exact PDF/DOCX clause coordinates.
- **Zero-Pollution Shadow Graph What-If**: Spins up ephemeral in-memory shadow graphs to compute multi-hop supply-chain cascade exposure (`1,060 万`) with zero writes to production data.
- **Multi-Agent Co-Review**: Runs Legal, Finance, and Supply-Chain specialist agents in parallel to deliver composite risk verdicts and remediation checklists in seconds.
- **ECA Automation & Embeddable SDK**: Event-Condition-Action automation rules plus native `<lingdong-widget>` / `<iframe>` embedding for enterprise OA/ERP.
- **MDM Golden Records & 4-Layer Lineage Radar**: Cross-system entity resolution with one-click split rollback + upstream DDL column-drop impact detection (`Table -> Ontology -> SHACL -> Apps`).
- **Sovereign Security & AI-Native SDK**: Git-style Branch & 2-stage PR approvals, ABAC 3-tier dynamic redaction, SM3 tamper-evident audit hash chain, KMS rotation, plus **`@lingdong/sdk` + `lingdong` CLI + Agent Skill** with cryptographically verifiable SM3 receipts.

## 30-Second CLI & SDK Demo (Runs Against Live Demo)

```bash
pnpm install && pnpm --filter @lingdong/sdk build

# Run 3 end-to-end business examples directly against the live Railway Demo:
node examples/01-contract-risk-evidence.mjs
node examples/02-supply-chain-whatif-sandbox.mjs
node examples/03-lineage-drift-and-sm3-audit.mjs

# Or use the CLI directly with verifiable SM3 receipts:
node packages/sdk/dist/cli.js whatif HT-2026-089 --threshold 500 --receipt
```

- **Agent Skill (Claude Code / Cursor / Antigravity / OpenClaw)**: [`packages/sdk/skills/lingdong-ontology/SKILL.md`](./packages/sdk/skills/lingdong-ontology/SKILL.md)

## Production Benchmarks {#benchmarks}

- **451.2 QPS** peak mixed throughput (`11,127` requests, **`0.00%` error rate**)
- **88.8 ms** core API P95 latency (`2.93 ms` NL-to-SPARQL)
- **20 / 20** active-active chaos failover (`kill -9` zero-downtime switchover)
- **62 / 62** automated tests passing (Semantic Core + SDK + API)

## License

Apache-2.0 — see [LICENSE](./LICENSE).
