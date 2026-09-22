/**
 * Reading and writing the standard MCP config files: the project-local
 * `.mcp.json` and the user-global `~/.config/mcp/mcp.json`.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { McpFileConfig, ServerDefinition } from "../utils/mcp.ts";

export type ConfigScope = "project" | "global";

/** A config entry together with the scope and file it was read from. */
export interface ConfigEntry {
  name: string;
  scope: ConfigScope;
  path: string;
  definition: ServerDefinition;
}

/** Resolve the config file path for a scope. */
export function configPath(scope: ConfigScope, cwd = process.cwd()): string {
  return scope === "project" ? join(cwd, ".mcp.json") : join(homedir(), ".config", "mcp", "mcp.json");
}

/**
 * Read a config file, tolerating a missing file (empty config) and
 * normalizing a missing or malformed `mcpServers` section.
 */
export async function readConfig(path: string): Promise<McpFileConfig> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as Partial<McpFileConfig>;
    return { ...raw, mcpServers: raw.mcpServers && typeof raw.mcpServers === "object" ? raw.mcpServers : {} };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { mcpServers: {} };
    if (error instanceof SyntaxError) throw new Error(`${path} contains invalid JSON`);
    throw error;
  }
}

/** Add or replace a server definition in the config file at `path`. */
export async function writeServer(path: string, name: string, definition: ServerDefinition): Promise<void> {
  const config = await readConfig(path);
  config.mcpServers[name] = definition;
  await writeConfig(path, config);
}

/** Remove a server from the config file. Returns false when it was absent. */
export async function removeServer(path: string, name: string): Promise<boolean> {
  const config = await readConfig(path);
  if (!Object.hasOwn(config.mcpServers, name)) return false;
  delete config.mcpServers[name];
  await writeConfig(path, config);
  return true;
}

async function writeConfig(path: string, config: McpFileConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

/**
 * List every configured server in precedence order: project entries first,
 * then global ones. Callers that need one definition per name should pass the
 * result through `definitionsByName`, which keeps the first occurrence.
 */
export async function configuredServers(cwd = process.cwd()): Promise<ConfigEntry[]> {
  const entries: ConfigEntry[] = [];
  for (const scope of ["project", "global"] as const) {
    const path = configPath(scope, cwd);
    const config = await readConfig(path);
    for (const [name, definition] of Object.entries(config.mcpServers)) entries.push({ name, scope, path, definition });
  }
  return entries;
}
