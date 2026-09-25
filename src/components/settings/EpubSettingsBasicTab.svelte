<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { normalizeSelectionTranslationSettings } from "../../config/selection-translation-settings";
  import { normalizeSelectionToolbarSettings } from "../../config/selection-toolbar-settings";
  import { normalizeZenFabActions } from "../../config/zen-fab-actions";
  import { EPUB_RUNTIME, normalizeEpubBookmarkFolderPath } from "../../services/epub";
  import type { CustomWebTranslationProvider } from "../../config/selection-translation-settings";
  import { normalizeInterfaceLanguagePreference, tr } from "../../utils/i18n";
  import type StandaloneEpubPlugin from "../../main";
  import { createEpubBasicSettingsActions } from "./epub-basic-settings-actions";
  import { mountEpubBasicSettings } from "./mount-epub-basic-settings";

  interface Props {
    plugin: StandaloneEpubPlugin;
  }

  let { plugin }: Props = $props();
  let t = $derived($tr);

  let stateVersion = $state(0);
  let excerptSettingsVersion = $state(0);
  let interfaceSettingsHost = $state<HTMLDivElement | null>(null);
  let premiumPreviewSettingsHost = $state<HTMLDivElement | null>(null);
  let readingSettingsHost = $state<HTMLDivElement | null>(null);
  let selectionToolbarSettingsHost = $state<HTMLDivElement | null>(null);
  let selectionTranslationSettingsHost = $state<HTMLDivElement | null>(null);
  let diagnosticsSettingsHost = $state<HTMLDivElement | null>(null);
  let zenFabSettingsHost = $state<HTMLDivElement | null>(null);

  let bookmarkFolderInput = $state("");
  let bookNotesExportTemplateFolderInput = $state("");
  let bookNotesExportTemplateFolderValue = $state("");
  let bookNotesExportDefaultTemplatePath = $state("");
  let excerptFolderSettingsLoaded = $state(false);
  let customTranslationProviderDrafts = $state<CustomWebTranslationProvider[]>([]);

  async function save(): Promise<void> {
    await plugin.saveSettings();
    stateVersion += 1;
  }

  let bookmarkFolderValue = $derived.by(() => {
    stateVersion;
    return normalizeEpubBookmarkFolderPath(plugin.settings?.bookmarkFolder);
  });

  let debugModeEnabled = $derived.by(() => {
    stateVersion;
    return plugin.settings?.enableDebugMode === true;
  });

  let sourceNavigationOpenInNewTab = $derived.by(() => {
    stateVersion;
    return plugin.settings?.sourceNavigationOpenInNewTab !== false;
  });

  let premiumPreviewEnabled = $derived.by(() => {
    stateVersion;
    return plugin.settings?.showPremiumFeaturesPreview === true;
  });

  let interfaceLanguageValue = $derived.by(() => {
    stateVersion;
    return normalizeInterfaceLanguagePreference(plugin.settings?.interfaceLanguage);
  });

  let selectionTranslationSettings = $derived.by(() => {
    stateVersion;
    return normalizeSelectionTranslationSettings(plugin.settings?.selectionTranslation);
  });

  let selectionToolbarSettings = $derived.by(() => {
    stateVersion;
    return normalizeSelectionToolbarSettings(plugin.settings?.selectionToolbar);
  });

  let zenFabActions = $derived.by(() => {
    stateVersion;
    return normalizeZenFabActions(plugin.settings?.zenFabActions);
  });

  let selectionToolbarCreateCardHidden = $derived(
    selectionToolbarSettings.items.createCard?.hidden === true
  );

  let selectionTranslationCustomProviderCount = $derived.by(() => {
    stateVersion;
    return selectionTranslationSettings.customProviders.length;
  });

  function updateCustomTranslationProviderDraft(
    index: number,
    patch: Partial<CustomWebTranslationProvider>
  ): void {
    customTranslationProviderDrafts = customTranslationProviderDrafts.map((provider, providerIndex) =>
      providerIndex === index ? { ...provider, ...patch } : provider
    );
  }

  const actions = createEpubBasicSettingsActions({
    plugin,
    getTranslate: () => t,
    getBookmarkFolderValue: () => bookmarkFolderValue,
    getInterfaceLanguageValue: () => interfaceLanguageValue,
    getPremiumPreviewEnabled: () => premiumPreviewEnabled,
    getSourceNavigationOpenInNewTab: () => sourceNavigationOpenInNewTab,
    getDebugModeEnabled: () => debugModeEnabled,
    getBookNotesExportTemplateFolderValue: () => bookNotesExportTemplateFolderValue,
    getBookNotesExportDefaultTemplatePath: () => bookNotesExportDefaultTemplatePath,
    getCustomTranslationProviderDrafts: () => customTranslationProviderDrafts,
    setBookmarkFolderInput: (value) => {
      bookmarkFolderInput = value;
    },
    setBookNotesExportTemplateFolderInput: (value) => {
      bookNotesExportTemplateFolderInput = value;
    },
    setBookNotesExportTemplateFolderValue: (value) => {
      bookNotesExportTemplateFolderValue = value;
    },
    setBookNotesExportDefaultTemplatePath: (value) => {
      bookNotesExportDefaultTemplatePath = value;
    },
    setExcerptSettingsVersion: (updater) => {
      excerptSettingsVersion = updater(excerptSettingsVersion);
    },
    save,
  });

  $effect(() => {
    bookmarkFolderValue;
    bookmarkFolderInput = bookmarkFolderValue;
  });

  $effect(() => {
    selectionTranslationCustomProviderCount;
    customTranslationProviderDrafts = structuredClone(
      normalizeSelectionTranslationSettings(plugin.settings?.selectionTranslation).customProviders
    );
  });

  onMount(() => {
    void (async () => {
      await actions.refreshBookNotesExportTemplateFolder();
      excerptFolderSettingsLoaded = true;
    })();
    const handleExcerptSettingsChanged = () => {
      void actions.refreshBookNotesExportTemplateFolder();
    };
    if (typeof window !== "undefined") {
      window.addEventListener(
        EPUB_RUNTIME.events.excerptSettingsChanged,
        handleExcerptSettingsChanged
      );
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener(
          EPUB_RUNTIME.events.excerptSettingsChanged,
          handleExcerptSettingsChanged
        );
      }
    };
  });

  $effect(() => {
    if (
      !excerptFolderSettingsLoaded
      || !interfaceSettingsHost
      || !premiumPreviewSettingsHost
      || !readingSettingsHost
      || !selectionToolbarSettingsHost
      || !selectionTranslationSettingsHost
      || !diagnosticsSettingsHost
      || !zenFabSettingsHost
    ) {
      return;
    }

    excerptSettingsVersion;
    t;
    selectionToolbarCreateCardHidden;
    selectionTranslationCustomProviderCount;
    zenFabActions;

    let dispose: (() => void) | undefined;

    untrack(() => {
      dispose = mountEpubBasicSettings({
        plugin,
        t,
        hosts: {
          interface: interfaceSettingsHost,
          premiumPreview: premiumPreviewSettingsHost,
          reading: readingSettingsHost,
          selectionToolbar: selectionToolbarSettingsHost,
          selectionTranslation: selectionTranslationSettingsHost,
          diagnostics: diagnosticsSettingsHost,
          zenFab: zenFabSettingsHost,
        },
        snapshot: {
          interfaceLanguageValue,
          premiumPreviewEnabled,
          bookmarkFolderValue,
          bookmarkFolderInput,
          bookNotesExportTemplateFolderValue,
          bookNotesExportTemplateFolderInput,
          bookNotesExportDefaultTemplatePath,
          sourceNavigationOpenInNewTab,
          debugModeEnabled,
          selectionToolbarSettings,
          selectionTranslationSettings,
          customTranslationProviderDrafts,
          zenFabActions,
        },
        callbacks: {
          save,
          setBookmarkFolderInput: (value) => {
            bookmarkFolderInput = value;
          },
          setBookNotesExportTemplateFolderInput: (value) => {
            bookNotesExportTemplateFolderInput = value;
          },
          updateBookmarkFolder: actions.updateBookmarkFolder,
          updateInterfaceLanguage: actions.updateInterfaceLanguage,
          updatePremiumPreview: actions.updatePremiumPreview,
          updateBookNotesExportTemplatePath: actions.updateBookNotesExportTemplatePath,
          updateBookNotesExportTemplateFolder: actions.updateBookNotesExportTemplateFolder,
          openBookNotesExportTemplateModal: actions.openBookNotesExportTemplateModal,
          setBuiltinTranslationProviderEnabled: actions.setBuiltinTranslationProviderEnabled,
          updateCustomTranslationProvider: actions.updateCustomTranslationProvider,
          updateCustomTranslationProviderDraft,
          commitCustomTranslationProviderDrafts: actions.commitCustomTranslationProviderDrafts,
          addCustomTranslationProvider: actions.addCustomTranslationProvider,
          removeCustomTranslationProvider: actions.removeCustomTranslationProvider,
          updateSelectionToolbarItemHidden: actions.updateSelectionToolbarItemHidden,
          updateSourceNavigationOpenInNewTab: actions.updateSourceNavigationOpenInNewTab,
          updateDebugMode: actions.updateDebugMode,
          addZenFabAction: actions.addZenFabAction,
          updateZenFabActionCommand: actions.updateZenFabActionCommand,
          removeZenFabAction: actions.removeZenFabAction,
        },
      });
    });

    return () => dispose?.();
  });
</script>

<section class="epub-settings-section epub-settings-section--compact">
  <div class="epub-settings-group epub-settings-group--panel epub-settings-group--preview-first">
    <div class="epub-settings-group-header">
      <h3 class="epub-settings-group-title with-accent-bar accent-cyan">{t("epub.settings.groups.interface")}</h3>
    </div>
    <div bind:this={interfaceSettingsHost} class="epub-native-settings-host"></div>
  </div>

  <div class="epub-settings-group epub-settings-group--panel">
    <div class="epub-settings-group-header">
      <h3 class="epub-settings-group-title with-accent-bar accent-purple">{t("epub.settings.groups.premiumPreview")}</h3>
    </div>
    <div bind:this={premiumPreviewSettingsHost} class="epub-native-settings-host"></div>
  </div>

  <div class="epub-settings-group epub-settings-group--panel">
    <div class="epub-settings-group-header">
      <h3 class="epub-settings-group-title with-accent-bar accent-purple">{t("epub.settings.groups.reading")}</h3>
    </div>
    <div bind:this={readingSettingsHost} class="epub-native-settings-host"></div>
  </div>

  <div class="epub-settings-group epub-settings-group--panel">
    <div class="epub-settings-group-header">
      <h3 class="epub-settings-group-title with-accent-bar accent-purple">{t("epub.settings.groups.selectionToolbar")}</h3>
      <p class="epub-settings-group-description">{t("epub.settings.basic.selectionToolbarDesc")}</p>
    </div>
    <div bind:this={selectionToolbarSettingsHost} class="epub-native-settings-host"></div>
  </div>

  <div class="epub-settings-group epub-settings-group--panel">
    <div class="epub-settings-group-header">
      <h3 class="epub-settings-group-title with-accent-bar accent-cyan">{t("epub.settings.groups.selectionTranslation")}</h3>
      <p class="epub-settings-group-description">{t("epub.settings.basic.selectionTranslationDesc")}</p>
    </div>
    <div bind:this={selectionTranslationSettingsHost} class="epub-native-settings-host"></div>
  </div>

  <div class="epub-settings-group epub-settings-group--panel">
    <div class="epub-settings-group-header">
      <h3 class="epub-settings-group-title with-accent-bar accent-purple">{t("epub.settings.groups.zenMode")}</h3>
      <p class="epub-settings-group-description">{t("epub.settings.basic.zenFabActionsDesc")}</p>
    </div>
    <div bind:this={zenFabSettingsHost} class="epub-native-settings-host"></div>
  </div>

  <div class="epub-settings-group epub-settings-group--panel">
    <div class="epub-settings-group-header">
      <h3 class="epub-settings-group-title with-accent-bar accent-cyan">{t("epub.settings.groups.diagnostics")}</h3>
    </div>
    <div bind:this={diagnosticsSettingsHost} class="epub-native-settings-host"></div>
  </div>
</section>
