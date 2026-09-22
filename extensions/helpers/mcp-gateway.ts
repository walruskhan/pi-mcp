/**
 * The `mcp` gateway tool exposed to the agent. It lets the model discover
 * configured servers, request that a stopped server be started (with user
 * confirmation), and inspect and call server tools.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { countLabel } from "../utils/text.ts";
import type { McpClientManager } from "./mcp-client-manager.ts";

interface GatewayResult {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
}

function text(message: string, details: Record<string, unknown> = {}): GatewayResult {
  return { content: [{ type: "text", text: message }], details };
}

function json(value: unknown): GatewayResult {
  return text(JSON.stringify(value, null, 2));
}

async function startServer(manager: McpClientManager, serverName: string, ctx: ExtensionContext): Promise<GatewayResult> {
  const server = manager.listServers().find((candidate) => candidate.name === serverName);
  if (!server) return text(`Unknown MCP server: ${serverName}.`, { error: true });
  if (server.status === "disabled") {
    return text(`MCP server ${serverName} is disabled and cannot be started.`, { error: true });
  }
  if (server.status === "connected" || server.status === "cached") {
    return text(`MCP server ${serverName} is already started.`);
  }
  if (!ctx.hasUI || !ctx.ui || !(await ctx.ui.confirm(`Start MCP server ${serverName}?`, "The model requested this server."))) {
    return text(`MCP server ${serverName} was not started.`, { cancelled: true });
  }
  const tools = await manager.listTools(serverName);
  return text(`Started ${serverName}; discovered ${countLabel(tools.length, "tool")}.`);
}

/** Register the `mcp` gateway tool on the extension API. */
export function registerMcpGatewayTool(pi: ExtensionAPI, getManager: () => Promise<McpClientManager>): void {
  pi.registerTool({
    name: "mcp",
    label: "MCP gateway",
    description: "Discover and call tools from configured MCP servers. Use list_servers to see available and stopped servers, start a stopped server with start (which asks the user for confirmation), then use list_tools, describe, or call.",
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("list_servers"),
        Type.Literal("start"),
        Type.Literal("list_tools"),
        Type.Literal("describe"),
        Type.Literal("call"),
      ]),
      server: Type.Optional(Type.String({ description: "MCP server name" })),
      tool: Type.Optional(Type.String({ description: "Original MCP tool name" })),
      arguments: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    }),
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const manager = await getManager();
      if (params.action === "list_servers") return json(manager.listServers());
      if (!params.server) return text("The server parameter is required.", { error: true });
      if (params.action === "start") return startServer(manager, params.server, ctx);

      const server = manager.listServers().find((candidate) => candidate.name === params.server);
      if (server && server.status === "not-connected") {
        return text(`MCP server ${params.server} is stopped. Ask the user to start it with action: start before accessing its tools.`, { error: true });
      }
      const tools = await manager.listTools(params.server);
      if (params.action === "list_tools") return json(tools);
      if (!params.tool) return text("The tool parameter is required.", { error: true });
      const tool = tools.find((candidate) => candidate.name === params.tool);
      if (!tool) return text(`Tool ${params.tool} was not found on ${params.server}.`, { error: true });
      if (params.action === "describe") return json(tool);

      const result = await manager.callTool(params.server, params.tool, params.arguments ?? {});
      const content = result.content.map((item) => item.type === "text"
        ? item
        : { type: "text" as const, text: JSON.stringify(item) ?? String(item) });
      return { content, details: { server: params.server, tool: params.tool, isError: result.isError ?? false } };
    },
  });
}
