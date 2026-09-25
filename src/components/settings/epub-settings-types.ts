import type {
	CustomWebTranslationProvider,
	SelectionTranslationSettings,
} from "../../config/selection-translation-settings";
import type {
	SelectionToolbarItemId,
	SelectionToolbarSettings,
} from "../../config/selection-toolbar-settings";
import type { InterfaceLanguagePreference } from "../../utils/i18n";
import type StandaloneEpubPlugin from "../../main";

export type EpubSettingsTabId = "basic" | "license" | "about";

export type SettingsCleanupFn = () => void;

export type EpubSettingsTranslateFn = (
	key: string,
	params?: Record<string, string | number>
) => string;

export interface EpubBasicSettingsHosts {
	interface: HTMLElement;
	premiumPreview: HTMLElement;
	reading: HTMLElement;
	selectionToolbar: HTMLElement;
	selectionTranslation: HTMLElement;
	diagnostics: HTMLElement;
}

export interface EpubBasicSettingsSnapshot {
	interfaceLanguageValue: InterfaceLanguagePreference;
	premiumPreviewEnabled: boolean;
	bookmarkFolderValue: string;
	bookmarkFolderInput: string;
	bookNotesExportTemplateFolderValue: string;
	bookNotesExportTemplateFolderInput: string;
	bookNotesExportDefaultTemplatePath: string;
	sourceNavigationOpenInNewTab: boolean;
	debugModeEnabled: boolean;
	selectionToolbarSettings: SelectionToolbarSettings;
	selectionTranslationSettings: SelectionTranslationSettings;
	customTranslationProviderDrafts: CustomWebTranslationProvider[];
}

export interface EpubBasicSettingsCallbacks {
	save: () => Promise<void>;
	setBookmarkFolderInput: (value: string) => void;
	setBookNotesExportTemplateFolderInput: (value: string) => void;
	updateBookmarkFolder: (folderPath: string) => Promise<void>;
	updateInterfaceLanguage: (value: InterfaceLanguagePreference) => Promise<void>;
	updatePremiumPreview: (enabled: boolean) => Promise<void>;
	updateBookNotesExportTemplatePath: (templatePath: string) => Promise<void>;
	updateBookNotesExportTemplateFolder: (folderPath: string) => Promise<void>;
	openBookNotesExportTemplateModal: () => void;
	setBuiltinTranslationProviderEnabled: (providerId: string, enabled: boolean) => Promise<void>;
	updateCustomTranslationProvider: (
		index: number,
		patch: Partial<CustomWebTranslationProvider>
	) => Promise<void>;
	updateCustomTranslationProviderDraft: (
		index: number,
		patch: Partial<CustomWebTranslationProvider>
	) => Promise<void>;
	commitCustomTranslationProviderDrafts: () => Promise<void>;
	addCustomTranslationProvider: () => Promise<void>;
	removeCustomTranslationProvider: (index: number) => Promise<void>;
	updateSelectionToolbarItemHidden: (
		itemId: SelectionToolbarItemId,
		hidden: boolean
	) => Promise<void>;
	updateSourceNavigationOpenInNewTab: (enabled: boolean) => Promise<void>;
	updateDebugMode: (enabled: boolean) => Promise<void>;
}

export interface EpubBasicSettingsMountOptions {
	plugin: StandaloneEpubPlugin;
	t: EpubSettingsTranslateFn;
	hosts: EpubBasicSettingsHosts;
	snapshot: EpubBasicSettingsSnapshot;
	callbacks: EpubBasicSettingsCallbacks;
}
