#!/usr/bin/env node
import { LingDongClient } from "./client.js";

export interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

export function parseCliArgs(argv: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  const [command = "help", ...rest] = positional;
  return { command, positional: rest, flags };
}

function printOutput(value: unknown, compact: boolean): void {
  console.log(compact ? JSON.stringify(value) : JSON.stringify(value, null, 2));
}

const HELP_TEXT = `lingdong — LingDong Ontology Workstation V7.1 CLI (with Verifiable SM3 Receipts)

Usage:
  lingdong <command> [args] [options]

Commands:
  health                           Check semantic engine & API health
  workspaces                       List available ontology workspaces
  ask "<question>"                 NL-to-SPARQL zero-hallucination query + PDF evidence
  whatif <entityCode>              Run zero-pollution Shadow Graph What-If simulation
  review <contractNo>              Run 3-Agent (Legal/Finance/SupplyChain) co-review
  lineage                          Run 4-layer Schema lineage drift radar
  audit                            Verify SM3 forward-hash audit chain integrity
  templates                        List installed/available industry ontology packs
  metrics                          Fetch unified semantic KPI metrics

Global Options:
  --base-url <url>                 API endpoint (default: LINGDONG_BASE_URL or live Railway demo)
  --workspace <id>                 Workspace ID (default: ws-contract)
  --token <bearer>                 Optional Bearer token
  --receipt                        Attach cryptographically verifiable SM3 execution receipt
  --threshold <wan>                Risk threshold in 万元 for whatif (default: 500)
  --drop <col1,col2>               Simulated dropped columns for lineage drift scan
  --compact                        Single-line JSON output (ideal for AI Agents / jq)`;

async function main() {
  const { command, positional, flags } = parseCliArgs(process.argv.slice(2));
  if (command === "help" || flags.help || flags.h) {
    console.log(HELP_TEXT);
    return;
  }

  const client = new LingDongClient({
    baseUrl: typeof flags["base-url"] === "string" ? flags["base-url"] : undefined,
    workspaceId: typeof flags.workspace === "string" ? flags.workspace : undefined,
    token: typeof flags.token === "string" ? flags.token : undefined,
  });

  const receipt = Boolean(flags.receipt);
  const compact = Boolean(flags.compact);

  switch (command) {
    case "health":
      printOutput(await client.health(), compact);
      break;
    case "workspaces":
      printOutput(await client.listWorkspaces(), compact);
      break;
    case "ask": {
      const q = positional.join(" ").trim();
      if (!q) throw new Error('Missing question. Example: lingdong ask "30天内到期的高风险合同" --receipt');
      printOutput(await client.ask(q, { receipt }), compact);
      break;
    }
    case "whatif": {
      const entity = positional[0] ?? "HT-2026-089";
      const threshold = typeof flags.threshold === "string" ? Number(flags.threshold) : 500;
      printOutput(await client.simulateWhatIf(entity, { riskThresholdWan: threshold, receipt }), compact);
      break;
    }
    case "review": {
      const contract = positional[0] ?? "HT-2026-089";
      printOutput(await client.coReview(contract, { receipt }), compact);
      break;
    }
    case "lineage": {
      const dropped =
        typeof flags.drop === "string"
          ? flags.drop.split(",").map((s) => s.trim()).filter(Boolean)
          : ["expires_at"];
      printOutput(await client.detectLineageDrift({ droppedColumns: dropped, receipt }), compact);
      break;
    }
    case "audit":
      printOutput(await client.verifyAuditChain(), compact);
      break;
    case "templates":
      printOutput(await client.listTemplates(), compact);
      break;
    case "metrics":
      printOutput(await client.getMetrics(), compact);
      break;
    default:
      throw new Error(`Unknown command "${command}". Run "lingdong --help" for usage.`);
  }
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith("/cli.js") || process.argv[1].endsWith("/cli.ts"));

if (isDirectRun) {
  main().catch((err) => {
    console.error(`[lingdong-cli] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  });
}
