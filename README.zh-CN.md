# yellow-pro-mcp

[English](README.md) | 简体中文

将 **yellow_pro** 交易所暴露给 AI Agent 的 MCP Server + CLI，支持 Claude Code、
Codex CLI、OpenClaw、Cursor 或任何 MCP 客户端。提供行情数据、账户状态查询，
以及在显式开启后可进行交易。

遵循官方 OKX / Bybit / Alpaca 交易所 MCP Server 的相同约定：本地 stdio 进程、
凭证仅保存在本机（通过环境变量或 MCP 客户端本地配置，绝不外传）、
**默认只读**、模块过滤、内置限流，同时提供 CLI 和面向非 MCP Agent 的 Skill 文件。

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
yellow-pro setup openclaw      # 写入 ~/.openclaw/openclaw.json 的 mcpServers 配置
yellow-pro setup hermes        # 通过 `hermes mcp add`，失败时输出 config.yaml 片段
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

永续条件单还可传 `trigger_type`，值为 `stop_loss` 或 `take_profit`。
查询订单时会返回分类后的条件单类型，例如 `stop_limit`、`stop_loss`、
`take_limit` 或 `take_profit`；`cancel_order` 同时接受下单时的
`trigger_*` 和这些查询返回类型，并会为现货撤单自动规范化。

列表工具使用文档规定的 cursor 分页。第一次请求不传 `cursor`，MCP 会自动发送
`use_cursor=true`；下一页传入响应里的 `next_cursor`。`page_size` 默认 50、最大
100；单个历史持仓的成交明细分页按文档最大支持 500。

`yellow-pro` CLI 提供同样的功能——`yellow-pro --help`。

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
