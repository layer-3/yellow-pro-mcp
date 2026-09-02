# yellow-pro-mcp

[English](README.md) | 简体中文

将 **yellow_pro** 交易所暴露给 AI Agent 的 MCP Server + CLI，支持 Claude Code、
Codex CLI、Gemini CLI、Cursor、Hermes、OpenClaw 或任何 MCP 客户端。提供行情数据、账户状态查询，
以及在显式开启后可进行交易。

遵循官方 OKX / Bybit / Alpaca 交易所 MCP Server 的相同约定：本地 stdio 进程、
凭证仅保存在本机（通过环境变量或 MCP 客户端本地配置，绝不外传）、
**默认只读**、模块过滤、内置限流，同时提供 CLI 和面向非 MCP Agent 的 Skill 文件。

配对注册到客户端时会默认写入 `YELLOW_PRO_ENABLE_TRADING=true`，因此 MCP
交易工具会显示出来。实际交易权限仍由服务端凭证 scope 控制；只读配对凭证调用交易接口会返回
`insufficient_scope`。

## 一句话安装（适合人和 Agent）

从 GitHub 安装并注册到 Claude Code：

```bash
curl -fsSL -H 'Accept: application/vnd.github.raw+json' \
  'https://api.github.com/repos/layer-3/yellow-pro-mcp/contents/install.sh?ref=main' | bash && \
  YELLOW_PRO_API_KEY=... YELLOW_PRO_API_SECRET=... YELLOW_PRO_APP_SESSION_ID=... \
  yellow-pro setup claude-code
```

安装程序会检查 Node.js >= 18，在临时目录中构建，将打包好的 tarball 全局安装，
然后清理临时文件。如果系统 npm prefix 不可写，会安装到 `~/.local`。
如果环境不允许 `curl | bash`，可以先查看 `install.sh` 内容再执行。

安装后可将 MCP Server 注册到任意客户端，例如 Claude Code：

```bash
claude mcp add yellow_pro -s user \
  -e YELLOW_PRO_API_KEY=... -e YELLOW_PRO_API_SECRET=... -e YELLOW_PRO_APP_SESSION_ID=... \
  -- yellow-pro-mcp
```

仓库是公开的，安装不需要 GitHub 凭证。

多客户端注册——每条命令都会使用当前 `YELLOW_PRO_*` 环境变量：

```bash
yellow-pro setup claude-code   # 通过 `claude mcp add`（用户作用域）
yellow-pro setup codex         # 通过 `codex mcp add`，失败时输出 config.toml 片段
yellow-pro setup gemini        # 通过 `gemini mcp add`（用户作用域）
yellow-pro setup cursor        # 原子合并 ~/.cursor/mcp.json
yellow-pro setup hermes        # 通过 `hermes mcp add`，失败时输出 config.yaml 片段
yellow-pro setup openclaw      # 通过 `openclaw mcp add`
yellow-pro setup json          # 打印通用 MCP JSON 片段，适用于其他客户端
```

执行 `npm i -g`（或本地 checkout：`npm i -g /path/to/yellow_pro_mcp`）后会得到两个命令：
`yellow-pro-mcp`（MCP Server）和 `yellow-pro`（CLI）。

### 手动配置（任意 MCP 客户端）

```toml
# Codex CLI（~/.codex/config.toml）
[mcp_servers.yellow_pro]
command = "yellow-pro-mcp"
env = { YELLOW_PRO_API_KEY = "...", YELLOW_PRO_API_SECRET = "...", YELLOW_PRO_APP_SESSION_ID = "..." }
```

```json
// OpenClaw（~/.openclaw/openclaw.json）、Claude Desktop、Cursor 等
{ "mcpServers": { "yellow_pro": { "command": "yellow-pro-mcp", "env": { "YELLOW_PRO_API_KEY": "..." } } } }
```

### Agent Skill（非 MCP Agent）

`skills/yellow-pro/SKILL.md` 教 Agent 使用 `yellow-pro` CLI——把它复制到你的
Agent skill 目录，例如 `~/.claude/skills/yellow-pro/`。

## 配置

| 变量 | 必填 | 默认值 | 说明 |
|---|---|---|---|
| `YELLOW_PRO_BASE_URL` | 否 | 由 `YELLOW_PRO_SANDBOX` 决定 | 显式 REST base URL 覆盖 |
| `YELLOW_PRO_SANDBOX` | 否 | `false` | 为 `true` 时使用测试环境（`https://api.staging.yellow.pro.neodax.app`）；否则使用生产环境（`https://trade.api.yellow.pro`） |
| `YELLOW_PRO_API_KEY` | 私有工具需要 | — | API key |
| `YELLOW_PRO_API_SECRET` | 私有工具需要 | — | API secret（HMAC-SHA256） |
| `YELLOW_PRO_APP_SESSION_ID` | 私有工具需要 | — | app session id（`uid` 凭证） |
| `YELLOW_PRO_ENABLE_TRADING` | 否 | 关闭 | 为 `true` 时启用交易工具/命令 |
| `YELLOW_PRO_MODULES` | 否 | 全部 | 用逗号分隔 `market,account,trading` 以过滤工具 |
| `YELLOW_PRO_RATE_LIMIT_MS` | 否 | `100` | 请求之间的最小间隔（毫秒） |
| `YELLOW_PRO_PROFILE` | 否 | — | `~/.yellow/connections/` 下的命名凭证配置 |
| `YELLOW_PRO_CONFIG_PATH` | 否 | — | 显式凭证文件路径 |

交易工具**不会注册**，除非 `YELLOW_PRO_ENABLE_TRADING=true`。
行情数据工具无需凭证。
显式设置 `YELLOW_PRO_BASE_URL` 会覆盖 sandbox 模式。

## 工具

- **行情**：`get_health`、`get_markets`、`get_ticker`、`get_orderbook`、`get_klines`、
  `get_funding_rate`、`get_funding_rate_history`、`get_networks`、`get_transfer_assets`
- **账户**：`get_balance`、`get_open_orders`、`get_order_history`、`get_my_trades`、
  `get_positions`、`get_position_history`、`get_position_history_detail`、
  `get_spot_accounts`、`get_spot_account`、`get_perpetual_accounts`、`get_fee_schedule`、
  `get_fee_tier`、`get_market_fee_rate`、`get_transaction_history`、`get_funding_payments`
- **交易**（需开启）：`place_order`、`cancel_order`、`cancel_all_orders`、
  `close_positions`、`set_leverage`、`transfer`

市场使用原生 id：现货如 `ETHUSDT`，永续如 `BTCUSDT-PERP`。
数量和价格都是十进制字符串。所有结果均为交易所原始 JSON。

`place_order` 对现货和永续都支持以下单笔订单类型：

- `limit`：必须提供 `price`
- `market`：不需要 `price`
- `post_only`：必须提供 `price`，保证只做 maker
- `trigger_limit`（Stop Limit）：必须同时提供 `trigger_price` 和 `price`
- `trigger_market`（Stop Market）：必须提供 `trigger_price`

永续市场有按市场设置的**持仓模式**，可在 `get_perpetual_accounts` 返回的
`position_modes` 中查看。`HEDGE`（双向）模式下同一市场可分别持有多头和空头，
下单 `direction` 取 `long`/`short`（默认由 `side` 推断，`reduce_only` 时反向）；
`ONE_WAY`（单向）模式下同一市场只有一个净仓位，交易所要求显式传
`direction: "both"`，不会自动推断。切换持仓模式仅能在 yellow_pro 网页端操作。

永续条件单还可传 `trigger_type`，值为 `stop_loss` 或 `take_profit`。
查询订单时会返回分类后的条件单类型，例如 `stop_limit`、`stop_loss`、
`take_limit` 或 `take_profit`；`cancel_order` 同时接受下单时的
`trigger_*` 和这些查询返回类型，并会为现货撤单自动规范化。

大多数列表工具使用文档规定的 opt-in cursor 分页。第一次请求不传 `cursor`，MCP
会自动发送 `use_cursor=true`；下一页传入响应里的 `next_cursor`。`page_size`
默认 50、最大 100。单个历史持仓的成交明细接口原生使用 cursor：第一次请求既不传
`cursor`，也不传 `use_cursor`，其 `page_size` 按文档最大支持 500。

`yellow-pro` CLI 提供同样的功能——`yellow-pro --help`。

## Agent 操作指南

MCP Server 会把这些规则的简短版本作为默认 instructions 发送给客户端：

- 交易前先调用 `get_markets`，确认市场 id、精度、限制、杠杆上限和持仓模式。
- 数量是市场 base asset 的十进制字符串，例如 `ETHUSDT` 的 ETH、`BTCUSDT-PERP`
  的 BTC。价格是 quote asset 的十进制字符串，通常是 USDT。
- 调用任何会改变状态的工具前，先检查余额、开放订单和持仓。
- 现货和永续余额是分开的。需要在两者之间移动资金时，显式使用 `transfer`。
- 即使凭证是只读的，交易工具也可能显示出来。服务端会按 API scope 校验权限，未授权交易会返回
  `insufficient_scope`。
- 测试时优先使用小额 `post_only` 或 `limit` 订单，让订单挂在订单簿上，然后验证 open orders
  并取消/清理。
- 除非用户明确要求或确认，不要下市价单、平仓或使用批量撤单。
- 永续 `HEDGE` 模式使用 `direction: "long"` 或 `"short"`。`ONE_WAY` 模式要求
  `direction: "both"`；使用前先确认模式。

## 故障排查

**MCP 客户端看不到工具 / 连接失败**

- 通过 CLI 注册（`yellow-pro setup claude-code`，或直接用 `claude mcp add`），
  不要手动编辑配置文件——Claude Code 读取的是 `~/.claude.json`，
  不是 `~/.claude/settings.json`。
- 客户端启动 server 时不会加载你的 shell profile，因此 `yellow-pro-mcp` 必须在
  客户端的 `PATH` 里。用 `which yellow-pro-mcp` 检查；如果安装程序提示了 PATH，
  把该目录加入 profile 并重启客户端。
- 修改 MCP 配置后需要重启客户端——server 在会话启动时连接。
- 验证 server 本身能启动：

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | yellow-pro-mcp
```

**认证错误（`invalid_api_key`、`invalid_timestamp`）**

- 私有工具需要 `YELLOW_PRO_API_KEY`、`YELLOW_PRO_API_SECRET`、
  `YELLOW_PRO_APP_SESSION_ID` 三者齐全，且必须与你访问的环境匹配
  （`YELLOW_PRO_SANDBOX=true` 的 key 不能用于生产环境，反之亦然）。
- `invalid_timestamp` 表示本机时钟与交易所相差超过几秒——请同步系统时间
  （macOS 用 `sudo sntp -sS time.apple.com`，Linux 用 `chrony`/`ntp`）。

**交易命令报 "trading is disabled"**

在 MCP 客户端的 env 配置中设置 `YELLOW_PRO_ENABLE_TRADING=true`。
这是有意设计——不要绕过它直接调 REST API。

## 风险警告

交易存在亏损风险。使用前请注意：

- **保护好你的凭证**——API key 只授予最小必要权限，切勿提交到代码仓库。
- **先在测试环境验证**——先用 `YELLOW_PRO_SANDBOX=true` 在 staging 环境跑通，
  再切换到生产环境。
- **交易默认关闭**——下单类工具仅在 `YELLOW_PRO_ENABLE_TRADING=true` 时才会注册。
  Agent 提出的每一笔订单，执行前都应人工确认。
- **一切操作由你发起**——所有行为都来源于你或你的 AI 助手；
  维护者不对 Agent 行为造成的亏损负责。

## 开发

```bash
npm install
npm test          # 签名向量（与参考实现交叉验证）+ 工具注册
npm run build
```

端点和请求契约以当前
[yellow_pro API 文档](https://docs.yellow.pro/api-and-programmatic-access/overview)
为准。目前有意未实现 EIP-191/JWT 认证和 WebSocket 流。
