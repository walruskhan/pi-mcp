/**
 * Extension entrypoint: registers the /mcp* commands, the `mcp` gateway tool,
 * and the session lifecycle hooks. Substantial logic lives in
 * extensions/helpers/ (side effects) and extensions/ui/ (wizards).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { autostartConfiguredServers } from "./helpers/autostart.ts";
import { configuredServers } from "./helpers/mcp-config.ts";
import { McpClientManager } from "./helpers/mcp-client-manager.ts";
import { registerMcpGatewayTool } from "./helpers/mcp-gateway.ts";
import { definitionsByName } from "./utils/mcp.ts";
import { errorMessage } from "./utils/text.ts";
import { addServerWizard, configureServerWizard, mcpWizard, removeServerWizard } from "./ui/wizards.ts";

// Public API for other extensions that want to build on the MCP runtime.
export { McpClientManager } from "./helpers/mcp-client-manager.ts";
export type { ManagedServer, McpClient, ServerStatus } from "./helpers/mcp-client-manager.ts";

/**
 * MCP server management for Pi. This lightweight implementation provides
 * config management, status, autostart, and an agent-facing gateway tool
 * without bundling a second Pi adapter.
 */
export default function (pi: ExtensionAPI) {
  /** Shared connection manager for the session; created lazily. */
  let activeManager: McpClientManager | null = null;

  pi.on("session_start", async (_event, ctx) => {
    await activeManager?.close();
    activeManager = await autostartConfiguredServers(ctx);
  });

  pi.on("session_shutdown", async () => {
    await activeManager?.close();
    activeManager = null;
  });

  const getActiveManager = async (): Promise<McpClientManager> => {
    if (activeManager) return activeManager;
    activeManager = new McpClientManager(definitionsByName(await configuredServers()));
    return activeManager;
  };

  registerMcpGatewayTool(pi, getActiveManager);

  pi.registerCommand("mcp", {
    description: "List and activate MCP servers",
    handler: async (_args, ctx) => mcpWizard(ctx, activeManager, (manager) => { activeManager = manager; }),
  });

  pi.registerCommand("mcp-add", {
    description: "Add an MCP server with an interactive wizard",
    handler: async (_args, ctx) => {
      try { await addServerWizard(ctx); }
      catch (error) { ctx.ui?.notify(`Could not add MCP server: ${errorMessage(error)}`, "error"); }
    },
  });

  pi.registerCommand("mcp-configure", {
    description: "Configure MCP authentication, environment variables, and autostart",
    handler: async (_args, ctx) => {
      try { await configureServerWizard(ctx); }
      catch (error) { ctx.ui?.notify(`Could not configure MCP server: ${errorMessage(error)}`, "error"); }
    },
  });

  pi.registerCommand("mcp-remove", {
    description: "Remove an MCP server with an interactive wizard",
    handler: async (_args, ctx) => {
      try { await removeServerWizard(ctx); }
      catch (error) { ctx.ui?.notify(`Could not remove MCP server: ${errorMessage(error)}`, "error"); }
    },
  });
}
