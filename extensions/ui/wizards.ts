/**
 * Interactive wizards behind the /mcp, /mcp-add, /mcp-configure, and
 * /mcp-remove commands.
 */
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { configuredServers, configPath, removeServer, writeServer, type ConfigScope } from "../helpers/mcp-config.ts";
import { McpClientManager } from "../helpers/mcp-client-manager.ts";
import { definitionsByName, formatServerDefinition, isValidServerName, splitCommandLine, type ServerDefinition } from "../utils/mcp.ts";
import { countLabel, errorMessage, shorten } from "../utils/text.ts";
import { ask, selectOption, type MenuItem } from "./menu.ts";
import { configureDefinition, type ConfigurationOption } from "./server-editor.ts";

function requireUI(ctx: ExtensionCommandContext, command: string): boolean {
  if (ctx.hasUI && ctx.ui) return true;
  ctx.ui?.notify(`${command} requires an interactive Pi session.`, "warning");
  return false;
}

/** /mcp — list servers with their runtime status and start them on demand. */
export async function mcpWizard(
  ctx: ExtensionCommandContext,
  activeManager: McpClientManager | null,
  setActiveManager: (manager: McpClientManager) => void,
): Promise<void> {
  if (!requireUI(ctx, "/mcp")) return;
  const definitions = definitionsByName(await configuredServers(ctx.cwd));
  const manager = activeManager ?? new McpClientManager(definitions);
  try {
    while (true) {
      const servers = manager.listServers();
      if (servers.length === 0) {
        ctx.ui.notify("No MCP servers configured.", "info");
        return;
      }
      const selected = await selectOption(ctx, "MCP servers — select one to start", servers.map((server) => ({
        value: server.name,
        label: server.name,
        description: `${server.status}${server.toolCount ? ` • ${server.toolCount} tools` : ""}`,
      })));
      if (selected === undefined) return;
      try {
        const tools = await manager.listTools(selected);
        if (manager !== activeManager) {
          await activeManager?.close();
          setActiveManager(manager);
        }
        ctx.ui.notify(`Started ${selected}; discovered ${countLabel(tools.length, "tool")}.`, "success");
        // Keep the server list open so another server can be started.
      } catch (error) {
        ctx.ui.notify(`Could not start ${selected}: ${errorMessage(error)}`, "error");
      }
    }
  } finally {
    if (manager !== activeManager) await manager.close();
  }
}

/** /mcp-add — create a new server definition and save it to a config file. */
export async function addServerWizard(ctx: ExtensionCommandContext): Promise<void> {
  if (!requireUI(ctx, "/mcp-add")) return;

  const name = (await ask(ctx, "Server name:", "my-server"))?.trim();
  if (!name) return;
  if (!isValidServerName(name)) {
    ctx.ui.notify("Use letters, numbers, dots, dashes, or underscores for the server name.", "error");
    return;
  }

  const kind = await ctx.ui.select("MCP transport:", ["Command (stdio)", "Remote HTTP"]);
  if (!kind) return;
  let definition: ServerDefinition;
  try {
    if (kind === "Remote HTTP") {
      const url = (await ask(ctx, "MCP URL:", "https://example.com/mcp"))?.trim();
      if (!url || !/^https?:\/\//i.test(url)) {
        ctx.ui.notify("Enter a valid HTTP or HTTPS URL.", "error");
        return;
      }
      definition = { url };
    } else {
      const commandLine = await ask(ctx, "Command and arguments:", "npx -y @modelcontextprotocol/server-filesystem /tmp");
      if (!commandLine?.trim()) return;
      const parts = splitCommandLine(commandLine);
      if (!parts[0]) return;
      definition = { command: parts[0], ...(parts.length > 1 ? { args: parts.slice(1) } : {}) };
    }
    const configured = await configureDefinition(ctx, definition);
    if (!configured) return;
    definition = configured;
  } catch (error) {
    ctx.ui.notify(errorMessage(error), "error");
    return;
  }

  const scopeChoice = await ctx.ui.select("Save server configuration:", [
    "Project (.mcp.json)",
    "Global (~/.config/mcp/mcp.json)",
  ]);
  if (!scopeChoice) return;
  const scope: ConfigScope = scopeChoice.startsWith("Project") ? "project" : "global";
  const path = configPath(scope, ctx.cwd);
  const existing = (await configuredServers(ctx.cwd)).find((server) => server.name === name && server.scope === scope);
  if (existing && !(await ctx.ui.confirm("Overwrite existing server?", `${name} in ${path}`))) return;

  const warning = kind === "Remote HTTP"
    ? "Pi will connect to this remote server and it may request authentication. Continue?"
    : "Pi will run this command as a child process when the server is used. Only continue if you trust it.";
  if (!(await ctx.ui.confirm("Add MCP server?", warning))) return;

  await writeServer(path, name, definition);
  ctx.ui.notify(`Added ${name} (${formatServerDefinition(definition)}) to ${path}`, "success");
  ctx.ui.notify("Reloading Pi to attach the server…", "info");
  await ctx.reload();
}

/** /mcp-configure — edit an existing server's settings in place. */
export async function configureServerWizard(ctx: ExtensionCommandContext): Promise<void> {
  if (!requireUI(ctx, "/mcp-configure")) return;
  let modified = false;
  while (true) {
    const servers = await configuredServers(ctx.cwd);
    if (servers.length === 0) {
      ctx.ui.notify("No servers are configured in .mcp.json or the global MCP config.", "info");
      return;
    }
    const selected = await selectOption(ctx, "Configure MCP server", servers.map((server, index) => ({
      value: String(index),
      label: server.name,
      description: `${server.scope} • ${shorten(formatServerDefinition(server.definition), 72) ?? ""}`,
    })));
    if (selected === undefined) {
      if (modified) await ctx.reload();
      return;
    }
    const server = servers[Number(selected)];
    if (!server) return;
    let definition = { ...server.definition };

    // Esc here returns to the server-selection parent menu. Esc inside one of
    // the individual editors only returns to this server submenu.
    while (true) {
      const options: MenuItem[] = [];
      if (definition.command) {
        options.push({
          value: "environment",
          label: `Environment variables (${Object.keys(definition.env ?? {}).length})`,
        });
        const workingDirectory = definition.cwd?.trim();
        options.push({
          value: "working-directory",
          label: "Working directory",
          renderLabel: (theme) => `Working directory: ${workingDirectory ? shorten(workingDirectory) : theme.fg("dim", "none")}`,
        });
      }
      if (definition.url) {
        options.push({ value: "authentication", label: "Authentication" });
        options.push({ value: "headers", label: "HTTP headers" });
      }
      options.push({
        value: "autostart",
        label: `Autostart: ${definition.autostart ? "on" : "off"}`,
        renderLabel: (theme) => `Autostart: ${definition.autostart ? theme.fg("success", "on") : "off"}`,
      });
      options.push({
        value: "status",
        label: `Status: ${definition.disabled ? "disabled" : "enabled"}`,
        renderLabel: (theme) => `Status: ${definition.disabled ? "disabled" : theme.fg("success", "enabled")}`,
      });
      const option = await selectOption(ctx, `Configure ${server.name}`, options);
      if (option === undefined) break;
      if (option === "autostart") {
        const nextAutostart = !definition.autostart;
        definition = { ...definition, ...(nextAutostart ? { autostart: true } : {}) };
        if (!nextAutostart) delete definition.autostart;
        await writeServer(server.path, server.name, definition);
        modified = true;
        ctx.ui.notify(`${nextAutostart ? "Enabled" : "Disabled"} autostart for ${server.name}.`, "success");
        continue;
      }
      if (option === "status") {
        const runtime = new McpClientManager({ [server.name]: definition }).listServers()[0];
        const statusAction = await selectOption(ctx, `${server.name}: ${runtime?.status ?? "not-connected"}`, [
          { value: definition.disabled ? "enable" : "disable", label: definition.disabled ? "Enable server" : "Disable server" },
          { value: "back", label: "Back" },
        ]);
        if (!statusAction || statusAction === "back") continue;
        const nextDisabled = statusAction === "disable";
        definition = { ...definition, ...(nextDisabled ? { disabled: true } : {}) };
        if (!nextDisabled) delete definition.disabled;
        await writeServer(server.path, server.name, definition);
        modified = true;
        ctx.ui.notify(`${nextDisabled ? "Disabled" : "Enabled"} ${server.name}.`, "success");
        // Keep the server configuration submenu open so the user can adjust
        // another setting before leaving the command.
        continue;
      }
      const updated = await configureDefinition(ctx, definition, new Set([option as ConfigurationOption]));
      if (!updated) continue;
      definition = updated;
      await writeServer(server.path, server.name, definition);
      modified = true;
      ctx.ui.notify(`Updated ${server.name}.`, "success");
    }
  }
}

/** /mcp-remove — pick a server and delete it from its config file. */
export async function removeServerWizard(ctx: ExtensionCommandContext): Promise<void> {
  if (!requireUI(ctx, "/mcp-remove")) return;
  const servers = await configuredServers(ctx.cwd);
  if (servers.length === 0) {
    ctx.ui.notify("No servers are configured in .mcp.json or the global MCP config.", "info");
    return;
  }
  const selected = await selectOption(ctx, "Remove MCP server", servers.map((server, index) => ({
    value: String(index),
    label: server.name,
    description: `${server.scope} • ${shorten(formatServerDefinition(server.definition), 72) ?? ""}`,
  })));
  if (selected === undefined) return;
  const server = servers[Number(selected)];
  if (!server) return;
  if (!(await ctx.ui.confirm("Remove MCP server?", `${server.name} from ${server.path}`))) return;
  await removeServer(server.path, server.name);
  ctx.ui.notify(`Removed ${server.name}.`, "success");
  await ctx.reload();
}
