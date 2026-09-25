export const MAX_ZEN_FAB_ACTIONS = 6;

export interface ZenFabActionSetting {
	id: string;
	commandId: string;
}

export interface ListedObsidianCommand {
	id: string;
	name: string;
	icon?: string;
}

interface CommandHost {
	commands?: {
		listCommands?: () => ListedObsidianCommand[];
		executeCommandById?: (id: string) => boolean;
	};
}

export function createZenFabActionId(): string {
	return `zen-fab-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeZenFabActions(value: unknown): ZenFabActionSetting[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const seenIds = new Set<string>();
	const actions: ZenFabActionSetting[] = [];

	for (const entry of value) {
		if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
			continue;
		}

		const record = entry as Record<string, unknown>;
		const commandId = typeof record.commandId === "string" ? record.commandId.trim() : "";
		if (!commandId) {
			continue;
		}

		const rawId = typeof record.id === "string" ? record.id.trim() : "";
		const id = rawId || createZenFabActionId();
		if (seenIds.has(id)) {
			continue;
		}

		seenIds.add(id);
		actions.push({ id, commandId });
		if (actions.length >= MAX_ZEN_FAB_ACTIONS) {
			break;
		}
	}

	return actions;
}

export function listObsidianCommands(app: object): ListedObsidianCommand[] {
	const commands = (app as CommandHost).commands?.listCommands?.() ?? [];
	return commands
		.filter((command) => Boolean(command?.id && command?.name))
		.slice()
		.sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
}

export function obsidianCommandIcon(command: { icon?: string } | null | undefined): string | null {
	const icon = command?.icon?.trim();
	return icon ? icon : null;
}

export function executeObsidianCommand(app: object, commandId: string): void {
	const normalizedId = commandId.trim();
	if (!normalizedId) {
		return;
	}
	(app as CommandHost).commands?.executeCommandById?.(normalizedId);
}
