import { describe, expect, it } from "vitest";
import {
	MAX_ZEN_FAB_ACTIONS,
	normalizeZenFabActions,
	obsidianCommandIcon,
} from "../../config/zen-fab-actions";

describe("normalizeZenFabActions", () => {
	it("keeps valid command bindings and drops empty ones", () => {
		expect(
			normalizeZenFabActions([
				{ id: "a", commandId: " editor:open " },
				{ id: "b", commandId: "   " },
				null,
				{ commandId: "app:go-back" },
			])
		).toEqual([
			{ id: "a", commandId: "editor:open" },
			{ id: expect.stringMatching(/^zen-fab-/), commandId: "app:go-back" },
		]);
	});

	it("reads the icon configured on the command", () => {
		expect(obsidianCommandIcon({ icon: " book-open " })).toBe("book-open");
		expect(obsidianCommandIcon({ icon: "  " })).toBeNull();
		expect(obsidianCommandIcon(undefined)).toBeNull();
	});

	it("caps the list", () => {
		const actions = Array.from({ length: MAX_ZEN_FAB_ACTIONS + 2 }, (_, index) => ({
			id: `id-${index}`,
			commandId: `cmd-${index}`,
		}));
		expect(normalizeZenFabActions(actions)).toHaveLength(MAX_ZEN_FAB_ACTIONS);
	});
});
