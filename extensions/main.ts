import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Entry point for pi-mcp.
 *
 * Add commands, event handlers, tools, and shortcuts here. See the Pi
 * extension API documentation for the complete ExtensionAPI surface.
 */
export default function (pi: ExtensionAPI) {
  pi.registerCommand("pi-mcp", {
    description: "MCP Extension for pi",
    handler: async (_args, ctx) => {
      ctx.ui.notify("pi-mcp is ready to customize.", "info");
    },
  });
}
