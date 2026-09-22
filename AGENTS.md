# Project guide

## Overview

`pi-mcp` is a TypeScript extension for Pi. The package metadata
in `package.json` points Pi at `extensions/main.ts`, which is the extension
entrypoint.

## Project structure

- `extensions/main.ts` — extension entrypoint. Register commands, event
  handlers, tools, and shortcuts here, then delegate substantial logic to
  focused modules.
- `extensions/utils/` — pure helper functions. Code here should be
  deterministic and free of I/O, global state, and other side effects.
  Currently `mcp.ts` (MCP domain logic) and `text.ts` (formatting).
- `extensions/helpers/` — helpers that may have side effects, such as Pi UI
  interaction, filesystem or network access, process execution, or state
  mutation. Keep these effects explicit. Currently `mcp-config.ts`,
  `mcp-client-manager.ts`, `autostart.ts`, and `mcp-gateway.ts`.
- `extensions/ui/` — interactive TUI code: `menu.ts` (select menu and text
  prompt), `server-editor.ts` (definition editors), and `wizards.ts` (the
  command flows).
- `test/` — unit and integration tests, one file per module under test.
- `.githooks/` — versioned pre-commit and pre-push checks. Install them with
  `just install-hooks`.
- `devbox.json` and `devbox.lock` — pinned development tools and shell setup.
- `justfile` — documented commands for checking, linting, testing, and running
  the extension.
- `package.json` and `pnpm-lock.yaml` — package metadata, Pi package metadata,
  scripts, and locked JavaScript dependencies.
- `tsconfig.json` — strict TypeScript editor and type-checking configuration.
- `README.md` — setup, development, and publishing instructions.
- `LICENSE` — MIT license for the project.

## Development conventions

Files and folders should follow the "single-responsibility principle". A file
should be responsible for one thing; if that file grows too large, consider
splitting it into several files under a common folder.

Keep the extension entrypoint small. Put reusable transformations and business
logic in `extensions/utils/`, and put integrations or operations with side
effects in `extensions/helpers/`. Prefer explicit dependencies passed into
functions over hidden global state.

Before committing changes, run:

```bash
just check
just lint
just test
```

Run `just install-hooks` once after cloning to enable the repository hooks.
