/**
 * Interactive editors for the parts of a server definition: environment
 * variables, working directory, HTTP authentication, and HTTP headers.
 */
import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { SelectItem } from "@earendil-works/pi-tui";
import { isValidEnvironmentVariableName, parseHeadersJson, type ServerDefinition } from "../utils/mcp.ts";
import { errorMessage, shorten } from "../utils/text.ts";
import { ask, selectOption } from "./menu.ts";

const ENV_NAME_HINT = "Use letters, numbers, and underscores; the name cannot start with a number.";

/**
 * Interactive list editor for environment variables. Returns the edited map,
 * or undefined when the user cancels a nested prompt.
 */
export async function editEnvironmentList(ctx: ExtensionCommandContext, initial: Record<string, string>): Promise<Record<string, string> | undefined> {
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
      if (!isValidEnvironmentVariableName(key)) {
        ctx.ui.notify(ENV_NAME_HINT, "error");
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
    if (!isValidEnvironmentVariableName(newKey)) {
      ctx.ui.notify(ENV_NAME_HINT, "error");
      continue;
    }
    const value = await ask(ctx, "Variable value:", environment[key]);
    if (value === undefined) return undefined;
    if (newKey !== key && Object.hasOwn(environment, newKey) && !(await ctx.ui.confirm("Replace existing variable?", newKey))) continue;
    delete environment[key];
    environment[newKey] = value;
  }
}

export type ConfigurationOption = "environment" | "working-directory" | "authentication" | "headers";

const ALL_OPTIONS: ConfigurationOption[] = ["environment", "working-directory", "authentication", "headers"];

/**
 * Walk the user through the editable parts of a server definition.
 * Command servers offer environment and working directory; HTTP servers
 * offer authentication and headers. Returns the updated definition, or
 * undefined when the user cancels.
 */
export async function configureDefinition(
  ctx: ExtensionCommandContext,
  initial: ServerDefinition,
  options: Set<ConfigurationOption> = new Set(ALL_OPTIONS),
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
      if (!isValidEnvironmentVariableName(variable.trim())) {
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
      const headers = parseHeadersJson(rawHeaders);
      if (Object.keys(headers).length) definition.headers = headers; else delete definition.headers;
    } catch (error) {
      ctx.ui?.notify(`Invalid headers: ${errorMessage(error)}`, "error");
      return undefined;
    }
  }
  return definition;
}
