#!/usr/bin/env node
/**
 * yellow-pro — CLI over the same API surface as the MCP server.
 * Prints raw exchange JSON to stdout; exits non-zero on error.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { parseArgs } from "node:util";
import { api, MarketType, OrderInput } from "./api.js";
import { clientFromEnv, YellowProError } from "./client.js";
import { VERSION } from "./version.js";

const USAGE = `yellow-pro ${VERSION} — yellow_pro exchange CLI

Market data (no credentials needed):
  yellow-pro health
  yellow-pro markets [spot|perp|all]
  yellow-pro ticker <market>
  yellow-pro orderbook <market> [--limit N]
  yellow-pro klines <market> [--interval 1m] [--start MS] [--limit N]
  yellow-pro funding [market]
  yellow-pro funding-history [market] [--page N] [--page-size N]

Account (needs YELLOW_PRO_API_KEY / _API_SECRET / _APP_SESSION_ID):
  yellow-pro balance <spot|perp>
  yellow-pro open-orders <spot|perp> [--market M] [--page N] [--page-size N]
  yellow-pro orders <spot|perp> --market M [--page N] [--page-size N]
  yellow-pro trades <spot|perp> [--market M] [--page N] [--page-size N] [--start MS] [--end MS]
  yellow-pro positions
  yellow-pro position-history [--market M] [--page N] [--page-size N]
  yellow-pro position-mode
  yellow-pro fee-schedule
  yellow-pro funding-payments [--scope account|position] [--position-id UUID] [--page N] [--page-size N]

Trading (needs YELLOW_PRO_ENABLE_TRADING=true):
  yellow-pro place <spot|perp> <market> <buy|sell> <limit|market|post_only|trigger_limit|trigger_market> <amount> [price]
      [--trigger-price P] [--trigger-type stop_loss|take_profit]
      [--tif gtc|ioc|fok] [--reduce-only] [--leverage L] [--direction long|short|both]
  yellow-pro cancel <spot|perp> <market> <order_uuid>
      [--order-type limit|market|post_only|trigger_limit|trigger_market|stop_limit|stop_market|stop_loss|take_limit|take_market|take_profit]
  yellow-pro cancel-many <spot|perp> <market> <order_uuid> [order_uuid ...]
  yellow-pro set-leverage <market> <leverage>
  yellow-pro set-position-mode <market> <hedge|one_way>
  yellow-pro transfer <asset> <amount> <spot|perps> <spot|perps>

Setup (registers the MCP server using the current YELLOW_PRO_* env):
  yellow-pro setup claude-code    via \`claude mcp add\` (user scope)
  yellow-pro setup codex          via \`codex mcp add\` (falls back to config.toml snippet)
  yellow-pro setup openclaw       writes ~/.openclaw/openclaw.json mcpServers entry
  yellow-pro setup hermes         via \`hermes mcp add\` (falls back to config.yaml snippet)
  yellow-pro setup json           print generic MCP client JSON snippet

Env: YELLOW_PRO_BASE_URL (explicit URL override), YELLOW_PRO_SANDBOX (true -> staging URL), YELLOW_PRO_API_KEY,
     YELLOW_PRO_API_SECRET, YELLOW_PRO_APP_SESSION_ID, YELLOW_PRO_ENABLE_TRADING,
     YELLOW_PRO_MODULES, YELLOW_PRO_RATE_LIMIT_MS`;

const ENV_KEYS = [
  "YELLOW_PRO_BASE_URL",
  "YELLOW_PRO_SANDBOX",
  "YELLOW_PRO_API_KEY",
  "YELLOW_PRO_API_SECRET",
  "YELLOW_PRO_APP_SESSION_ID",
  "YELLOW_PRO_ENABLE_TRADING",
  "YELLOW_PRO_MODULES",
  "YELLOW_PRO_RATE_LIMIT_MS",
];

function tradingEnabled(): void {
  if ((process.env.YELLOW_PRO_ENABLE_TRADING ?? "").toLowerCase() !== "true") {
    throw new YellowProError("trading is disabled; set YELLOW_PRO_ENABLE_TRADING=true to allow order commands");
  }
}

function asMarketType(value: string | undefined): MarketType {
  if (value !== "spot" && value !== "perp") {
    throw new YellowProError("expected market type 'spot' or 'perp'");
  }
  return value;
}

function req(value: string | undefined, name: string): string {
  if (value === undefined || value === "") {
    throw new YellowProError(`missing required argument <${name}> — run yellow-pro --help`);
  }
  return value;
}

function oneOf<T extends string>(value: string | undefined, name: string, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) {
    throw new YellowProError(`<${name}> must be one of: ${allowed.join(", ")}`);
  }
  return value as T;
}

function num(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new YellowProError(`expected a number, got '${value}'`);
  }
  return parsed;
}

function runSetupCommand(bin: string, args: string[], input?: string): void {
  const stdio: ("pipe" | "inherit")[] = input === undefined ? ["inherit", "inherit", "inherit"] : ["pipe", "inherit", "inherit"];
  const result = spawnSync(bin, args, { stdio, input });
  if (result.error || result.status !== 0) {
    throw new YellowProError(`\`${bin} ${args.slice(0, 2).join(" ")}\` failed — is the ${bin} CLI installed?`);
  }
}

function setup(target: string | undefined): string {
  const command = "yellow-pro-mcp";
  const envPresent = ENV_KEYS.filter((key) => process.env[key]);
  const env = Object.fromEntries(envPresent.map((key) => [key, process.env[key] as string]));
  switch (target) {
    case "claude":
    case "claude-code": {
      const envFlags = envPresent.flatMap((key) => ["-e", `${key}=${process.env[key]}`]);
      runSetupCommand("claude", ["mcp", "add", "yellow_pro", "-s", "user", ...envFlags, "--", command]);
      return "yellow_pro MCP server registered with Claude Code (user scope)";
    }
    case "codex": {
      const envFlags = envPresent.flatMap((key) => ["--env", `${key}=${process.env[key]}`]);
      try {
        runSetupCommand("codex", ["mcp", "add", "yellow_pro", ...envFlags, "--", command]);
        return "yellow_pro MCP server registered with Codex CLI";
      } catch {
        const envToml = envPresent.map((key) => `${key} = "${process.env[key]}"`).join(", ");
        return `# \`codex mcp add\` unavailable — add to ~/.codex/config.toml:\n[mcp_servers.yellow_pro]\ncommand = "${command}"\nenv = { ${envToml} }`;
      }
    }
    case "openclaw": {
      const file = join(homedir(), ".openclaw", "openclaw.json");
      let config: Record<string, unknown> = {};
      if (existsSync(file)) {
        config = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
      }
      const servers = (config.mcpServers ?? {}) as Record<string, unknown>;
      config.mcpServers = { ...servers, yellow_pro: { command, env } };
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
      return `yellow_pro MCP server written to ${file} — restart the OpenClaw gateway to pick it up`;
    }
    case "hermes": {
      try {
        // hermes prompts "Save config anyway?" when it cannot connect yet — answer yes
        runSetupCommand("hermes", ["mcp", "add", "yellow_pro", "--command", command], "y\n");
        return "yellow_pro MCP server registered with Hermes (ensure YELLOW_PRO_* env vars are set in the shell running hermes)";
      } catch {
        const envYaml = envPresent.map((key) => `      ${key}: "${process.env[key]}"`).join("\n");
        return `# hermes CLI unavailable — add to your Hermes config.yaml:\nmcp_servers:\n  yellow_pro:\n    command: ${command}\n    env:\n${envYaml}`;
      }
    }
    case "json":
      return JSON.stringify({ mcpServers: { yellow_pro: { command, env } } }, null, 2);
    default:
      throw new YellowProError("setup target must be one of: claude-code, codex, openclaw, hermes, json");
  }
}

async function run(): Promise<unknown> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      limit: { type: "string" },
      interval: { type: "string" },
      start: { type: "string" },
      end: { type: "string" },
      page: { type: "string" },
      "page-size": { type: "string" },
      market: { type: "string" },
      "position-id": { type: "string" },
      scope: { type: "string" },
      tif: { type: "string" },
      "reduce-only": { type: "boolean" },
      leverage: { type: "string" },
      direction: { type: "string" },
      "order-type": { type: "string" },
      "trigger-price": { type: "string" },
      "trigger-type": { type: "string" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  const [command, ...args] = positionals;
  if (values.version) {
    return VERSION;
  }
  if (values.help || command === undefined || command === "help") {
    return USAGE;
  }
  const client = clientFromEnv();
  const pageQuery = { page: num(values.page), page_size: num(values["page-size"]) };
  switch (command) {
    case "health":
      return api.health(client);
    case "markets":
      return api.markets(client, args[0] === undefined ? "all" : oneOf(args[0], "market-type", ["spot", "perp", "all"] as const));
    case "ticker":
      return api.ticker(client, req(args[0], "market"));
    case "orderbook":
      return api.orderbook(client, req(args[0], "market"), num(values.limit));
    case "klines":
      return api.klines(client, req(args[0], "market"), values.interval ?? "1m", num(values.start), num(values.limit));
    case "funding":
      return api.fundingRate(client, args[0]);
    case "funding-history":
      return api.fundingRateHistory(client, args[0], pageQuery);
    case "balance":
      return api.balance(client, asMarketType(args[0]));
    case "open-orders":
      return api.openOrders(client, asMarketType(args[0]), values.market, pageQuery);
    case "orders":
      if (!values.market) {
        throw new YellowProError("orders requires --market");
      }
      return api.orderHistory(client, asMarketType(args[0]), values.market, pageQuery);
    case "trades":
      return api.myTrades(client, asMarketType(args[0]), values.market, {
        ...pageQuery,
        start_time: num(values.start),
        end_time: num(values.end),
      });
    case "positions":
      return api.positions(client);
    case "position-history":
      return api.positionHistory(client, values.market, pageQuery);
    case "position-mode":
      return api.positionMode(client);
    case "fee-schedule":
      return api.feeSchedule(client);
    case "funding-payments":
      return api.fundingPayments(
        client,
        values.scope === undefined ? "account" : oneOf(values.scope, "scope", ["account", "position"] as const),
        values["position-id"],
        pageQuery,
      );
    case "place": {
      tradingEnabled();
      const order: OrderInput = {
        market: req(args[1], "market"),
        side: oneOf(args[2], "side", ["buy", "sell"]),
        order_type: oneOf(args[3], "order-type", [
          "limit", "market", "post_only", "trigger_limit", "trigger_market",
        ] as const),
        amount: req(args[4], "amount"),
        price: args[5],
        trigger_price: values["trigger-price"],
        trigger_type: values["trigger-type"] === undefined
          ? undefined
          : oneOf(values["trigger-type"], "trigger-type", ["stop_loss", "take_profit"] as const),
        time_in_force: values.tif,
        reduce_only: values["reduce-only"],
        leverage: values.leverage,
        direction: values.direction === undefined
          ? undefined
          : oneOf(values.direction, "direction", ["long", "short", "both"] as const),
      };
      return api.placeOrder(client, asMarketType(args[0]), order);
    }
    case "cancel":
      tradingEnabled();
      return api.cancelOrder(
        client,
        asMarketType(args[0]),
        req(args[1], "market"),
        req(args[2], "order_uuid"),
        values["order-type"] === undefined
          ? "limit"
          : oneOf(values["order-type"], "order-type", [
            "limit", "market", "post_only", "trigger_limit", "trigger_market",
            "stop_limit", "stop_market", "stop_loss", "take_limit", "take_market", "take_profit",
          ] as const),
      );
    case "cancel-many":
      tradingEnabled();
      return api.cancelOrders(client, asMarketType(args[0]), req(args[1], "market"), args.slice(2));
    case "set-leverage":
      tradingEnabled();
      return api.setLeverage(client, req(args[0], "market"), req(args[1], "leverage"));
    case "set-position-mode":
      tradingEnabled();
      return api.setPositionMode(
        client,
        req(args[0], "market"),
        oneOf(args[1], "mode", ["hedge", "one_way"]) === "hedge",
      );
    case "transfer":
      tradingEnabled();
      return api.transfer(
        client,
        req(args[0], "asset"),
        req(args[1], "amount"),
        oneOf(args[2], "from", ["spot", "perps"] as const),
        oneOf(args[3], "to", ["spot", "perps"] as const),
      );
    case "setup":
      return setup(args[0]);
    default:
      throw new YellowProError(`unknown command '${command}' — run yellow-pro --help`);
  }
}

run()
  .then((result) => {
    console.log(typeof result === "string" ? result : JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error instanceof YellowProError ? `error: ${error.message}` : error);
    process.exit(1);
  });
