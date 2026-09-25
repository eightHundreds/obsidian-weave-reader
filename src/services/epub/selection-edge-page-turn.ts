export type SelectionEdge = "start" | "end";
export type SelectionEdgeTurnDirection = "next" | "prev";

type RectLike = { top: number; bottom: number; width: number; height: number };

type Boundary = { node: Node; offset: number };

export type SelectionEdgeRendererState = {
	scrolled: boolean;
	page?: number;
	pages?: number;
	start?: number;
	end?: number;
	size?: number;
	viewSize?: number;
};

const LINE_OVERLAP_TOLERANCE_PX = 2;
export const SELECTION_EDGE_DWELL_MS = 650;

function toVisibleRects(list: ArrayLike<RectLike> | null | undefined): RectLike[] {
	if (!list) {
		return [];
	}
	return Array.from(list).filter((rect) => rect.width > 0 && rect.height > 0);
}

export function rectsStayOnLine(rects: RectLike[], line: RectLike): boolean {
	const lineTop = line.top + LINE_OVERLAP_TOLERANCE_PX;
	const lineBottom = line.bottom - LINE_OVERLAP_TOLERANCE_PX;
	return rects.every((rect) => rect.top < lineBottom && rect.bottom > lineTop);
}

function isPointInRange(range: Range, node: Node, offset: number): boolean {
	try {
		return range.comparePoint(node, offset) === 0;
	} catch {
		return false;
	}
}

/**
 * Native selection handles cannot reach text laid out in off-screen columns, so a drag toward
 * the page edge stalls on the first/last visible line. Detect that stall so the caller can turn.
 */
export function resolveSelectionEdgeTurn(
	selectionRange: Range,
	edge: SelectionEdge,
	visibleRange: Range
): SelectionEdgeTurnDirection | null {
	const doc = selectionRange.startContainer.ownerDocument;
	if (!doc || visibleRange.startContainer.ownerDocument !== doc) {
		return null;
	}
	const selectionRects = toVisibleRects(selectionRange.getClientRects());
	if (selectionRects.length === 0) {
		return null;
	}

	const gap = doc.createRange();
	try {
		if (edge === "end") {
			if (!isPointInRange(visibleRange, selectionRange.endContainer, selectionRange.endOffset)) {
				return null;
			}
			gap.setStart(selectionRange.endContainer, selectionRange.endOffset);
			gap.setEnd(visibleRange.endContainer, visibleRange.endOffset);
		} else {
			if (!isPointInRange(visibleRange, selectionRange.startContainer, selectionRange.startOffset)) {
				return null;
			}
			gap.setStart(visibleRange.startContainer, visibleRange.startOffset);
			gap.setEnd(selectionRange.startContainer, selectionRange.startOffset);
		}
	} catch {
		return null;
	}

	const edgeLine =
		edge === "end" ? selectionRects[selectionRects.length - 1] : selectionRects[0];
	if (!edgeLine || !rectsStayOnLine(toVisibleRects(gap.getClientRects()), edgeLine)) {
		return null;
	}
	return edge === "end" ? "next" : "prev";
}

/** Turning across a section boundary reloads the iframe and would drop the live selection. */
export function resolveSelectionEdgeTurnStep(
	state: SelectionEdgeRendererState,
	direction: SelectionEdgeTurnDirection
): { distance?: number } | null {
	if (state.scrolled) {
		const { start = 0, end = 0, size = 0, viewSize = 0 } = state;
		if (size <= 0) {
			return null;
		}
		const canScroll = direction === "next" ? viewSize - end > 2 : start > 0;
		return canScroll ? { distance: Math.max(1, Math.round(size / 3)) } : null;
	}
	const { page, pages } = state;
	if (typeof page !== "number" || typeof pages !== "number") {
		return null;
	}
	// Paginator pads each section with one blank page on both sides.
	const canTurn = direction === "next" ? page < pages - 2 : page > 1;
	return canTurn ? {} : null;
}

export type SelectionEdgePageTurnOptions = {
	getVisibleRange: () => Range | null;
	turn: (direction: SelectionEdgeTurnDirection) => void | Promise<void>;
	dwellMs?: number;
};

function sameBoundary(a: Boundary, b: Boundary): boolean {
	return a.node === b.node && a.offset === b.offset;
}

export class SelectionEdgePageTurnTracker {
	private lastStart: Boundary | null = null;
	private lastEnd: Boundary | null = null;
	private activeEdge: SelectionEdge | null = null;
	private timer = 0;

	constructor(
		private readonly doc: Document,
		private readonly options: SelectionEdgePageTurnOptions
	) {}

	handleSelectionChange(): void {
		const selection = this.doc.getSelection();
		if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
			this.reset();
			return;
		}
		const range = selection.getRangeAt(0);
		const start = { node: range.startContainer, offset: range.startOffset };
		const end = { node: range.endContainer, offset: range.endOffset };
		const previousStart = this.lastStart;
		const previousEnd = this.lastEnd;
		this.lastStart = start;
		this.lastEnd = end;
		if (!previousStart || !previousEnd) {
			this.activeEdge = null;
			this.clearTimer();
			return;
		}
		const startMoved = !sameBoundary(start, previousStart);
		const endMoved = !sameBoundary(end, previousEnd);
		if (!startMoved && !endMoved) {
			return;
		}
		// A handle drag moves one boundary; both moving means a fresh selection (e.g. long-press).
		this.activeEdge = startMoved && endMoved ? null : endMoved ? "end" : "start";
		this.clearTimer();
		if (this.activeEdge) {
			this.timer = window.setTimeout(
				() => this.evaluate(),
				this.options.dwellMs ?? SELECTION_EDGE_DWELL_MS
			);
		}
	}

	dispose(): void {
		this.reset();
	}

	private evaluate(): void {
		this.timer = 0;
		const edge = this.activeEdge;
		const selection = this.doc.getSelection();
		if (!edge || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
			return;
		}
		const visibleRange = this.options.getVisibleRange();
		if (!visibleRange) {
			return;
		}
		const direction = resolveSelectionEdgeTurn(selection.getRangeAt(0), edge, visibleRange);
		if (!direction) {
			return;
		}
		this.activeEdge = null;
		void Promise.resolve(this.options.turn(direction)).catch(() => undefined);
	}

	private clearTimer(): void {
		if (this.timer) {
			window.clearTimeout(this.timer);
			this.timer = 0;
		}
	}

	private reset(): void {
		this.clearTimer();
		this.lastStart = null;
		this.lastEnd = null;
		this.activeEdge = null;
	}
}
