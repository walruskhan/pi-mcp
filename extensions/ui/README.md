# ui

Interactive TUI code for the `/mcp*` commands.

- `menu.ts` — reusable building blocks: the bordered select menu
  (`selectOption`, with per-item theme-aware labels via `MenuItem.renderLabel`)
  and the `ask` text prompt.
- `server-editor.ts` — editors for the parts of a server definition:
  environment variables, working directory, HTTP authentication, and headers.
- `wizards.ts` — the top-level flows behind `/mcp`, `/mcp-add`,
  `/mcp-configure`, and `/mcp-remove`.

Keep rendering and prompting here; put filesystem, network, and MCP runtime
work in `extensions/helpers/`, and pure data transformations in
`extensions/utils/`.
