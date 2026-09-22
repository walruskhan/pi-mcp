# helpers

Put helpers with side effects here. These may perform I/O, interact with Pi or
the terminal, access the filesystem, make network requests, or mutate state.

- `mcp-config.ts` — read and write the project `.mcp.json` and the global
  `~/.config/mcp/mcp.json`.
- `mcp-client-manager.ts` — the MCP runtime: connects to servers, caches
  discovered tools, and retries once by reconnecting.
- `autostart.ts` — connects servers marked `autostart` when a session starts.
- `mcp-gateway.ts` — registers the `mcp` tool the agent uses to discover,
  start, inspect, and call server tools.

Keep side effects explicit at call sites and keep pure logic in
`extensions/utils/` instead.
