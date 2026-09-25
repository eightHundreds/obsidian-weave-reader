import { domInstanceOf } from "../../utils/dom-instance-of";

export type ToolbarMode = "floating" | "docked";

export type FloatingSidePreference = "top" | "bottom" | "auto";
export type FloatingAlign = "center" | "start" | "end";

export interface ToolbarRect {
	top: number;
	left: number;
	bottom: number;
	right: number;
	width: number;
	height: number;
}

export interface ToolbarPoint {
	x: number;
	y: number;
}

export interface ToolbarPositionResult {
	top: number;
	left: number;
	arrowOffset: number;
	isBelowAnchor: boolean;
	mode: ToolbarMode;
	anchorRect: ToolbarRect;
}

export interface ToolbarPositionOptions {
	anchorRect: ToolbarRect;
	anchorRects?: ToolbarRect[];
	anchorPoint?: ToolbarPoint;
	containerWidth: number;
	containerHeight: number;
	toolbarWidth: number;
	toolbarHeight: number;
	mobile: boolean;
	insetTop?: number;
	insetBottom?: number;
	/** Width of content hanging outside the toolbar's left edge (e.g. color chips). */
	leadingOverflow?: number;
	edgeMargin?: number;
	gap?: number;
	arrowPadding?: number;
	preferredSide?: FloatingSidePreference;
	align?: FloatingAlign;
}

export const TOOLBAR_EDGE_MARGIN = 12;
export const TOOLBAR_GAP = 12;
export const TOOLBAR_ARROW_PADDING = 18;
export const NATIVE_SELECTION_MENU_HEIGHT = 48;
export const MOBILE_FLOATING_BOTTOM_BASE_INSET = 16;

export type NativeSelectionMenuSide = "above" | "below";

export function resolveMobileFloatingInsetBottom(mobileDockBottomOffset = 0): number {
	return mobileDockBottomOffset + MOBILE_FLOATING_BOTTOM_BASE_INSET;
}

/** Mirrors iOS/Android behavior: native menu prefers above the selection when space allows. */
export function estimateNativeSelectionMenuSide(
	anchorRect: ToolbarRect,
	containerHeight: number,
	edgeMargin = TOOLBAR_EDGE_MARGIN,
	nativeMenuHeight = NATIVE_SELECTION_MENU_HEIGHT
): NativeSelectionMenuSide {
	const spaceAbove = anchorRect.top - edgeMargin;
	const spaceBelow = containerHeight - anchorRect.bottom - edgeMargin;

	if (spaceAbove >= nativeMenuHeight) {
		return "above";
	}
	if (spaceBelow >= nativeMenuHeight) {
		return "below";
	}
	return spaceAbove >= spaceBelow ? "above" : "below";
}

export function mirrorFloatingSide(nativeMenuSide: NativeSelectionMenuSide): "top" | "bottom" {
	return nativeMenuSide === "above" ? "bottom" : "top";
}

function clamp(value: number, min: number, max: number) {
	if (max < min) {
		return min;
	}
	return Math.min(Math.max(value, min), max);
}

function getRectCenterX(rect: ToolbarRect): number {
	return rect.left + rect.width / 2;
}

function normalizeAnchorRects(anchorRect: ToolbarRect, anchorRects?: ToolbarRect[]): ToolbarRect[] {
	const normalized = (anchorRects || []).filter(
		(rect) =>
			Number.isFinite(rect.left) &&
			Number.isFinite(rect.top) &&
			Number.isFinite(rect.right) &&
			Number.isFinite(rect.bottom) &&
			rect.width > 0 &&
			rect.height > 0
	);
	return normalized.length ? normalized : [anchorRect];
}

function intersectsContainer(rect: ToolbarRect, containerWidth: number, containerHeight: number): boolean {
	return rect.right > 0 && rect.left < containerWidth && rect.bottom > 0 && rect.top < containerHeight;
}

function unionRects(rects: ToolbarRect[]): ToolbarRect {
	const top = Math.min(...rects.map((rect) => rect.top));
	const left = Math.min(...rects.map((rect) => rect.left));
	const bottom = Math.max(...rects.map((rect) => rect.bottom));
	const right = Math.max(...rects.map((rect) => rect.right));
	return { top, left, bottom, right, width: right - left, height: bottom - top };
}

function chooseFloatingSide(
	anchorRect: ToolbarRect,
	containerHeight: number,
	toolbarHeight: number,
	gap: number,
	edgeMargin: number,
	insetTop: number,
	insetBottom: number,
	preferredSide: FloatingSidePreference
): "top" | "bottom" {
	const availableAbove = anchorRect.top - gap - edgeMargin - insetTop;
	const availableBelow = containerHeight - insetBottom - anchorRect.bottom - gap - edgeMargin;

	if (preferredSide === "bottom") {
		return availableBelow >= toolbarHeight || availableBelow >= availableAbove ? "bottom" : "top";
	}

	return availableAbove >= toolbarHeight || availableAbove >= availableBelow ? "top" : "bottom";
}

function chooseAnchorRectForSide(
	rects: ToolbarRect[],
	side: "top" | "bottom",
	anchorPoint?: ToolbarPoint
): ToolbarRect {
	if (rects.length <= 1) {
		return rects[0];
	}

	const edgeValue = side === "top"
		? Math.min(...rects.map((rect) => rect.top))
		: Math.max(...rects.map((rect) => rect.bottom));
	const edgeRects = rects.filter((rect) =>
		side === "top"
			? Math.abs(rect.top - edgeValue) < 0.5
			: Math.abs(rect.bottom - edgeValue) < 0.5
	);
	if (edgeRects.length <= 1) {
		return edgeRects[0] || rects[0];
	}

	if (anchorPoint && Number.isFinite(anchorPoint.x)) {
		return edgeRects.reduce((best, current) => {
			const bestDistance = Math.abs(getRectCenterX(best) - anchorPoint.x);
			const currentDistance = Math.abs(getRectCenterX(current) - anchorPoint.x);
			return currentDistance < bestDistance ? current : best;
		});
	}

	return edgeRects.reduce((best, current) => {
		return getRectCenterX(current) < getRectCenterX(best) ? current : best;
	});
}

function getAnchorX(rect: ToolbarRect, anchorPoint: ToolbarPoint | undefined, align: FloatingAlign): number {
	if (align === "start") {
		return rect.left;
	}
	if (align === "end") {
		return rect.right;
	}
	if (anchorPoint && Number.isFinite(anchorPoint.x)) {
		return anchorPoint.x;
	}
	return getRectCenterX(rect);
}

function toolbarOverlapsAnchor(
	top: number,
	toolbarHeight: number,
	anchorRect: ToolbarRect,
	gap: number
): boolean {
	const toolbarBottom = top + toolbarHeight;
	return toolbarBottom > anchorRect.top - gap && top < anchorRect.bottom + gap;
}

function floatingClearsAnchor(
	top: number,
	toolbarHeight: number,
	anchorRect: ToolbarRect,
	gap: number,
	isBelowAnchor: boolean
): boolean {
	if (isBelowAnchor) {
		return top >= anchorRect.bottom + gap - 0.5;
	}
	return top + toolbarHeight <= anchorRect.top - gap + 0.5;
}

function createDockedPosition(left: number, activeAnchorRect: ToolbarRect): ToolbarPositionResult {
	return {
		top: 0,
		left,
		arrowOffset: 0,
		isBelowAnchor: true,
		mode: "docked",
		anchorRect: activeAnchorRect,
	};
}

interface FloatingPlacementInput {
	activeAnchorRect: ToolbarRect;
	anchorX: number;
	left: number;
	side: "top" | "bottom";
	containerHeight: number;
	toolbarWidth: number;
	toolbarHeight: number;
	insetTop: number;
	insetBottom: number;
	edgeMargin: number;
	gap: number;
	arrowPadding: number;
}

function computeFloatingPlacement({
	activeAnchorRect,
	anchorX,
	left,
	side,
	containerHeight,
	toolbarWidth,
	toolbarHeight,
	insetTop,
	insetBottom,
	edgeMargin,
	gap,
	arrowPadding,
}: FloatingPlacementInput): ToolbarPositionResult {
	const isBelowAnchor = side === "bottom";
	const preferredTop = isBelowAnchor
		? activeAnchorRect.bottom + gap
		: activeAnchorRect.top - toolbarHeight - gap;
	const minTop = edgeMargin + insetTop;
	const maxTop = containerHeight - insetBottom - toolbarHeight - edgeMargin;
	const top = clamp(preferredTop, minTop, maxTop);
	const arrowLimit = Math.max(0, toolbarWidth / 2 - arrowPadding);

	return {
		top,
		left,
		arrowOffset: clamp(anchorX - (left + toolbarWidth / 2), -arrowLimit, arrowLimit),
		isBelowAnchor,
		mode: "floating",
		anchorRect: activeAnchorRect,
	};
}

function mobileMirrorSideHasRoom(
	side: "top" | "bottom",
	anchorRect: ToolbarRect,
	containerHeight: number,
	toolbarHeight: number,
	gap: number,
	edgeMargin: number,
	insetTop: number,
	insetBottom: number
): boolean {
	if (side === "bottom") {
		const availableBelow =
			containerHeight - insetBottom - anchorRect.bottom - gap - edgeMargin;
		return availableBelow >= toolbarHeight;
	}

	const availableAbove = anchorRect.top - gap - edgeMargin - insetTop;
	return availableAbove >= toolbarHeight;
}

function toolbarOverlapsNativeMenu(
	top: number,
	toolbarHeight: number,
	anchorRect: ToolbarRect,
	nativeMenuSide: NativeSelectionMenuSide,
	gap: number,
	nativeMenuHeight = NATIVE_SELECTION_MENU_HEIGHT
): boolean {
	const toolbarBottom = top + toolbarHeight;
	if (nativeMenuSide === "above") {
		const nativeZoneBottom = anchorRect.top - gap;
		const nativeZoneTop = nativeZoneBottom - nativeMenuHeight;
		return toolbarBottom > nativeZoneTop && top < nativeZoneBottom;
	}

	const nativeZoneTop = anchorRect.bottom + gap;
	const nativeZoneBottom = nativeZoneTop + nativeMenuHeight;
	return toolbarBottom > nativeZoneTop && top < nativeZoneBottom;
}

function shouldUseMobileDockedFallback(
	floating: ToolbarPositionResult,
	toolbarHeight: number,
	anchorRect: ToolbarRect,
	nativeMenuSide: NativeSelectionMenuSide,
	gap: number
): boolean {
	const ourSide = floating.isBelowAnchor ? "bottom" : "top";
	const nativeOccupiedSide = nativeMenuSide === "above" ? "top" : "bottom";
	if (ourSide === nativeOccupiedSide) {
		return true;
	}

	if (
		!floatingClearsAnchor(
			floating.top,
			toolbarHeight,
			anchorRect,
			gap,
			floating.isBelowAnchor
		)
	) {
		return true;
	}

	if (toolbarOverlapsAnchor(floating.top, toolbarHeight, anchorRect, gap)) {
		return true;
	}

	return toolbarOverlapsNativeMenu(
		floating.top,
		toolbarHeight,
		anchorRect,
		nativeMenuSide,
		gap
	);
}

export function computeToolbarPosition({
	anchorRect,
	anchorRects,
	anchorPoint,
	containerWidth,
	containerHeight,
	toolbarWidth,
	toolbarHeight,
	mobile,
	insetTop = 0,
	insetBottom = 0,
	leadingOverflow = 0,
	edgeMargin = TOOLBAR_EDGE_MARGIN,
	gap = TOOLBAR_GAP,
	arrowPadding = TOOLBAR_ARROW_PADDING,
	preferredSide = "top",
	align = "center",
}: ToolbarPositionOptions): ToolbarPositionResult {
	const allRects = normalizeAnchorRects(anchorRect, anchorRects);
	// Selections spanning a page turn keep line rects in off-screen columns; anchoring to them
	// would pin the toolbar to the viewport edge, pointing at nothing.
	const onScreenRects = allRects.filter((rect) =>
		intersectsContainer(rect, containerWidth, containerHeight)
	);
	if (mobile && onScreenRects.length === 0) {
		return createDockedPosition(
			clamp((containerWidth - toolbarWidth) / 2, edgeMargin, containerWidth - edgeMargin - toolbarWidth),
			anchorRect
		);
	}
	const clipped = onScreenRects.length > 0 && onScreenRects.length < allRects.length;
	const normalizedRects = clipped ? onScreenRects : allRects;
	// The caller's anchor point is derived from the unclipped bounds.
	const effectiveAnchorPoint = clipped ? undefined : anchorPoint;
	const sideSelectionBounds =
		normalizedRects.length > 1 || clipped ? unionRects(normalizedRects) : anchorRect;
	const nativeMenuSide = mobile
		? estimateNativeSelectionMenuSide(sideSelectionBounds, containerHeight, edgeMargin)
		: null;
	const resolvedPreferredSide: FloatingSidePreference = mobile
		? mirrorFloatingSide(nativeMenuSide!)
		: preferredSide;
	const side = mobile
		? resolvedPreferredSide
		: chooseFloatingSide(
			sideSelectionBounds,
			containerHeight,
			toolbarHeight,
			gap,
			edgeMargin,
			insetTop,
			insetBottom,
			resolvedPreferredSide
		);
	const activeAnchorRect = chooseAnchorRectForSide(normalizedRects, side, effectiveAnchorPoint);
	const anchorX = getAnchorX(activeAnchorRect, effectiveAnchorPoint, align);
	const minLeft = edgeMargin + Math.max(0, leadingOverflow);
	const maxLeft = containerWidth - edgeMargin - toolbarWidth;
	const idealLeft = align === "center"
		? anchorX - toolbarWidth / 2
		: align === "end"
			? anchorX - toolbarWidth
			: anchorX;
	const left = clamp(idealLeft, minLeft, maxLeft);

	if (
		mobile &&
		!mobileMirrorSideHasRoom(
			side,
			sideSelectionBounds,
			containerHeight,
			toolbarHeight,
			gap,
			edgeMargin,
			insetTop,
			insetBottom
		)
	) {
		return createDockedPosition(left, activeAnchorRect);
	}

	const floating = computeFloatingPlacement({
		activeAnchorRect,
		anchorX,
		left,
		side,
		containerHeight,
		toolbarWidth,
		toolbarHeight,
		insetTop,
		insetBottom,
		edgeMargin,
		gap,
		arrowPadding,
	});

	if (!mobile) {
		return floating;
	}

	if (
		shouldUseMobileDockedFallback(
			floating,
			toolbarHeight,
			activeAnchorRect,
			nativeMenuSide!,
			gap
		)
	) {
		return createDockedPosition(left, activeAnchorRect);
	}

	return floating;
}

const COLOR_ROW_HANG_GAP = 10;

/**
 * Floating toolbars hang the color chips to the left of the box. Docked mode lays them
 * out inline, so the measured overflow would be zero; fall back to the row width then,
 * because the next placement may switch back to floating.
 */
export function measureLeadingOverflow(toolbarEl: HTMLElement, colorRowSelector: string): number {
	const colorRow = toolbarEl.querySelector<HTMLElement>(colorRowSelector);
	if (!colorRow) {
		return 0;
	}
	const hangsOutside = colorRow.ownerDocument.defaultView?.getComputedStyle(colorRow).position === "absolute";
	if (hangsOutside) {
		const overflow = toolbarEl.getBoundingClientRect().left - colorRow.getBoundingClientRect().left;
		return Math.max(0, overflow);
	}
	return colorRow.offsetWidth > 0 ? colorRow.offsetWidth + COLOR_ROW_HANG_GAP : 0;
}

export function createEventBinder() {
	const listeners: Array<() => void> = [];

	return {
		bind(
			target: EventTarget | null | undefined,
			event: string,
			handler: EventListenerOrEventListenerObject,
			options?: AddEventListenerOptions | boolean
		) {
			if (!target?.addEventListener || !target?.removeEventListener) {
				return;
			}
			target.addEventListener(event, handler, options);
			listeners.push(() => target.removeEventListener(event, handler, options));
		},
		dispose() {
			for (const dispose of listeners.splice(0)) {
				dispose();
			}
		},
	};
}

/** Cross-realm safe (EPUB iframe / popout) event target resolution. */
export function getEventTargetNode(target: unknown): Node | null {
	if (target == null || typeof target !== "object") {
		return null;
	}
	const node = target as Node;
	return typeof node.nodeType === "number" ? node : null;
}

function getEventTargetElement(target: unknown): Element | null {
	const node = getEventTargetNode(target);
	if (!node) {
		return null;
	}
	if (domInstanceOf(node, Element)) {
		return node;
	}
	if (domInstanceOf(node, Text)) {
		return node.parentElement;
	}
	return null;
}

export function isEventOutsideToolbar(toolbarEl: HTMLElement | undefined, event: Event): boolean {
	const target = getEventTargetNode(event.target);
	return Boolean(toolbarEl && target && !toolbarEl.contains(target));
}

const OBSIDIAN_FLOATING_UI_SELECTOR =
	".menu, .modal-container, .modal, .popover, .suggestion-container, .dropdown-menu";

export function isEventInsideObsidianFloatingUi(event: Event): boolean {
	const element = getEventTargetElement(event.target);
	return Boolean(element?.closest(OBSIDIAN_FLOATING_UI_SELECTOR));
}

/** True when a pointer event should dismiss the selection toolbar (outside toolbar and floating UI). */
export function shouldDismissToolbarOnPointerDown(
	toolbarEl: HTMLElement | undefined,
	event: Event
): boolean {
	const target = getEventTargetNode(event.target);
	if (!target) {
		return false;
	}
	if (toolbarEl?.contains(target)) {
		return false;
	}
	if (isEventInsideObsidianFloatingUi(event)) {
		return false;
	}
	return true;
}
