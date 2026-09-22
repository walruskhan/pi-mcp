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
}

export interface McpFileConfig {
  mcpServers: Record<string, ServerDefinition>;
  [key: string]: unknown;
}

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

export function formatServerDefinition(definition: ServerDefinition): string {
  if (definition.url) return `HTTP ${definition.url}`;
  return [definition.command, ...(definition.args ?? [])].join(" ");
}

export function parseEnvironmentInput(input: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const item of splitCommandLine(input.replace(/[,;\n]/g, " "))) {
    const separator = item.indexOf("=");
    if (separator <= 0) throw new Error(`Expected KEY=value, got ${item}`);
    const key = item.slice(0, separator);
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) throw new Error(`Invalid environment variable name: ${key}`);
    values[key] = item.slice(separator + 1);
  }
  return values;
}
