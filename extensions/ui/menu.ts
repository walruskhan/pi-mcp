/**
 * Reusable TUI building blocks for the MCP wizards: a bordered select menu
 * with theme-aware labels, and a small text-input prompt.
 */
import type { ExtensionCommandContext, Theme } from "@earendil-works/pi-coding-agent";
import { DynamicBorder } from "@earendil-works/pi-coding-agent";
import { Container, matchesKey, type SelectItem, SelectList, Text } from "@earendil-works/pi-tui";

/**
 * A select-menu entry. `label` is the plain-text fallback; `renderLabel` can
 * apply theme colors when the menu is rendered inside the TUI.
 */
export type MenuItem = SelectItem & {
  renderLabel?: (theme: Theme) => string;
};

const MAX_VISIBLE_ITEMS = 8;

/**
 * Show a bordered select menu and resolve with the chosen item's value, or
 * undefined when the user cancels with Esc.
 */
export function selectOption(ctx: ExtensionCommandContext, title: string, items: MenuItem[]): Promise<string | undefined> {
  if (!ctx.hasUI || !ctx.ui) return Promise.resolve(undefined);
  return ctx.ui.custom<string | null>((tui, theme, _keybindings, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((value) => theme.fg("accent", value)));
    container.addChild(new Text(theme.fg("accent", theme.bold(title)), 1, 0));
    const renderedItems = items.map(({ renderLabel, ...item }) => ({
      ...item,
      ...(renderLabel ? { label: renderLabel(theme) } : {}),
    }));
    const list = new SelectList(renderedItems, Math.min(renderedItems.length, MAX_VISIBLE_ITEMS), {
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

/**
 * Prompt for a line of text. Resolves with undefined when the user cancels
 * or no interactive UI is available.
 */
export function ask(ctx: ExtensionCommandContext, label: string, placeholder?: string): Promise<string | undefined> {
  if (!ctx.hasUI || !ctx.ui) return Promise.resolve(undefined);
  return ctx.ui.input(label, placeholder);
}
