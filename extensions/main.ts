import type { ExtensionAPI, ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, matchesKey, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";
import { configuredServers, configPath, removeServer, writeServer, type ConfigScope } from "./helpers/mcp-config.ts";
import { McpTestManager } from "./helpers/mcp-test-manager.ts";

// Public stage-one API for other extensions that want to build on the test console.
export { McpTestManager } from "./helpers/mcp-test-manager.ts";
export type { TestMcpClient, TestServer } from "./helpers/mcp-test-manager.ts";
import { formatServerDefinition, isValidServerName, splitCommandLine, type ServerDefinition } from "./utils/mcp.ts";

type MenuItem = SelectItem & {
  renderLabel?: (theme: Theme) => string;
};

function selectOption(ctx: ExtensionCommandContext, title: string, items: MenuItem[]): Promise<string | undefined> {
  if (!ctx.hasUI || !ctx.ui) return Promise.resolve(undefined);
  return ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((value) => theme.fg("accent", value)));
    container.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));
    const renderedItems = items.map(({ renderLabel, ...item }) => ({
      ...item,
      ...(renderLabel ? { label: renderLabel(theme) } : {}),
    }));
    const list = new SelectList(renderedItems, Math.min(renderedItems.length, 8), {
      selectedPrefix: (value) => theme.fg("accent", value),
      selectedText: (value) => theme.fg("accent", value),
      description: (value) => theme.fg("muted", value),
      scrollInfo: (value) => theme.fg("dim", value),
    });
    list.onSelect = (item) => done(item.value);
    list.onCancel = () => done(null);
    container.addChild(list);
    container.addChild(new Text(theme.fg("dim", "↑↓ navigate • enter select • esc cancel"), 1, 0));
    container.addChild(new DynamicBorder((value) => theme.fg("accent", value)));
    return {
      render: (width) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data) => {
        // Handle cancellation before forwarding input to SelectList. This is
        // important for nested menus: Esc must resolve the current menu so
        // its caller can return to the parent menu.
        if (data === "\u001b" || matchesKey(data, "escape")) {
          done(null);
          return;
        }
        list.handleInput(data);
        tui.requestRender();
      },
    };
  }).then((result) => result ?? undefined);
}

function shorten(value: string | undefined, max = 96): string | undefined {
  if (!value) return undefined;
  const oneLine = value.replace(/\\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

function ask(ctx: ExtensionCommandContext, label: string, placeholder?: string): Promise<string | undefined> {
  if (!ctx.hasUI || !ctx.ui) return Promise.resolve(undefined);
  return ctx.ui.input(label, placeholder);
}

async function editEnvironmentList(ctx: ExtensionCommandContext, initial: Record<string, string>): Promise<Record<string, string> | undefined> {
  if (!ctx.ui) return undefined;
  const environment = { ...initial };
  while (true) {
    const entries = Object.entries(environment);
    const items: SelectItem[] = entries.map(([key, value]) => ({
      value: `edit:${key}`,
      label: `${key} = ${shorten(value, 72) ?? ""}`,
    }));
    items.push({ value: "add", label: "Add environment variable" });
    items.push({ value: "save", label: "Save and continue" });
    const selected = await selectOption(ctx, "Environment variables", items);
    if (!selected || selected === "save") return environment;

    if (selected === "add") {
      const key = (await ask(ctx, "Variable name:", "MY_VARIABLE"))?.trim();
      if (key === undefined) return undefined;
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
        ctx.ui.notify("Use letters, numbers, and underscores; the name cannot start with a number.", "error");
        continue;
      }
      if (Object.hasOwn(environment, key) && !(await ctx.ui.confirm("Replace existing variable?", key))) continue;
      const value = await ask(ctx, "Variable value:", "");
      if (value === undefined) return undefined;
      environment[key] = value;
      continue;
    }

    const key = selected.startsWith("edit:") ? selected.slice(5) : "";
    if (!key || !Object.hasOwn(environment, key)) continue;
    const action = await ctx.ui.select(`Configure ${key}:`, ["Edit", "Remove", "Cancel"]);
    if (action === "Remove") {
      delete environment[key];
      continue;
    }
    if (action !== "Edit") continue;
    const newKey = (await ask(ctx, "Variable name:", key))?.trim();
    if (newKey === undefined) return undefined;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newKey)) {
      ctx.ui.notify("Use letters, numbers, and underscores; the name cannot start with a number.", "error");
      continue;
    }
    const value = await ask(ctx, "Variable value:", environment[key]);
    if (value === undefined) return undefined;
    if (newKey !== key && Object.hasOwn(environment, newKey) && !(await ctx.ui.confirm("Replace existing variable?", newKey))) continue;
    delete environment[key];
    environment[newKey] = value;
  }
}

type ConfigurationOption = "environment" | "working-directory" | "authentication" | "headers";

async function configureDefinition(
  ctx: ExtensionCommandContext,
  initial: ServerDefinition,
  options: Set<ConfigurationOption> = new Set(["environment", "working-directory", "authentication", "headers"]),
): Promise<ServerDefinition | undefined> {
  let definition: ServerDefinition = { ...initial };
  if (definition.command && options.has("environment")) {
    const env = await editEnvironmentList(ctx, definition.env ?? {});
    if (!env) return undefined;
    definition = { ...definition, ...(Object.keys(env).length ? { env } : {}) };
    if (!Object.keys(env).length) delete definition.env;
  }

  if (definition.command && options.has("working-directory")) {
    const cwd = await ask(ctx, "Working directory (optional):", definition.cwd ?? "");
    if (cwd === undefined) return undefined;
    if (cwd.trim()) definition.cwd = cwd.trim(); else delete definition.cwd;
  }

  if (definition.url && options.has("authentication")) {
    const auth = await selectOption(ctx, "HTTP authentication", [
      { value: "none", label: "None" },
      { value: "env", label: "Bearer token from environment variable" },
      { value: "literal", label: "Bearer token (stored in config)" },
    ]);
    if (auth === undefined) return undefined;
    delete definition.bearerToken;
    delete definition.bearerTokenEnv;
    if (auth === "env") {
      const variable = await ask(ctx, "Bearer token environment variable:", definition.bearerTokenEnv ?? "MCP_TOKEN");
      if (variable === undefined) return undefined;
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable.trim())) {
        ctx.ui?.notify("Enter a valid environment variable name.", "error");
        return undefined;
      }
      definition.bearerTokenEnv = variable.trim();
    } else if (auth === "literal") {
      if (!(await ctx.ui?.confirm("Store bearer token in config?", "Anyone who can read this MCP config can read the token."))) return undefined;
      const token = await ask(ctx, "Bearer token:");
      if (token === undefined) return undefined;
      if (token) definition.bearerToken = token;
    }
  }

  if (definition.url && options.has("headers")) {
    const rawHeaders = await ask(ctx, "HTTP headers as JSON (blank clears):", JSON.stringify(definition.headers ?? {}));
    if (rawHeaders === undefined) return undefined;
    try {
      const headers = rawHeaders.trim() ? JSON.parse(rawHeaders) as Record<string, string> : {};
      if (!headers || Array.isArray(headers) || typeof headers !== "object") throw new Error("Headers must be a JSON object");
      if (Object.keys(headers).length) definition.headers = headers; else delete definition.headers;
    } catch (error) {
      ctx.ui?.notify(`Invalid headers: ${error instanceof Error ? error.message : String(error)}`, "error");
      return undefined;
    }
  }
  return definition;
}

async function addServer(ctx: ExtensionCommandContext): Promise<void> {
  if (!ctx.hasUI || !ctx.ui) {
    ctx.ui?.notify("/mcp-add requires an interactive Pi session.", "warning");
    return;
  }

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
    definition = await configureDefinition(ctx, definition);
    if (!definition) return;
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
    return;
  }

  const scopeChoice = await ctx.ui.select("Save server configuration:", [
    "Project (.mcp.json)",
    "Global (~/.config/mcp/mcp.json)",
  ]);
  if (!scopeChoice) return;
  const scope: ConfigScope = scopeChoice.startsWith("Project") ? "project" : "global";
  const path = configPath(scope);
  const existing = (await configuredServers()).find((server) => server.name === name && server.scope === scope);
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

function formatToolResult(result: unknown): string {
  if (typeof result === "string") return result;
  return JSON.stringify(result, null, 2) ?? String(result);
}

async function testServerWizard(ctx: ExtensionCommandContext): Promise<void> {
  if (!ctx.hasUI || !ctx.ui) {
    ctx.ui?.notify("/mcp-test requires an interactive Pi session.", "warning");
    return;
  }
  const entries = await configuredServers();
  const definitions = Object.fromEntries([...entries].reverse().map(({ name, definition }) => [name, definition]));
  const manager = new McpTestManager(definitions);
  try {
    const servers = manager.listServers();
    if (servers.length === 0) {
      ctx.ui.notify("No MCP servers configured.", "info");
      return;
    }
    const serverLabel = await selectOption(ctx, "Select an MCP server", servers.map((server) => ({
      value: server.name,
      label: server.name,
      description: server.status,
    })));
    if (!serverLabel) return;
    const server = servers.find((candidate) => candidate.name === serverLabel);
    if (!server) return;

    const tools = await manager.listTools(server.name);
    if (tools.length === 0) {
      ctx.ui.notify(`${server.name} does not expose any tools.`, "info");
      return;
    }
    // Keep this menu strictly one line per tool. Details are shown after
    // selection, before asking for arguments.
    const toolLabel = await selectOption(ctx, `Select a tool from ${server.name}`, tools.map((tool) => ({
      value: tool.name,
      label: tool.name,
    })));
    if (!toolLabel) return;
    const tool = tools.find((candidate) => candidate.name === toolLabel);
    if (!tool) return;

    if (tool.description) ctx.ui.notify(tool.description, "info");
    const schema = tool.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : "{}";
    const rawArguments = await ctx.ui.input(
      `${server.name}.${tool.name} arguments (JSON): ${schema}`,
      "{}",
    );
    if (rawArguments === undefined) return;
    let args: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(rawArguments);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("arguments must be a JSON object");
      args = parsed as Record<string, unknown>;
    } catch (error) {
      ctx.ui.notify(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`, "error");
      return;
    }
    if (!(await ctx.ui.confirm(`Execute ${server.name}.${tool.name}?`, JSON.stringify(args)))) return;

    const result = await manager.callTool(server.name, tool.name, args);
    ctx.ui.notify(formatToolResult(result), result.isError ? "error" : "info");
  } finally {
    await manager.close();
  }
}

async function configureServerWizard(ctx: ExtensionCommandContext): Promise<void> {
  if (!ctx.hasUI || !ctx.ui) {
    ctx.ui?.notify("/mcp-configure requires an interactive Pi session.", "warning");
    return;
  }
  let modified = false;
  while (true) {
    const servers = await configuredServers();
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
        const action = nextAutostart ? "Enable" : "Disable";
        definition = { ...definition, ...(nextAutostart ? { autostart: true } : {}) };
        if (!nextAutostart) delete definition.autostart;
        await writeServer(server.path, server.name, definition);
        modified = true;
        ctx.ui.notify(`${action}d autostart for ${server.name}.`, "success");
        continue;
      }
      if (option === "status") {
        const runtime = new McpTestManager({ [server.name]: definition }).listServers()[0];
        const statusAction = await selectOption(ctx, `${server.name}: ${runtime?.status ?? "not-connected"}`, [
          { value: definition.disabled ? "enable" : "disable", label: definition.disabled ? "Enable server" : "Disable server" },
          { value: "back", label: "Back" },
        ]);
        if (!statusAction || statusAction === "back") continue;
        const nextDisabled = statusAction === "disable";
        const action = nextDisabled ? "disable" : "enable";
        definition = { ...definition, ...(nextDisabled ? { disabled: true } : {}) };
        if (!nextDisabled) delete definition.disabled;
        await writeServer(server.path, server.name, definition);
        modified = true;
        ctx.ui.notify(`${action === "enable" ? "Enabled" : "Disabled"} ${server.name}.`, "success");
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

async function removeServerWizard(ctx: ExtensionCommandContext): Promise<void> {
  if (!ctx.hasUI || !ctx.ui) {
    ctx.ui?.notify("/mcp-remove requires an interactive Pi session.", "warning");
    return;
  }
  const servers = await configuredServers();
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
  const index = Number(selected);
  const server = servers[index];
  if (!server) return;
  if (!(await ctx.ui.confirm("Remove MCP server?", `${server.name} from ${server.path}`))) return;
  await removeServer(server.path, server.name);
  ctx.ui.notify(`Removed ${server.name}.`, "success");
  await ctx.reload();
}

/**
 * MCP server management for Pi. This lightweight implementation provides
 * config management, status, and a manual MCP test console without bundling a
 * second Pi adapter.
 */
export default function (pi: ExtensionAPI) {
  let activeManager: McpTestManager | null = null;

  pi.on("session_start", async (_event, ctx) => {
    await activeManager?.close();
    activeManager = null;
    const entries = await configuredServers(ctx.cwd);
    const definitions = Object.fromEntries([...entries].reverse().map(({ name, definition }) => [name, definition]));
    const autostartNames = Object.entries(definitions)
      .filter(([, definition]) => definition.autostart && !definition.disabled)
      .map(([name]) => name);
    if (autostartNames.length === 0) return;

    const manager = new McpTestManager(definitions);
    activeManager = manager;
    await Promise.all(autostartNames.map(async (name) => {
      try {
        const tools = await manager.listTools(name);
        ctx.ui.notify(`Autostarted ${name}; discovered ${tools.length} tool${tools.length === 1 ? "" : "s"}.`, "info");
      } catch (error) {
        ctx.ui.notify(`Could not autostart ${name}: ${error instanceof Error ? error.message : String(error)}`, "error");
      }
    }));

  });

  pi.on("session_shutdown", async () => {
    await activeManager?.close();
    activeManager = null;
  });

  pi.registerCommand("mcp", {
    description: "List and activate MCP servers",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI || !ctx.ui) {
        ctx.ui?.notify("/mcp requires an interactive Pi session.", "warning");
        return;
      }
      const entries = await configuredServers();
      const definitions = Object.fromEntries([...entries].reverse().map(({ name, definition }) => [name, definition]));
      const manager = activeManager ?? new McpTestManager(definitions);
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
              activeManager = manager;
            }
            ctx.ui.notify(`Started ${selected}; discovered ${tools.length} tool${tools.length === 1 ? "" : "s"}.`, "success");
            // Keep the server list open so another server can be started.
          } catch (error) {
            ctx.ui.notify(`Could not start ${selected}: ${error instanceof Error ? error.message : String(error)}`, "error");
          }
        }
      } finally {
        if (manager !== activeManager) await manager.close();
      }
    },
  });

  const getActiveManager = async (): Promise<McpTestManager> => {
    if (activeManager) return activeManager;
    const entries = await configuredServers();
    const definitions = Object.fromEntries([...entries].reverse().map(({ name, definition }) => [name, definition]));
    activeManager = new McpTestManager(definitions);
    return activeManager;
  };

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
    execute: async (_toolCallId, params, _signal, _onUpdate, toolCtx) => {
      const manager = await getActiveManager();
      if (params.action === "list_servers") {
        return { content: [{ type: "text", text: JSON.stringify(manager.listServers(), null, 2) }], details: {} };
      }
      if (!params.server) {
        return { content: [{ type: "text", text: "The server parameter is required." }], details: { error: true } };
      }
      if (params.action === "start") {
        const server = manager.listServers().find((candidate) => candidate.name === params.server);
        if (!server) {
          return { content: [{ type: "text", text: `Unknown MCP server: ${params.server}.` }], details: { error: true } };
        }
        if (server.status === "disabled") {
          return { content: [{ type: "text", text: `MCP server ${params.server} is disabled and cannot be started.` }], details: { error: true } };
        }
        if (server.status === "connected" || server.status === "cached") {
          return { content: [{ type: "text", text: `MCP server ${params.server} is already started.` }], details: {} };
        }
        if (!toolCtx.hasUI || !toolCtx.ui || !(await toolCtx.ui.confirm(`Start MCP server ${params.server}?`, "The model requested this server."))) {
          return { content: [{ type: "text", text: `MCP server ${params.server} was not started.` }], details: { cancelled: true } };
        }
        const tools = await manager.listTools(params.server);
        return { content: [{ type: "text", text: `Started ${params.server}; discovered ${tools.length} tool${tools.length === 1 ? "" : "s"}.` }], details: {} };
      }
      const server = manager.listServers().find((candidate) => candidate.name === params.server);
      if (server && server.status === "not-connected") {
        return { content: [{ type: "text", text: `MCP server ${params.server} is stopped. Ask the user to start it with action: start before accessing its tools.` }], details: { error: true } };
      }
      const tools = await manager.listTools(params.server);
      if (params.action === "list_tools") {
        return { content: [{ type: "text", text: JSON.stringify(tools, null, 2) }], details: {} };
      }
      if (!params.tool) {
        return { content: [{ type: "text", text: "The tool parameter is required." }], details: { error: true } };
      }
      const tool = tools.find((candidate) => candidate.name === params.tool);
      if (!tool) {
        return { content: [{ type: "text", text: `Tool ${params.tool} was not found on ${params.server}.` }], details: { error: true } };
      }
      if (params.action === "describe") {
        return { content: [{ type: "text", text: JSON.stringify(tool, null, 2) }], details: {} };
      }
      const result = await manager.callTool(params.server, params.tool, params.arguments ?? {});
      const content = result.content.map((item) => item.type === "text"
        ? item
        : { type: "text" as const, text: JSON.stringify(item) ?? String(item) });
      return { content, details: { server: params.server, tool: params.tool, isError: result.isError ?? false } };
    },
  });

  pi.registerCommand("mcp-add", {
    description: "Add an MCP server with an interactive wizard",
    handler: async (_args, ctx) => {
      try { await addServer(ctx); }
      catch (error) { ctx.ui?.notify(`Could not add MCP server: ${error instanceof Error ? error.message : String(error)}`, "error"); }
    },
  });

  pi.registerCommand("mcp-configure", {
    description: "Configure MCP authentication, environment variables, and autostart",
    handler: async (_args, ctx) => {
      try { await configureServerWizard(ctx); }
      catch (error) { ctx.ui?.notify(`Could not configure MCP server: ${error instanceof Error ? error.message : String(error)}`, "error"); }
    },
  });

  pi.registerCommand("mcp-test", {
    description: "Interactively list and execute MCP server tools",
    handler: async (_args, ctx) => {
      try { await testServerWizard(ctx); }
      catch (error) { ctx.ui?.notify(`MCP test failed: ${error instanceof Error ? error.message : String(error)}`, "error"); }
    },
  });

  pi.registerCommand("mcp-remove", {
    description: "Remove an MCP server with an interactive wizard",
    handler: async (_args, ctx) => {
      try { await removeServerWizard(ctx); }
      catch (error) { ctx.ui?.notify(`Could not remove MCP server: ${error instanceof Error ? error.message : String(error)}`, "error"); }
    },
  });
}
