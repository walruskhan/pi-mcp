/**
 * Pure domain logic for MCP server definitions: parsing, validation,
 * formatting, and config-entry transformations. No I/O happens here.
 */

export interface ServerDefinition {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
  cwd?: string;
  headers?: Record<string, string>;
  bearerToken?: string;
  bearerTokenEnv?: string;
  disabled?: boolean;
  autostart?: boolean;
}

export interface McpFileConfig {
  mcpServers: Record<string, ServerDefinition>;
  [key: string]: unknown;
}

/** A named server definition together with the config file it came from. */
export interface ConfiguredServer {
  name: string;
  definition: ServerDefinition;
}

const ENVIRONMENT_VARIABLE_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Small shell-like tokenizer for command lines entered in the add wizard. */
export function splitCommandLine(input: string): string[] {
  const result: string[] = [];
  let token = "";
  let quote: "'" | '"' | null = null;
  let escaped = false;
  for (const char of input.trim()) {
    if (escaped) { token += char; escaped = false; continue; }
    if (char === "\\" && quote !== "'") { escaped = true; continue; }
    if (quote) { if (char === quote) quote = null; else token += char; continue; }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (/\s/.test(char)) { if (token) { result.push(token); token = ""; } continue; }
    token += char;
  }
  if (escaped) token += "\\";
  if (quote) throw new Error("Unclosed quote in command");
  if (token) result.push(token);
  return result;
}

export function isValidServerName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name);
}

export function isValidEnvironmentVariableName(name: string): boolean {
  return ENVIRONMENT_VARIABLE_NAME.test(name);
}

/** One-line human-readable description of a server definition. */
export function formatServerDefinition(definition: ServerDefinition): string {
  if (definition.url) return `HTTP ${definition.url}`;
  return [definition.command, ...(definition.args ?? [])].join(" ");
}

/** Parse `KEY=value` pairs separated by whitespace, commas, semicolons, or newlines. */
export function parseEnvironmentInput(input: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const item of splitCommandLine(input.replace(/[,;\n]/g, " "))) {
    const separator = item.indexOf("=");
    if (separator <= 0) throw new Error(`Expected KEY=value, got ${item}`);
    const key = item.slice(0, separator);
    if (!isValidEnvironmentVariableName(key)) throw new Error(`Invalid environment variable name: ${key}`);
    values[key] = item.slice(separator + 1);
  }
  return values;
}

/**
 * Parse an HTTP headers JSON object entered by the user. A blank string
 * yields an empty object. Throws on non-object JSON or non-string values.
 */
export function parseHeadersJson(raw: string): Record<string, string> {
  if (!raw.trim()) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Headers must be a JSON object");
  }
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value !== "string") throw new Error(`Header ${key} must be a string`);
    headers[key] = value;
  }
  return headers;
}

/**
 * Collapse config entries into a name → definition map. Entries are expected
 * in precedence order (project before global); the first occurrence of each
 * name wins, so project-scope servers shadow global ones.
 */
export function definitionsByName(entries: ConfiguredServer[]): Record<string, ServerDefinition> {
  const definitions: Record<string, ServerDefinition> = {};
  for (const { name, definition } of entries) {
    if (!Object.hasOwn(definitions, name)) definitions[name] = definition;
  }
  return definitions;
}

/**
 * Substitute `$VAR` and `${VAR}` references in environment values using the
 * provided source map. Unknown references resolve to an empty string.
 */
export function resolveEnvironment(
  environment: Record<string, string> | undefined,
  source: Record<string, string | undefined>,
): Record<string, string> | undefined {
  if (!environment) return undefined;
  return Object.fromEntries(Object.entries(environment).map(([key, value]) => [
    key,
    value.replace(
      /\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
      (_match, braced, plain) => source[braced ?? plain] ?? "",
    ),
  ]));
}
