import { Setting, ToggleComponent, setIcon } from "obsidian";
import {
	listObsidianCommands,
	MAX_ZEN_FAB_ACTIONS,
	obsidianCommandIcon,
} from "../../config/zen-fab-actions";
import { isBuiltinTranslationEnabled } from "../../config/selection-translation-settings";
import { BUILTIN_WEB_TRANSLATION_PROVIDERS } from "../../config/web-translation-providers";
import { getEpubBacklinkHighlightService } from "../../services/epub/epub-backlink-highlight-access";
import { scheduleEpubAnnotationIndexWarmup } from "../../services/epub/epub-annotation-index";
import { listBookNotesExportTemplateFiles } from "../../services/epub/book-notes-export/template-catalog";
import { getVaultFileBasename } from "../../utils/VaultMarkdownFileSuggest";
import { showNotification } from "../../utils/notifications";
import type { InterfaceLanguagePreference } from "../../utils/i18n";
import { mountFolderSearchSetting } from "./epub-settings-folder-search";
import type {
	EpubBasicSettingsMountOptions,
	SettingsCleanupFn,
} from "./epub-settings-types";

const EXPORT_TEMPLATE_MANAGE_OPTION = "__manage_export_templates__";

const INTERFACE_LANGUAGE_OPTIONS: Array<{
	value: InterfaceLanguagePreference;
	labelKey: string;
}> = [
	{ value: "auto", labelKey: "epub.settings.basic.interfaceLanguageAuto" },
	{ value: "zh-CN", labelKey: "epub.settings.basic.interfaceLanguageZhCN" },
	{ value: "zh-TW", labelKey: "epub.settings.basic.interfaceLanguageZhTW" },
	{ value: "en-US", labelKey: "epub.settings.basic.interfaceLanguageEnUS" },
	{ value: "ja-JP", labelKey: "epub.settings.basic.interfaceLanguageJaJP" },
	{ value: "ko-KR", labelKey: "epub.settings.basic.interfaceLanguageKoKR" },
	{ value: "ru-RU", labelKey: "epub.settings.basic.interfaceLanguageRuRU" },
];

function clearHosts(hosts: EpubBasicSettingsMountOptions["hosts"]): void {
	hosts.interface.replaceChildren();
	hosts.premiumPreview.replaceChildren();
	hosts.reading.replaceChildren();
	hosts.selectionToolbar.replaceChildren();
	hosts.selectionTranslation.replaceChildren();
	hosts.diagnostics.replaceChildren();
	hosts.zenFab.replaceChildren();
}

function renderCustomTranslationProvidersPanel(
	options: EpubBasicSettingsMountOptions,
	cleanupFns: SettingsCleanupFn[]
): void {
	const { hosts, snapshot, callbacks, t } = options;
	const host = hosts.selectionTranslation;

	const panel = host.createDiv({ cls: "epub-custom-translation-panel" });
	const intro = panel.createDiv({ cls: "epub-custom-translation-panel__intro" });
	intro.createDiv({
		cls: "epub-custom-translation-panel__title",
		text: t("epub.settings.basic.customTranslationProviders"),
	});
	intro.createDiv({
		cls: "epub-custom-translation-panel__hint",
		text: t("epub.settings.basic.customTranslationUrlHint"),
	});

	const rowsHost = panel.createDiv({ cls: "epub-custom-translation-panel__rows" });
	snapshot.customTranslationProviderDrafts.forEach((customProvider, index) => {
		const row = rowsHost.createDiv({ cls: "epub-custom-translation-panel__row" });
		const fields = row.createDiv({ cls: "epub-custom-translation-panel__fields" });

		const nameField = fields.createDiv({ cls: "epub-custom-translation-panel__field" });
		nameField.createDiv({
			cls: "epub-custom-translation-panel__field-label",
			text: t("epub.settings.basic.customTranslationName"),
		});
		const nameInput = nameField.createEl("input", {
			cls: "epub-custom-translation-panel__input",
			type: "text",
			placeholder: t("epub.settings.basic.customTranslationNamePlaceholder"),
		});
		nameInput.value = customProvider.name;

		const handleNameInput = () => {
			void callbacks.updateCustomTranslationProviderDraft(index, { name: nameInput.value });
		};
		const handleNameCommit = () => {
			void callbacks.commitCustomTranslationProviderDrafts();
		};
		const handleNameKeydown = (event: KeyboardEvent) => {
			if (event.key === "Enter") {
				event.preventDefault();
				void callbacks.commitCustomTranslationProviderDrafts();
				nameInput.blur();
			}
		};
		nameInput.addEventListener("input", handleNameInput);
		nameInput.addEventListener("blur", handleNameCommit);
		nameInput.addEventListener("keydown", handleNameKeydown);
		cleanupFns.push(() => nameInput.removeEventListener("input", handleNameInput));
		cleanupFns.push(() => nameInput.removeEventListener("blur", handleNameCommit));
		cleanupFns.push(() => nameInput.removeEventListener("keydown", handleNameKeydown));

		const urlField = fields.createDiv({ cls: "epub-custom-translation-panel__field" });
		urlField.createDiv({
			cls: "epub-custom-translation-panel__field-label",
			text: t("epub.settings.basic.customTranslationUrl"),
		});
		const urlInput = urlField.createEl("input", {
			cls: "epub-custom-translation-panel__input",
			type: "text",
			placeholder: "https://example.com/search?q={query}",
		});
		urlInput.value = customProvider.urlTemplate;

		const handleUrlInput = () => {
			void callbacks.updateCustomTranslationProviderDraft(index, { urlTemplate: urlInput.value });
		};
		const handleUrlCommit = () => {
			void callbacks.commitCustomTranslationProviderDrafts();
		};
		const handleUrlKeydown = (event: KeyboardEvent) => {
			if (event.key === "Enter") {
				event.preventDefault();
				void callbacks.commitCustomTranslationProviderDrafts();
				urlInput.blur();
			}
		};
		urlInput.addEventListener("input", handleUrlInput);
		urlInput.addEventListener("blur", handleUrlCommit);
		urlInput.addEventListener("keydown", handleUrlKeydown);
		cleanupFns.push(() => urlInput.removeEventListener("input", handleUrlInput));
		cleanupFns.push(() => urlInput.removeEventListener("blur", handleUrlCommit));
		cleanupFns.push(() => urlInput.removeEventListener("keydown", handleUrlKeydown));

		const actions = row.createDiv({ cls: "epub-custom-translation-panel__actions" });
		const toggleHost = actions.createDiv({ cls: "epub-custom-translation-panel__toggle" });
		const toggle = new ToggleComponent(toggleHost);
		toggle.setValue(customProvider.enabled);
		toggle.onChange(async (value) => {
			await callbacks.updateCustomTranslationProvider(index, { enabled: value });
		});

		const removeButton = actions.createEl("button", {
			cls: "epub-custom-translation-panel__remove",
			text: t("epub.settings.basic.removeCustomTranslationProvider"),
		});
		const handleRemove = () => {
			void callbacks.removeCustomTranslationProvider(index);
		};
		removeButton.addEventListener("click", handleRemove);
		cleanupFns.push(() => removeButton.removeEventListener("click", handleRemove));
	});

	const footer = panel.createDiv({ cls: "epub-custom-translation-panel__footer" });
	const addButton = footer.createEl("button", {
		cls: "mod-cta epub-custom-translation-panel__add",
		text: t("epub.settings.basic.addCustomTranslationProvider"),
	});
	const handleAdd = () => {
		void callbacks.addCustomTranslationProvider();
	};
	addButton.addEventListener("click", handleAdd);
	cleanupFns.push(() => addButton.removeEventListener("click", handleAdd));
}

export function mountEpubBasicSettings(options: EpubBasicSettingsMountOptions): SettingsCleanupFn {
	const { plugin, t, hosts, snapshot, callbacks } = options;
	const cleanupFns: SettingsCleanupFn[] = [];

	clearHosts(hosts);

	new Setting(hosts.interface)
		.setName(t("epub.settings.basic.interfaceLanguage"))
		.setDesc(t("epub.settings.basic.interfaceLanguageDesc"))
		.setClass("epub-interface-language-setting")
		.addDropdown((dropdown) => {
			for (const option of INTERFACE_LANGUAGE_OPTIONS) {
				dropdown.addOption(option.value, t(option.labelKey));
			}
			dropdown.setValue(snapshot.interfaceLanguageValue);
			dropdown.onChange(async (value) => {
				await callbacks.updateInterfaceLanguage(value as InterfaceLanguagePreference);
			});
		});

	new Setting(hosts.premiumPreview)
		.setName(t("epub.settings.basic.showPremiumPreview"))
		.setDesc(t("epub.settings.basic.showPremiumPreviewDesc"))
		.setClass("epub-premium-preview-toggle-setting")
		.addToggle((toggle) => {
			toggle.setValue(snapshot.premiumPreviewEnabled);
			toggle.onChange(async (value) => {
				await callbacks.updatePremiumPreview(value);
			});
		});

	const zenCommands = listObsidianCommands(plugin.app);
	const zenActions = snapshot.zenFabActions;
	if (zenCommands.length === 0) {
		new Setting(hosts.zenFab).setDesc(t("epub.settings.basic.zenFabNoCommands"));
	} else {
		for (const action of zenActions) {
			const matchedCommand =
				zenCommands.find((command) => command.id === action.commandId) ?? null;
			const commandIcon = obsidianCommandIcon(matchedCommand);
			const setting = new Setting(hosts.zenFab)
				.setClass("epub-zen-fab-command-setting")
				.setName(t("epub.settings.basic.zenFabActionCommand"));
			if (commandIcon) {
				const iconEl = setting.nameEl.createSpan({ cls: "epub-zen-fab-command-icon" });
				setIcon(iconEl, commandIcon);
				setting.nameEl.prepend(iconEl);
			}
			setting.addDropdown((dropdown) => {
					const known = zenCommands.some((command) => command.id === action.commandId);
					if (!known) {
						dropdown.addOption(action.commandId, action.commandId);
					}
					for (const command of zenCommands) {
						dropdown.addOption(command.id, command.name);
					}
					dropdown.setValue(action.commandId);
					dropdown.onChange(async (value) => {
						await callbacks.updateZenFabActionCommand(action.id, value);
					});
				})
				.addExtraButton((button) => {
					button
						.setIcon("trash")
						.setTooltip(t("epub.settings.basic.zenFabRemoveAction"))
						.onClick(() => {
							void callbacks.removeZenFabAction(action.id);
						});
				});
		}

		if (zenActions.length < MAX_ZEN_FAB_ACTIONS) {
			new Setting(hosts.zenFab).addButton((button) => {
				button
					.setButtonText(t("epub.settings.basic.zenFabAddAction"))
					.setCta()
					.onClick(() => {
						void callbacks.addZenFabAction(zenCommands[0]?.id ?? "");
					});
			});
		}
	}

	new Setting(hosts.selectionToolbar)
		.setName(t("epub.settings.basic.hideSelectionCreateCard"))
		.setDesc(t("epub.settings.basic.hideSelectionCreateCardDesc"))
		.setClass("epub-selection-toolbar-create-card-setting")
		.addToggle((toggle) => {
			toggle.setValue(snapshot.selectionToolbarSettings.items.createCard?.hidden === true);
			toggle.onChange(async (value) => {
				await callbacks.updateSelectionToolbarItemHidden("createCard", value);
			});
		});

	const bookmarkFolderSetting = new Setting(hosts.reading)
		.setName(t("epub.settings.basic.bookmarkFolder"))
		.setDesc(t("epub.settings.basic.bookmarkFolderDesc"))
		.setClass("epub-bookmark-setting");

	mountFolderSearchSetting({
		setting: bookmarkFolderSetting,
		placeholder: t("epub.settings.basic.bookmarkFolderPlaceholder"),
		value: snapshot.bookmarkFolderValue,
		onInput: callbacks.setBookmarkFolderInput,
		onCommit: callbacks.updateBookmarkFolder,
		onEscape: () => snapshot.bookmarkFolderValue,
		app: plugin.app,
		cleanupFns,
	});

	const exportTemplateFolderSetting = new Setting(hosts.reading)
		.setName(t("epub.settings.basic.bookNotesExportTemplateFolder"))
		.setDesc(t("epub.settings.basic.bookNotesExportTemplateFolderDesc"))
		.setClass("epub-export-template-folder-setting");

	mountFolderSearchSetting({
		setting: exportTemplateFolderSetting,
		placeholder: t("epub.settings.basic.bookNotesExportTemplateFolderPlaceholder"),
		value: snapshot.bookNotesExportTemplateFolderValue,
		onInput: callbacks.setBookNotesExportTemplateFolderInput,
		onCommit: callbacks.updateBookNotesExportTemplateFolder,
		onEscape: () => snapshot.bookNotesExportTemplateFolderValue,
		app: plugin.app,
		cleanupFns,
	});

	const exportTemplateSetting = new Setting(hosts.reading)
		.setName(t("epub.settings.basic.exportTemplate"))
		.setDesc(t("epub.settings.basic.exportTemplateDesc"))
		.setClass("epub-export-template-select-setting");

	exportTemplateSetting.addDropdown((dropdown) => {
		dropdown.addOption("", t("epub.reader.exportNotesPopover.templateLoading"));
		dropdown.setDisabled(true);

		void (async () => {
			const templates = await listBookNotesExportTemplateFiles(
				plugin.app,
				snapshot.bookNotesExportTemplateFolderValue
			);

			dropdown.selectEl.empty();
			const selectedPath = String(snapshot.bookNotesExportDefaultTemplatePath || "").trim();
			const optionPaths = new Set<string>();

			if (templates.length === 0) {
				dropdown.addOption("", t("epub.reader.exportNotesPopover.templateEmpty"));
				dropdown.addOption(
					EXPORT_TEMPLATE_MANAGE_OPTION,
					t("epub.settings.basic.manageExportTemplates")
				);
				dropdown.setValue(EXPORT_TEMPLATE_MANAGE_OPTION);
				dropdown.setDisabled(false);
				dropdown.onChange((value) => {
					if (value !== EXPORT_TEMPLATE_MANAGE_OPTION) {
						return;
					}
					dropdown.setValue(EXPORT_TEMPLATE_MANAGE_OPTION);
					callbacks.openBookNotesExportTemplateModal();
				});
				return;
			}

			for (const item of templates) {
				dropdown.addOption(item.path, getVaultFileBasename(item.fileName));
				optionPaths.add(item.path);
			}
			if (selectedPath && !optionPaths.has(selectedPath)) {
				dropdown.addOption(selectedPath, getVaultFileBasename(selectedPath));
				optionPaths.add(selectedPath);
			}
			dropdown.addOption(
				EXPORT_TEMPLATE_MANAGE_OPTION,
				t("epub.settings.basic.manageExportTemplates")
			);

			let activeTemplatePath =
				selectedPath && optionPaths.has(selectedPath) ? selectedPath : templates[0]?.path || "";
			dropdown.setValue(activeTemplatePath);
			dropdown.setDisabled(false);
			dropdown.onChange(async (value) => {
				if (value === EXPORT_TEMPLATE_MANAGE_OPTION) {
					dropdown.setValue(activeTemplatePath);
					callbacks.openBookNotesExportTemplateModal();
					return;
				}
				activeTemplatePath = value;
				await callbacks.updateBookNotesExportTemplatePath(value);
			});
		})();
	});

	for (const builtin of BUILTIN_WEB_TRANSLATION_PROVIDERS) {
		const builtinEnabled = isBuiltinTranslationEnabled(
			snapshot.selectionTranslationSettings,
			builtin.id
		);
		new Setting(hosts.selectionTranslation)
			.setName(t(`epub.translationProviders.${builtin.nameKey}`))
			.setClass("epub-selection-translation-builtin-setting")
			.addToggle((toggle) => {
				toggle.setValue(builtinEnabled);
				toggle.onChange(async (value) => {
					await callbacks.setBuiltinTranslationProviderEnabled(builtin.id, value);
				});
			});
	}

	renderCustomTranslationProvidersPanel(options, cleanupFns);

	new Setting(hosts.diagnostics)
		.setName(t("epub.settings.basic.sourceNavigationOpenInNewTab"))
		.setDesc(t("epub.settings.basic.sourceNavigationOpenInNewTabDesc"))
		.setClass("epub-source-navigation-setting")
		.addToggle((toggle) => {
			toggle.setValue(snapshot.sourceNavigationOpenInNewTab);
			toggle.onChange(async (value) => {
				await callbacks.updateSourceNavigationOpenInNewTab(value);
			});
		});

	new Setting(hosts.diagnostics)
		.setName(t("epub.settings.basic.rebuildHighlightIndex"))
		.setDesc(t("epub.settings.basic.rebuildHighlightIndexDesc"))
		.setClass("epub-rebuild-highlight-index-setting")
		.addButton((button) => {
			button.setButtonText(t("epub.settings.basic.rebuildHighlightIndexAction"));
			button.onClick(async () => {
				button.setDisabled(true);
				try {
					const service = getEpubBacklinkHighlightService(plugin.app);
					await service.rebuildHighlightIndexes();
					scheduleEpubAnnotationIndexWarmup(plugin.app, 2_000, { forceAll: true });
					showNotification(t("epub.settings.basic.rebuildHighlightIndexSuccess"), "success");
				} catch (error) {
					console.error("[EpubSettings] rebuild highlight index failed:", error);
					showNotification(t("epub.settings.basic.rebuildHighlightIndexFailed"), "error");
				} finally {
					button.setDisabled(false);
				}
			});
		});

	new Setting(hosts.diagnostics)
		.setName(t("epub.settings.basic.debugMode"))
		.setDesc(t("epub.settings.basic.debugModeDesc"))
		.setClass("epub-debug-setting")
		.addToggle((toggle) => {
			toggle.setValue(snapshot.debugModeEnabled);
			toggle.onChange(async (value) => {
				await callbacks.updateDebugMode(value);
			});
		});

	return () => {
		cleanupFns.forEach((cleanup) => cleanup());
		clearHosts(hosts);
	};
}
