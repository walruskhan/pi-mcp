/**
 * Session-start autostart: connects every enabled server with
 * `autostart: true` and reports the discovered tools.
 */
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { definitionsByName } from "../utils/mcp.ts";
import { countLabel, errorMessage } from "../utils/text.ts";
import { configuredServers } from "./mcp-config.ts";
import { McpClientManager } from "./mcp-client-manager.ts";

/**
 * Start all autostart-enabled servers for a new session.
 *
 * Returns the manager owning the started connections, or null when no server
 * is configured to autostart (no manager is created in that case).
 */
export async function autostartConfiguredServers(ctx: ExtensionContext): Promise<McpClientManager | null> {
  const definitions = definitionsByName(await configuredServers(ctx.cwd));
  const autostartNames = Object.entries(definitions)
    .filter(([, definition]) => definition.autostart && !definition.disabled)
    .map(([name]) => name);
  if (autostartNames.length === 0) return null;

  const manager = new McpClientManager(definitions);
  await Promise.all(autostartNames.map(async (name) => {
    try {
      const tools = await manager.listTools(name);
      ctx.ui.notify(`Autostarted ${name}; discovered ${countLabel(tools.length, "tool")}.`, "info");
    } catch (error) {
      ctx.ui.notify(`Could not autostart ${name}: ${errorMessage(error)}`, "error");
    }
  }));
  return manager;
}
