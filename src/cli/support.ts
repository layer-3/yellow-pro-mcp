import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { MarketType } from "../api.js";
import { YellowProError } from "../client.js";
import { VERSION } from "../version.js";

export const USAGE = `yellow-pro ${VERSION} — yellow_pro exchange CLI

Market data:
  yellow-pro health
  yellow-pro markets [spot|perp|all]
  yellow-pro ticker <market>
  yellow-pro orderbook <market>
  yellow-pro klines <market> [--interval 1m] [--start MS] [--end MS] [--limit N]
  yellow-pro funding <market>
  yellow-pro funding-history [market] [--cursor TOKEN] [--page-size N]
  yellow-pro networks
  yellow-pro transfer-assets

Account:
  yellow-pro balance <spot|perp> [--asset A] [--asset-like TEXT]
  yellow-pro spot-accounts
  yellow-pro spot-account [--asset A] [--asset-like TEXT]
  yellow-pro open-orders <spot|perp> [--market M] [--asset A] [--market-like TEXT] [--cursor TOKEN]
  yellow-pro orders <spot|perp> [--market M] [--market-like TEXT] [--cursor TOKEN]
  yellow-pro trades <spot|perp> [--market M] [--market-like TEXT] [--start RFC3339] [--end RFC3339]
  yellow-pro positions
  yellow-pro position-history [--market M] [--opened-from TIME] [--opened-to TIME]
      [--closed-from TIME] [--closed-to TIME] [--sort-by opened_at|closed_at] [--sort-dir asc|desc]
  yellow-pro position-history-detail <position_id> [--cursor TOKEN] [--page-size N]
  yellow-pro perpetual-accounts
  yellow-pro fee-schedule
  yellow-pro fee-tier
  yellow-pro market-fee-rate <spot|perp> <market>
  yellow-pro transactions [--type TYPE] [--market M] [--asset A] [--start UNIX] [--end UNIX]
  yellow-pro funding-payments [--scope account|position] [--position-id UUID] [--interval-start TIME]

Trading:
  yellow-pro place <spot|perp> <market> <buy|sell> <limit|market|post_only|trigger_limit|trigger_market> <amount> [price]
      [--trigger-price P] [--trigger-type stop_loss|take_profit] [--client-order-id ID]
      [--tif gtc|ioc|fok] [--reduce-only] [--leverage L] [--direction long|short|both]
  yellow-pro cancel <spot|perp> <market> <order_uuid> [--order-type TYPE]
  yellow-pro cancel-all <spot|perp> [--market M]
  yellow-pro close-positions [--market M]
  yellow-pro set-leverage <market> <leverage>
  yellow-pro transfer <asset> <amount> <spot|perps> <spot|perps>

Setup:
  yellow-pro connect <pairing-code> [--client claude-code] [--environment production|staging|uat] [--replace]
  yellow-pro status
  yellow-pro disconnect
  yellow-pro setup claude-code|codex|openclaw|hermes|json

Env: YELLOW_PRO_BASE_URL, YELLOW_PRO_SANDBOX, YELLOW_PRO_API_KEY, YELLOW_PRO_API_SECRET,
     YELLOW_PRO_APP_SESSION_ID, YELLOW_PRO_ENABLE_TRADING, YELLOW_PRO_MODULES,
     YELLOW_PRO_RATE_LIMIT_MS`;

const ENV_KEYS = [
  "YELLOW_PRO_BASE_URL",
  "YELLOW_PRO_SANDBOX",
  "YELLOW_PRO_API_KEY",
  "YELLOW_PRO_API_SECRET",
  "YELLOW_PRO_APP_SESSION_ID",
  "YELLOW_PRO_ENABLE_TRADING",
  "YELLOW_PRO_MODULES",
  "YELLOW_PRO_RATE_LIMIT_MS",
  "YELLOW_PRO_CONFIG_PATH",
];

export function tradingEnabled(): void {
  if ((process.env.YELLOW_PRO_ENABLE_TRADING ?? "").toLowerCase() !== "true") {
    throw new YellowProError("trading is disabled; set YELLOW_PRO_ENABLE_TRADING=true");
  }
}

export function asMarketType(value: string | undefined): MarketType {
  if (value !== "spot" && value !== "perp") {
    throw new YellowProError("expected market type 'spot' or 'perp'");
  }
  return value;
}

export function req(value: string | undefined, name: string): string {
  if (value === undefined || value === "") {
    throw new YellowProError(`missing required argument <${name}> — run yellow-pro --help`);
  }
  return value;
}

export function oneOf<T extends string>(value: string | undefined, name: string, allowed: readonly T[]): T {
  const matched = allowed.find((candidate) => candidate === value);
  if (matched === undefined) {
    throw new YellowProError(`<${name}> must be one of: ${allowed.join(", ")}`);
  }
  return matched;
}

export function num(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new YellowProError(`expected a number, got '${value}'`);
  }
  return parsed;
}

export type SetupRunner = (bin: string, args: string[], input?: string) => void;

function runSetupCommand(bin: string, args: string[], input?: string): void {
  const stdio: ("pipe" | "inherit")[] = input === undefined
    ? ["inherit", "inherit", "inherit"]
    : ["pipe", "inherit", "inherit"];
  const result = spawnSync(bin, args, { stdio, input });
  if (result.error || result.status !== 0) {
    throw new YellowProError(`\`${bin} ${args.slice(0, 2).join(" ")}\` failed`);
  }
}

export interface SetupOptions {
  env?: NodeJS.ProcessEnv;
  includeEnvironment?: boolean;
  additionalEnvironment?: Record<string, string>;
  runner?: SetupRunner;
}

export function setup(target: string | undefined, options: SetupOptions = {}): string {
  const command = "yellow-pro-mcp";
  const sourceEnv = options.env ?? process.env;
  const includeEnvironment = options.includeEnvironment ?? true;
  const runner = options.runner ?? runSetupCommand;
  const envPresent = includeEnvironment ? ENV_KEYS.filter((key) => sourceEnv[key]) : [];
  const env: Record<string, string> = { ...(options.additionalEnvironment ?? {}) };
  for (const key of envPresent) {
    const value = sourceEnv[key];
    if (value !== undefined) {
      env[key] = value;
    }
  }
  switch (target) {
    case "claude":
    case "claude-code": {
      const flags = Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`]);
      runner("claude", ["mcp", "add", "yellow_pro", "-s", "user", ...flags, "--", command]);
      return "yellow_pro MCP server registered with Claude Code";
    }
    case "codex": {
      const flags = Object.entries(env).flatMap(([key, value]) => ["--env", `${key}=${value}`]);
      try {
        runner("codex", ["mcp", "add", "yellow_pro", ...flags, "--", command]);
        return "yellow_pro MCP server registered with Codex CLI";
      } catch {
        const envToml = envPresent.map((key) => `${key} = "${sourceEnv[key]}"`).join(", ");
        return `[mcp_servers.yellow_pro]\ncommand = "${command}"\nenv = { ${envToml} }`;
      }
    }
    case "openclaw": {
      const file = join(homedir(), ".openclaw", "openclaw.json");
      const config: Record<string, unknown> = existsSync(file)
        ? JSON.parse(readFileSync(file, "utf8"))
        : {};
      const servers = config.mcpServers && typeof config.mcpServers === "object"
        ? config.mcpServers
        : {};
      config.mcpServers = { ...servers, yellow_pro: { command, env } };
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
      return `yellow_pro MCP server written to ${file}`;
    }
    case "hermes":
      try {
        runner("hermes", ["mcp", "add", "yellow_pro", "--command", command], "y\n");
        return "yellow_pro MCP server registered with Hermes";
      } catch {
        const envYaml = envPresent.map((key) => `      ${key}: "${sourceEnv[key]}"`).join("\n");
        return `mcp_servers:\n  yellow_pro:\n    command: ${command}\n    env:\n${envYaml}`;
      }
    case "json":
      return JSON.stringify({ mcpServers: { yellow_pro: { command, env } } }, null, 2);
    default:
      throw new YellowProError("setup target must be claude-code, codex, openclaw, hermes, or json");
  }
}
