import { App, PluginSettingTab } from "obsidian";
import { mount, unmount, type Component as SvelteComponent } from "svelte";
import type StandaloneEpubPlugin from "../../main";

type SettingsRenderTarget = HTMLElement | { settingEl?: HTMLElement | null };

function resolveSettingsRenderContainer(target: SettingsRenderTarget): HTMLElement | null {
	if (target instanceof HTMLElement) {
		return target;
	}
	const settingEl = target?.settingEl;
	return settingEl instanceof HTMLElement ? settingEl : null;
}

function clearSettingsContainer(containerEl: HTMLElement): void {
	if (typeof containerEl.replaceChildren === "function") {
		containerEl.replaceChildren();
		return;
	}
	const empty = (containerEl as HTMLElement & { empty?: () => void }).empty;
	if (typeof empty === "function") {
		empty.call(containerEl);
	}
}

export class EpubSettingsTab extends PluginSettingTab {
	plugin: StandaloneEpubPlugin;
	private svelteRoot: ReturnType<typeof mount> | null = null;
	private renderGeneration = 0;

	constructor(app: App, plugin: StandaloneEpubPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions() {
		return [
			{
				type: "render" as const,
				render: (target: SettingsRenderTarget) => {
					const containerEl = resolveSettingsRenderContainer(target);
					if (!containerEl) {
						return;
					}
					void this.renderPanelInto(containerEl);
					return () => {
						this.unmountPanel();
					};
				},
			},
		];
	}

	display(): void {
		void this.renderPanelInto(this.containerEl);
	}

	hide(): void {
		this.unmountPanel();
		clearSettingsContainer(this.containerEl);
	}

	private unmountPanel(): void {
		this.renderGeneration += 1;
		if (!this.svelteRoot) {
			return;
		}
		void unmount(this.svelteRoot);
		this.svelteRoot = null;
	}

	private async renderPanelInto(containerEl: HTMLElement): Promise<void> {
		this.unmountPanel();
		const generation = this.renderGeneration;
		clearSettingsContainer(containerEl);

		const { default: Component } = await import("./EpubSettingsPanel.svelte");
		if (generation !== this.renderGeneration) {
			return;
		}
		this.svelteRoot = mount(Component as SvelteComponent, {
			target: containerEl,
			props: {
				plugin: this.plugin,
			},
		});
	}
}
