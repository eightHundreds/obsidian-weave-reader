<script lang="ts">
	import { setIcon } from 'obsidian';
	import { tr } from '../../utils/i18n';

	interface ZenAction {
		icon: string;
		label: string;
		action: () => void;
	}

	interface Props {
		isOpen?: boolean;
		onToggle: () => void;
		onExitZen: () => void;
		customActions?: ZenAction[];
		resolveCustomActions?: () => ZenAction[];
	}

	let { isOpen = $bindable(false), onToggle, onExitZen, customActions = [], resolveCustomActions }: Props = $props();
	let t = $derived($tr);

	let fabEl: HTMLButtonElement | undefined = $state(undefined);
	let actionsEl: HTMLDivElement | undefined = $state(undefined);

	function icon(node: HTMLElement, name: string) {
		setIcon(node, name);
		return {
			update(newName: string) {
				node.replaceChildren();
				setIcon(node, newName);
			},
		};
	}

	let openedCustomActions = $state<ZenAction[]>([]);

	function handleToggle() {
		if (!isOpen) {
			openedCustomActions = resolveCustomActions?.() ?? customActions;
		}
		isOpen = !isOpen;
		onToggle();
	}

	function handleExitZen() {
		isOpen = false;
		onExitZen();
	}

	const defaultActions = $derived<ZenAction[]>([
		{
			icon: 'x',
			label: t('views.epubView.menu.zenModeExit'),
			action: handleExitZen,
		},
	]);

	const allActions = $derived([...openedCustomActions, ...defaultActions]);
</script>

<div class="weave-epub-zen-fab-container">
	{#if isOpen}
		<div class="weave-epub-zen-actions" class:is-visible={isOpen} bind:this={actionsEl}>
			{#each allActions as action}
				<button
					class="weave-epub-zen-action"
					onclick={action.action}
					aria-label={action.label}
				>
					<div class="weave-epub-zen-action-icon" use:icon={action.icon}></div>
					<span class="weave-epub-zen-action-label">{action.label}</span>
				</button>
			{/each}
		</div>
	{/if}

	<button
		class="weave-epub-zen-fab"
		class:is-open={isOpen}
		onclick={handleToggle}
		bind:this={fabEl}
		aria-label={isOpen ? t('views.epubView.menu.zenModeCloseMenu') : t('views.epubView.menu.zenModeOpenMenu')}
	>
		<div use:icon={isOpen ? 'x' : 'more-horizontal'}></div>
	</button>
</div>

<style>
	.weave-epub-zen-fab-container {
		position: fixed;
		bottom: 0;
		right: 0;
		z-index: 1000;
	}
</style>
