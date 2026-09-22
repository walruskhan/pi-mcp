# pi-mcp

Lightweight MCP server management extension for [Pi](https://pi.dev). It
manages standard MCP configuration files and exposes configured servers to the
agent through a single gateway tool, without bundling a full Pi MCP adapter.

## Commands

- `/mcp` — list configured MCP servers with their runtime status and start
  them on demand.
- `/mcp-add` — open a wizard for adding a local command or remote HTTP server,
  including environment variables and authentication.
- `/mcp-configure` — update an existing server's environment variables, bearer
  authentication, working directory, HTTP headers, and autostart behavior.
- `/mcp-remove` — choose and remove a server from the project or global config.

The add wizard writes either the project `.mcp.json` or the user-global
`~/.config/mcp/mcp.json`, then reloads Pi. Project entries take precedence over
global entries with the same name.

Connections are started lazily: tools are discovered and cached for five
minutes, and a failed operation is retried once by reconnecting. Bearer tokens
can be stored in the config or read from an environment variable, and `$VAR`
and `${VAR}` references in environment values are expanded at launch.

## Starting servers

Servers with `autostart: true` connect when Pi starts. Everything else stays
stopped until it is needed, so unused servers never spawn a process:

- start one yourself from `/mcp`, or
- let the agent request one. `list_servers` shows stopped servers, and the
  agent must call `start` — which asks you to confirm — before it can use
  their tools.

The gateway workflow the agent follows is: `list_servers` → `start`
(when stopped) → `list_tools` → `describe` (optional) → `call`.

Command servers accept any executable and arguments, including for example:

```text
uvx mcp-server-git --repository /path/to/repo
npx -y @modelcontextprotocol/server-filesystem /tmp
pnpm dlx @modelcontextprotocol/server-memory
pipx run mcp-server-fetch
```

Only add commands and URLs you trust: command servers run with the permissions
of the Pi process, and remote servers may receive data from MCP requests.

## Architecture

```text
extensions/
  main.ts                    entrypoint: commands, tool, lifecycle hooks
  helpers/                   side effects (config I/O, MCP runtime, autostart)
  ui/                        interactive menus, editors, and wizards
  utils/                     pure domain logic and formatting
```

Each directory has a README describing its modules. `extensions/utils/` is
kept deterministic and free of I/O so it can be unit tested directly.

## Installation
```bash
# Latest
pi install git:github.com/walruskhan/pi-mcp

# Tagged versioned
pi install git:github.com/walruskhan/pi-mcp@v0.1.0
```

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
git remote add origin git@github.com:walruskhan/pi-mcp.git
git push -u origin main
```

Create a version tag:
```bash
# View tagged versions
git tag

git tag v0.1.0
git push origin v0.1.0
```

Users can then install tagged version:
```bash
pi install git:github.com/walruskhan/pi-mcp@v0.1.0
```
