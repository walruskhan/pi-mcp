import assert from "node:assert/strict";
import { test } from "node:test";

import { McpClientManager } from "../extensions/helpers/mcp-client-manager.ts";

test("listServers reports disabled servers without connecting", async () => {
  const manager = new McpClientManager({ disabled: { command: "ignored", disabled: true } });
  assert.deepEqual(manager.listServers(), [{
    name: "disabled",
    definition: { command: "ignored", disabled: true },
    status: "disabled",
    toolCount: 0,
  }]);
  await manager.close();
});

test("listServers reports unstarted servers as not-connected", async () => {
  const manager = new McpClientManager({
    stdio: { command: "some-command" },
    http: { url: "https://example.test/mcp" },
  });
  assert.deepEqual(manager.listServers().map((server) => server.status), ["not-connected", "not-connected"]);
  await manager.close();
});

test("operations on unknown or disabled servers fail fast", async () => {
  const manager = new McpClientManager({ disabled: { command: "ignored", disabled: true } });
  await assert.rejects(manager.listTools("missing"), /Unknown MCP server: missing/);
  await assert.rejects(manager.listTools("disabled"), /MCP server disabled is disabled/);
  await assert.rejects(manager.callTool("missing", "tool", {}), /Unknown MCP server: missing/);
  await manager.close();
});

test("servers without a command or URL are rejected", async () => {
  const manager = new McpClientManager({ empty: {} });
  await assert.rejects(manager.listTools("empty"), /(no command or URL|reconnect failed)/);
  await manager.close();
});

test("close is idempotent", async () => {
  const manager = new McpClientManager({});
  await manager.close();
  await manager.close();
});
