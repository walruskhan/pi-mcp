import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import {
  configPath,
  configuredServers,
  readConfig,
  removeServer,
  writeServer,
} from "../extensions/helpers/mcp-config.ts";

test("configPath resolves project and global config files", () => {
  assert.equal(configPath("project", "/work/repo"), join("/work/repo", ".mcp.json"));
  assert.match(configPath("global"), /\.config\/mcp\/mcp\.json$/);
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

test("writeServer preserves unrelated config keys", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-mcp-test-"));
  const path = join(directory, "mcp.json");
  await writeFile(path, JSON.stringify({ custom: { keep: true }, mcpServers: { existing: { command: "keep" } } }), "utf8");
  await writeServer(path, "added", { url: "https://example.test/mcp" });
  const config = await readConfig(path);
  assert.deepEqual(config.custom, { keep: true });
  assert.deepEqual(Object.keys(config.mcpServers).sort(), ["added", "existing"]);
});

test("readConfig reports invalid JSON with its path", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-mcp-test-"));
  const path = join(directory, "mcp.json");
  await writeFile(path, "{invalid", "utf8");
  await assert.rejects(readConfig(path), new RegExp(`${path} contains invalid JSON`));
});

test("readConfig normalizes a malformed mcpServers section", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-mcp-test-"));
  const path = join(directory, "mcp.json");
  await writeFile(path, JSON.stringify({ mcpServers: "oops" }), "utf8");
  assert.deepEqual((await readConfig(path)).mcpServers, {});
});

test("configuredServers lists project entries before global ones", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pi-mcp-test-"));
  await writeFile(join(directory, ".mcp.json"), JSON.stringify({ mcpServers: { local: { command: "local" } } }), "utf8");
  const entries = await configuredServers(directory);
  const project = entries.filter((entry) => entry.scope === "project");
  assert.deepEqual(project, [{
    name: "local",
    scope: "project",
    path: join(directory, ".mcp.json"),
    definition: { command: "local" },
  }]);
  // Any global entries must come after every project entry.
  const firstGlobal = entries.findIndex((entry) => entry.scope === "global");
  if (firstGlobal !== -1) assert.equal(firstGlobal >= project.length, true);
});
