# pi-mcp

MCP Extension for pi

A starter [Pi](https://github.com/badlogic/pi-mono) extension written in
TypeScript. The entrypoint is `extensions/main.ts`; replace the example
command with the behavior your extension provides.

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

Add tests under `test/` and update the `test` script in `package.json` as the
extension grows. `just secrets` scans staged files for accidentally committed
secrets.

## Git hooks

Run `just install-hooks` once after cloning. The pre-commit hook scans staged
files for secrets and checks TypeScript syntax. The pre-push hook runs linting
and tests.

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

## Template

Generated from [copier-templates](https://github.com/walruskhan/copier-templates)
(`pi-extension`). Pull template changes with `copier update`.
