import assert from "node:assert/strict";
import { test } from "node:test";

import { countLabel, errorMessage, shorten } from "../extensions/utils/text.ts";

test("shorten collapses whitespace onto one line", () => {
  assert.equal(shorten("multi\n  line\t text"), "multi line text");
  assert.equal(shorten("  padded  "), "padded");
});

test("shorten truncates long values with an ellipsis", () => {
  assert.equal(shorten("abcdef", 4), "abc…");
  assert.equal(shorten("abcd", 4), "abcd");
});

test("shorten passes through empty values", () => {
  assert.equal(shorten(undefined), undefined);
  assert.equal(shorten(""), undefined);
});

test("countLabel pluralizes nouns", () => {
  assert.equal(countLabel(0, "tool"), "0 tools");
  assert.equal(countLabel(1, "tool"), "1 tool");
  assert.equal(countLabel(2, "tool"), "2 tools");
});

test("errorMessage extracts messages from unknown values", () => {
  assert.equal(errorMessage(new Error("boom")), "boom");
  assert.equal(errorMessage("string failure"), "string failure");
  assert.equal(errorMessage(42), "42");
});
