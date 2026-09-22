export interface ServerDefinition {
  command?: string;
  args?: string[];
  url?: string;
  env?: Record<string, string>;
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
