# pi-mcp

Lightweight MCP server management extension for [Pi](https://pi.dev). It
manages standard MCP configuration files and provides a manual MCP test
console without bundling a full Pi MCP adapter.

## Commands

- `/mcp` — list configured MCP servers and the lightweight runtime status.
- `/mcp-add` — open a wizard for adding a local command or remote HTTP server,
  including environment variables and authentication.
- `/mcp-configure` — update an existing server's environment variables, bearer
  authentication, working directory, and HTTP headers.
- `/mcp-remove` — choose and remove a server from the project or global config.
- `/mcp-test` — choose a server, inspect its tools and input schema, enter JSON
  arguments, and execute a tool manually.

The add wizard writes either the project `.mcp.json` or the user-global
`~/.config/mcp/mcp.json`, then reloads Pi. `/mcp-test` starts MCP connections
lazily, discovers and caches tools for five minutes, retries a failed operation
once by reconnecting, and supports bearer tokens through an environment
variable. MCP tools are available manually through `/mcp-test` and to the agent through
one lightweight `mcp` gateway tool. The gateway workflow is:
`list_servers` → `list_tools` → `describe` (optional) → `call`.

Command servers accept any executable and arguments, including for example:

```text
uvx mcp-server-git --repository /path/to/repo
npx -y @modelcontextprotocol/server-filesystem /tmp
pnpm dlx @modelcontextprotocol/server-memory
pipx run mcp-server-fetch
```

Only add commands and URLs you trust: command servers run with the permissions
of the Pi process, and remote servers may receive data from MCP requests.

## Development

Prerequisites: [Devbox](https://www.jetify.com/devbox). It provides Node.js,
pnpm, Just, and `detect-secrets`. Enter the shell with `devbox shell`, or prefix
commands with `devbox run --`.

```bash
just install-hooks  # configure the versioned Git hooks
just check         # check TypeScript syntax
just lint          # run Biome
just test          # run Node's test runner
just pi            # run Pi with the local extension
```

The package's Pi metadata points at `extensions/main.ts`, so it can also be
loaded from the repository root with:

```bash
pi -e ./extensions/main.ts
```

## Publish

```bash
git init
git add .
git commit -m "Initial Pi extension"
git branch -M main
git remote add origin git@github.com:YOUR_USER/pi-mcp.git
git push -u origin main
```

Pi can install a tagged package from GitHub:

```bash
pi install git:github.com/YOUR_USER/pi-mcp@v0.1.0
```
