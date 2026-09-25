import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	SELECTION_EDGE_DWELL_MS,
	SelectionEdgePageTurnTracker,
	resolveSelectionEdgeTurn,
	resolveSelectionEdgeTurnStep,
} from "../selection-edge-page-turn";

const CHARS_PER_LINE = 20;
const LINE_HEIGHT = 20;
const CHAR_WIDTH = 10;

function fakeClientRects(this: Range): DOMRect[] {
	const start = this.startOffset;
	const end = this.endOffset;
	if (this.startContainer !== this.endContainer || end <= start) {
		return [];
	}
	const rects: DOMRect[] = [];
	for (let line = Math.floor(start / CHARS_PER_LINE); line <= Math.floor((end - 1) / CHARS_PER_LINE); line++) {
		const from = Math.max(start, line * CHARS_PER_LINE);
		const to = Math.min(end, (line + 1) * CHARS_PER_LINE);
		const left = (from % CHARS_PER_LINE) * CHAR_WIDTH;
		rects.push(new DOMRect(left, line * LINE_HEIGHT, (to - from) * CHAR_WIDTH, LINE_HEIGHT));
	}
	return rects;
}

describe("selection edge page turn", () => {
	let text: Text;
	let originalGetClientRects: typeof Range.prototype.getClientRects | undefined;

	const rangeOf = (start: number, end: number): Range => {
		const range = document.createRange();
		range.setStart(text, start);
		range.setEnd(text, end);
		return range;
	};
	const visibleRange = () => rangeOf(0, 100);
	const select = (start: number, end: number) => {
		document.getSelection()?.setBaseAndExtent(text, start, text, end);
		document.dispatchEvent(new Event("selectionchange"));
	};

	beforeEach(() => {
		document.body.innerHTML = "";
		const paragraph = document.createElement("p");
		paragraph.textContent = "x".repeat(200);
		document.body.appendChild(paragraph);
		text = paragraph.firstChild as Text;
		originalGetClientRects = Range.prototype.getClientRects;
		Range.prototype.getClientRects = fakeClientRects as unknown as typeof Range.prototype.getClientRects;
	});

	afterEach(() => {
		if (originalGetClientRects) {
			Range.prototype.getClientRects = originalGetClientRects;
		} else {
			Reflect.deleteProperty(Range.prototype, "getClientRects");
		}
		document.getSelection()?.removeAllRanges();
		vi.useRealTimers();
	});

	describe("resolveSelectionEdgeTurn", () => {
		it("turns forward when the dragged end sits on the last visible line", () => {
			expect(resolveSelectionEdgeTurn(rangeOf(5, 85), "end", visibleRange())).toBe("next");
			expect(resolveSelectionEdgeTurn(rangeOf(5, 100), "end", visibleRange())).toBe("next");
		});

		it("does not turn while the dragged end is above the last visible line", () => {
			expect(resolveSelectionEdgeTurn(rangeOf(5, 60), "end", visibleRange())).toBeNull();
		});

		it("leaves ends beyond the visible range to foliate", () => {
			expect(resolveSelectionEdgeTurn(rangeOf(5, 150), "end", visibleRange())).toBeNull();
		});

		it("turns backward when the dragged start sits on the first visible line", () => {
			expect(resolveSelectionEdgeTurn(rangeOf(10, 50), "start", visibleRange())).toBe("prev");
			expect(resolveSelectionEdgeTurn(rangeOf(30, 50), "start", visibleRange())).toBeNull();
		});
	});

	describe("resolveSelectionEdgeTurnStep", () => {
		it("stays inside the current section in paginated mode", () => {
			expect(resolveSelectionEdgeTurnStep({ scrolled: false, page: 1, pages: 5 }, "next")).toEqual({});
			expect(resolveSelectionEdgeTurnStep({ scrolled: false, page: 3, pages: 5 }, "next")).toBeNull();
			expect(resolveSelectionEdgeTurnStep({ scrolled: false, page: 1, pages: 5 }, "prev")).toBeNull();
			expect(resolveSelectionEdgeTurnStep({ scrolled: false, page: 2, pages: 5 }, "prev")).toEqual({});
		});

		it("scrolls a third of the viewport in scrolled mode until the section edge", () => {
			const state = { scrolled: true, start: 0, end: 600, size: 600, viewSize: 3000 };
			expect(resolveSelectionEdgeTurnStep(state, "next")).toEqual({ distance: 200 });
			expect(resolveSelectionEdgeTurnStep(state, "prev")).toBeNull();
			expect(
				resolveSelectionEdgeTurnStep({ ...state, start: 2400, end: 3000 }, "next")
			).toBeNull();
		});
	});

	describe("SelectionEdgePageTurnTracker", () => {
		const createTracker = () => {
			const turn = vi.fn();
			const tracker = new SelectionEdgePageTurnTracker(document, {
				getVisibleRange: visibleRange,
				turn,
			});
			document.addEventListener("selectionchange", () => tracker.handleSelectionChange());
			return { tracker, turn };
		};

		it("turns after the dragged end dwells on the last visible line", () => {
			vi.useFakeTimers();
			const { tracker, turn } = createTracker();
			select(5, 20);
			select(5, 90);
			vi.advanceTimersByTime(SELECTION_EDGE_DWELL_MS - 1);
			expect(turn).not.toHaveBeenCalled();
			vi.advanceTimersByTime(1);
			expect(turn).toHaveBeenCalledWith("next");
			tracker.dispose();
		});

		it("ignores a fresh selection that lands on the last line", () => {
			vi.useFakeTimers();
			const { tracker, turn } = createTracker();
			select(5, 20);
			select(82, 90);
			vi.advanceTimersByTime(SELECTION_EDGE_DWELL_MS * 2);
			expect(turn).not.toHaveBeenCalled();
			tracker.dispose();
		});

		it("does not turn for the initial selection alone", () => {
			vi.useFakeTimers();
			const { tracker, turn } = createTracker();
			select(82, 90);
			vi.advanceTimersByTime(SELECTION_EDGE_DWELL_MS * 2);
			expect(turn).not.toHaveBeenCalled();
			tracker.dispose();
		});
	});
});
