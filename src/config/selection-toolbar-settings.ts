/**
 * Ids of selection-toolbar actions that settings can control.
 * Add an id here when another button needs visibility or placement.
 */
export const SELECTION_TOOLBAR_ITEM_IDS = ["createCard"] as const;

export type SelectionToolbarItemId = (typeof SELECTION_TOOLBAR_ITEM_IDS)[number];

/** Reserved for later layout control. Not applied by the toolbar yet. */
export type SelectionToolbarItemPlacement = "primary" | "overflow";

export interface SelectionToolbarItemSettings {
	/** When true, the action is omitted from the selection toolbar. */
	hidden: boolean;
	placement?: SelectionToolbarItemPlacement;
	/** Lower numbers are intended to appear first. Not applied yet. */
	order?: number;
}

export interface SelectionToolbarSettings {
	items: Partial<Record<SelectionToolbarItemId, SelectionToolbarItemSettings>>;
}

export const DEFAULT_SELECTION_TOOLBAR_SETTINGS: SelectionToolbarSettings = {
	items: {
		createCard: { hidden: false },
	},
};

export function normalizeSelectionToolbarSettings(value: unknown): SelectionToolbarSettings {
	const rawItems =
		value && typeof value === "object" && !Array.isArray(value)
			? (value as { items?: unknown }).items
			: undefined;
	const record =
		rawItems && typeof rawItems === "object" && !Array.isArray(rawItems)
			? (rawItems as Record<string, unknown>)
			: {};

	const items: SelectionToolbarSettings["items"] = {};
	for (const id of SELECTION_TOOLBAR_ITEM_IDS) {
		const raw = record[id];
		const item =
			raw && typeof raw === "object" && !Array.isArray(raw)
				? (raw as Partial<SelectionToolbarItemSettings>)
				: {};
		const normalized: SelectionToolbarItemSettings = {
			hidden: item.hidden === true,
		};
		if (item.placement === "primary" || item.placement === "overflow") {
			normalized.placement = item.placement;
		}
		if (typeof item.order === "number" && Number.isFinite(item.order)) {
			normalized.order = item.order;
		}
		items[id] = normalized;
	}

	return { items };
}

export function isSelectionToolbarItemHidden(
	settings: SelectionToolbarSettings,
	itemId: SelectionToolbarItemId
): boolean {
	return settings.items[itemId]?.hidden === true;
}

export function withSelectionToolbarItemHidden(
	settings: SelectionToolbarSettings,
	itemId: SelectionToolbarItemId,
	hidden: boolean
): SelectionToolbarSettings {
	const current = settings.items[itemId] ?? { hidden: false };
	return {
		items: {
			...settings.items,
			[itemId]: {
				...current,
				hidden,
			},
		},
	};
}
