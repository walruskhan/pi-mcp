# utils

Put pure helper functions here. Utilities should be deterministic, have no I/O,
and avoid reading or mutating global state. Prefer small functions that accept
all of their inputs and return their results.

Examples include parsing, formatting, validation, and data transformations.

- `mcp.ts` — MCP domain logic: the `ServerDefinition` shape, command-line
  tokenizing, name validation, header and environment parsing, environment
  variable substitution, and config-entry transformations.
- `text.ts` — shared formatting helpers: `shorten`, `countLabel`, and
  `errorMessage`.
