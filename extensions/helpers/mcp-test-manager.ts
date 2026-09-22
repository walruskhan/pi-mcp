import { Client, StreamableHTTPClientTransport, type CallToolResult, type ListToolsResult } from "@modelcontextprotocol/client";
import { StdioClientTransport } from "@modelcontextprotocol/client/stdio";
import type { ServerDefinition } from "../utils/mcp.ts";

export type TestServerStatus = "connected" | "cached" | "failed" | "not-connected" | "disabled";

export interface TestServer {
  name: string;
  definition: ServerDefinition;
  status: TestServerStatus;
  toolCount: number;
  error?: string;
}

export interface TestMcpClient {
  listServers(): TestServer[];
  listTools(serverName: string): Promise<ListToolsResult["tools"]>;
  callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<CallToolResult>;
  reconnect(serverName: string): Promise<void>;
  close(): Promise<void>;
}

interface Connection {
  definition: ServerDefinition;
  client: Client;
  transport: StdioClientTransport | StreamableHTTPClientTransport;
}

interface ToolCache {
  tools: ListToolsResult["tools"];
  expiresAt: number;
}

const TOOL_CACHE_TTL_MS = 5 * 60 * 1000;

function resolveEnvironment(environment: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!environment) return undefined;
  return Object.fromEntries(Object.entries(environment).map(([key, value]) => [
    key,
    value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (_match, braced, plain) => process.env[braced ?? plain] ?? ""),
  ]));
}

/** Lightweight MCP runtime for the manual test console. */
export class McpTestManager implements TestMcpClient {
  private readonly connections = new Map<string, Connection>();
  private readonly toolCache = new Map<string, ToolCache>();
  private readonly failures = new Map<string, string>();
  private readonly servers: Record<string, ServerDefinition>;

  constructor(servers: Record<string, ServerDefinition>) {
    this.servers = servers;
  }

  listServers(): TestServer[] {
    return Object.entries(this.servers).map(([name, definition]) => {
      const cached = this.toolCache.get(name);
      const error = this.failures.get(name);
      return {
        name,
        definition,
        status: definition.disabled ? "disabled" : error ? "failed" : cached && cached.expiresAt > Date.now() ? "cached" : this.connections.has(name) ? "connected" : "not-connected",
        toolCount: cached?.tools.length ?? 0,
        ...(error ? { error } : {}),
      };
    });
  }

  async listTools(serverName: string): Promise<ListToolsResult["tools"]> {
    const cached = this.toolCache.get(serverName);
    if (cached && cached.expiresAt > Date.now()) return cached.tools;
    return this.withReconnect(serverName, async (connection) => {
      const tools = (await connection.client.listTools()).tools;
      this.toolCache.set(serverName, { tools, expiresAt: Date.now() + TOOL_CACHE_TTL_MS });
      this.failures.delete(serverName);
      return tools;
    });
  }

  async callTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<CallToolResult> {
    return this.withReconnect(serverName, (connection) => connection.client.callTool({ name: toolName, arguments: args }));
  }

  async reconnect(serverName: string): Promise<void> {
    await this.disconnect(serverName);
    await this.connect(serverName);
    await this.listTools(serverName);
  }

  async close(): Promise<void> {
    await Promise.all([...this.connections.keys()].map((name) => this.disconnect(name)));
  }

  private async withReconnect<T>(serverName: string, operation: (connection: Connection) => Promise<T>): Promise<T> {
    let connection = await this.connect(serverName);
    try {
      const result = await operation(connection);
      this.failures.delete(serverName);
      return result;
    } catch (firstError) {
      // MCP processes and HTTP sessions can disappear between calls. Recreate
      // the transport once before surfacing the error to the user.
      await this.disconnect(serverName);
      try {
        connection = await this.connect(serverName);
        const result = await operation(connection);
        this.failures.delete(serverName);
        return result;
      } catch (secondError) {
        const message = secondError instanceof Error ? secondError.message : String(secondError);
        this.failures.set(serverName, message);
        throw new Error(`${message} (reconnect failed after: ${firstError instanceof Error ? firstError.message : String(firstError)})`);
      }
    }
  }

  private async connect(serverName: string): Promise<Connection> {
    const definition = this.servers[serverName];
    if (!definition) throw new Error(`Unknown MCP server: ${serverName}`);
    if (definition.disabled) throw new Error(`MCP server ${serverName} is disabled`);
    const existing = this.connections.get(serverName);
    if (existing && existing.definition === definition) return existing;
    await this.disconnect(serverName);

    const client = new Client({ name: "pi-mcp", version: "0.1.0" });
    const transport = definition.url
      ? new StreamableHTTPClientTransport(new URL(definition.url), {
        requestInit: {
          headers: {
            ...definition.headers,
            ...(definition.bearerToken ? { Authorization: `Bearer ${definition.bearerToken}` } : {}),
            ...(definition.bearerTokenEnv && process.env[definition.bearerTokenEnv]
              ? { Authorization: `Bearer ${process.env[definition.bearerTokenEnv]}` } : {}),
          },
        },
      })
      : definition.command
        ? new StdioClientTransport({ command: definition.command, args: definition.args, cwd: definition.cwd, env: resolveEnvironment(definition.env), stderr: "pipe" })
        : undefined;
    if (!transport) throw new Error(`Server ${serverName} has no command or URL`);

    try {
      await client.connect(transport);
    } catch (error) {
      await client.close().catch(() => undefined);
      const message = error instanceof Error ? error.message : String(error);
      this.failures.set(serverName, message);
      throw error;
    }
    const connection = { definition, client, transport };
    this.connections.set(serverName, connection);
    return connection;
  }

  private async disconnect(serverName: string): Promise<void> {
    const connection = this.connections.get(serverName);
    this.connections.delete(serverName);
    if (connection) await connection.client.close().catch(() => undefined);
  }
}
