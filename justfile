# List available development commands.
default:
    @just --list

# Run unit tests (add tests under test/).
test:
    pnpm test

# Check TypeScript syntax without emitting files.
check:
    pnpm check

# Check extension code for lint errors.
lint:
    pnpm lint

# Apply lint fixes to extension code.
lint-fix:
    pnpm lint-fix

# Configure the repository Git hooks.
install-hooks:
    pnpm hooks:install

# Scan staged files for accidentally committed secrets.
secrets:
    git diff --cached --name-only --diff-filter=ACMR -z | xargs -0 -r detect-secrets-hook

# Launch Pi with the local extension.
pi:
    pi -e extensions/main.ts
