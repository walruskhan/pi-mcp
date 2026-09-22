import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  formatServerDefinition,
  isValidServerName,
  parseEnvironmentInput,
  splitCommandLine,
} from "../extensions/utils/mcp.ts";
import {
  readConfig,
  removeServer,
  writeServer,
} from "../extensions/helpers/mcp-config.ts";
import { McpTestManager } from "../extensions/helpers/mcp-test-manager.ts";

test("splitCommandLine handles quoting and escaping", () => {
  assert.deepEqual(
    splitCommandLine(`npx -y "package with spaces" 'quoted value' path\\ with\\ spaces`),
    ["npx", "-y", "package with spaces", "quoted value", "path with spaces"],
  );
});

test("splitCommandLine rejects unclosed quotes", () => {
  assert.throws(() => splitCommandLine("command 'unfinished"), /Unclosed quote/);
});

test("parseEnvironmentInput accepts comma, semicolon, and newline separators", () => {
  assert.deepEqual(
    parseEnvironmentInput("NODE_ENV=production\nDEBUG=true, EMPTY=; QUOTED=\"hello world\""),
    {
      NODE_ENV: "production",
      DEBUG: "true",
      EMPTY: "",
      QUOTED: "hello world",
    },
  );
});

test("parseEnvironmentInput validates variable names and assignments", () => {
  assert.throws(() => parseEnvironmentInput("=missing-name"), /Expected KEY=value/);
  assert.throws(() => parseEnvironmentInput("1INVALID=value"), /Invalid environment variable name/);
});

test("server names and definitions are formatted consistently", () => {
  assert.equal(isValidServerName("filesystem.v2_test-1"), true);
  assert.equal(isValidServerName("has space"), false);
  assert.equal(formatServerDefinition({ command: "npx", args: ["-y", "server"] }), "npx -y server");
  assert.equal(formatServerDefinition({ url: "https://example.test/mcp" }), "HTTP https://example.test/mcp");
});

test("config helpers read, write, and remove servers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-mcp-test-"));
  const path = join(directory, "nested", "mcp.json");

  assert.deepEqual(await readConfig(path), { mcpServers: {} });
  await writeServer(path, "demo", { command: "demo", args: ["--stdio"] });
  assert.deepEqual((await readConfig(path)).mcpServers.demo, { command: "demo", args: ["--stdio"] });
  assert.equal(await removeServer(path, "missing"), false);
  assert.equal(await removeServer(path, "demo"), true);
  assert.deepEqual((await readConfig(path)).mcpServers, {});

  const persisted = await readFile(path, "utf8");
  assert.match(persisted, /"mcpServers": \{\}/);
});

test("readConfig reports invalid JSON with its path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-mcp-test-"));
  const path = join(directory, "mcp.json");
  await writeFile(path, "{invalid", "utf8");
  await assert.rejects(readConfig(path), new RegExp(`${path} contains invalid JSON`));
});

test("McpTestManager reports disabled and unknown servers without connecting", async () => {
  const manager = new McpTestManager({ disabled: { command: "ignored", disabled: true } });
  assert.deepEqual(manager.listServers(), [{
    name: "disabled",
    definition: { command: "ignored", disabled: true },
    status: "disabled",
    toolCount: 0,
  }]);
  await assert.rejects(manager.listTools("missing"), /Unknown MCP server: missing/);
  await assert.rejects(manager.listTools("disabled"), /MCP server disabled is disabled/);
  await manager.close();
});
