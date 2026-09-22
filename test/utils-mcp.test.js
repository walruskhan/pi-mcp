import assert from "node:assert/strict";
import { test } from "node:test";

import {
  definitionsByName,
  formatServerDefinition,
  isValidEnvironmentVariableName,
  isValidServerName,
  parseEnvironmentInput,
  parseHeadersJson,
  resolveEnvironment,
  splitCommandLine,
} from "../extensions/utils/mcp.ts";

test("splitCommandLine handles quoting and escaping", () => {
  assert.deepEqual(
    splitCommandLine(`npx -y "package with spaces" 'quoted value' path\\ with\\ spaces`),
    ["npx", "-y", "package with spaces", "quoted value", "path with spaces"],
  );
});

test("splitCommandLine rejects unclosed quotes", () => {
  assert.throws(() => splitCommandLine("command 'unfinished"), /Unclosed quote/);
});

test("parseEnvironmentInput accepts comma, semicolon, and newline separators", () => {
  assert.deepEqual(
    parseEnvironmentInput("NODE_ENV=production\nDEBUG=true, EMPTY=; QUOTED=\"hello world\""),
    {
      NODE_ENV: "production",
      DEBUG: "true",
      EMPTY: "",
      QUOTED: "hello world",
    },
  );
});

test("parseEnvironmentInput validates variable names and assignments", () => {
  assert.throws(() => parseEnvironmentInput("=missing-name"), /Expected KEY=value/);
  assert.throws(() => parseEnvironmentInput("1INVALID=value"), /Invalid environment variable name/);
});

test("environment variable names are validated", () => {
  assert.equal(isValidEnvironmentVariableName("MY_VAR_2"), true);
  assert.equal(isValidEnvironmentVariableName("_private"), true);
  assert.equal(isValidEnvironmentVariableName("2FAST"), false);
  assert.equal(isValidEnvironmentVariableName("has-dash"), false);
  assert.equal(isValidEnvironmentVariableName(""), false);
});

test("server names and definitions are formatted consistently", () => {
  assert.equal(isValidServerName("filesystem.v2_test-1"), true);
  assert.equal(isValidServerName("has space"), false);
  assert.equal(formatServerDefinition({ command: "npx", args: ["-y", "server"] }), "npx -y server");
  assert.equal(formatServerDefinition({ url: "https://example.test/mcp" }), "HTTP https://example.test/mcp");
});

test("parseHeadersJson accepts blank input and header objects", () => {
  assert.deepEqual(parseHeadersJson(""), {});
  assert.deepEqual(parseHeadersJson("  "), {});
  assert.deepEqual(parseHeadersJson('{"X-Api-Key": "secret"}'), { "X-Api-Key": "secret" });
});

test("parseHeadersJson rejects non-objects and non-string values", () => {
  assert.throws(() => parseHeadersJson("[1, 2]"), /Headers must be a JSON object/);
  assert.throws(() => parseHeadersJson('"text"'), /Headers must be a JSON object/);
  assert.throws(() => parseHeadersJson("null"), /Headers must be a JSON object/);
  assert.throws(() => parseHeadersJson('{"count": 3}'), /Header count must be a string/);
  assert.throws(() => parseHeadersJson("{invalid"), SyntaxError);
});

test("definitionsByName keeps the first (project-scope) entry per name", () => {
  const project = { command: "project-server" };
  const global = { command: "global-server" };
  const other = { url: "https://example.test/mcp" };
  assert.deepEqual(
    definitionsByName([
      { name: "shared", definition: project },
      { name: "other", definition: other },
      { name: "shared", definition: global },
    ]),
    { shared: project, other },
  );
  assert.deepEqual(definitionsByName([]), {});
});

test("resolveEnvironment substitutes $VAR and ${VAR} references", () => {
  const source = { HOME: "/home/tester", TOKEN: "abc" };
  assert.deepEqual(
    resolveEnvironment({ PLAIN: "value", A: "$HOME/bin", B: "${TOKEN}!", MISSING: "$UNDEFINED_VAR" }, source),
    { PLAIN: "value", A: "/home/tester/bin", B: "abc!", MISSING: "" },
  );
  assert.equal(resolveEnvironment(undefined, source), undefined);
});
