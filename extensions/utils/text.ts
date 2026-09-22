/**
 * Pure text-formatting helpers shared by the UI wizards and the gateway tool.
 */

/**
 * Collapse whitespace onto one line and truncate to `max` characters,
 * appending an ellipsis when the value was shortened.
 */
export function shorten(value: string | undefined, max = 96): string | undefined {
  if (!value) return undefined;
  const oneLine = value.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/** Format a count with a naively pluralized noun: `1 tool`, `3 tools`. */
export function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Normalize an unknown thrown value into a message string. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
