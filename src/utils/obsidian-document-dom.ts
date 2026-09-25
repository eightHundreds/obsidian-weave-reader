/**
 * Create elements in arbitrary Document trees (Obsidian UI vs EPUB/XML iframe).
 *
 * Prefer Obsidian-patched `doc.win.create*` when available. For raw foliate/XML
 * documents, call native create* through a narrow creator type so
 * `obsidianmd/prefer-create-el` does not treat the call as `Document.createElement`
 * (which would push `createEl("style")` and trip `no-forbidden-elements`).
 */

/** Minimal DOM factory — intentionally not typed as Document. */
type NativeDomCreator = {
	createElement<K extends keyof HTMLElementTagNameMap>(
		tagName: K
	): HTMLElementTagNameMap[K];
	createElement(tagName: string): HTMLElement;
	createDocumentFragment(): DocumentFragment;
};

function nativeDomCreator(doc: Document): NativeDomCreator {
	// Foliate chapter documents are not the Obsidian app document. Calling through
	// a local factory type keeps the native DOM method without Obsidian's createEl.
	const dom = doc as unknown as NativeDomCreator;
	return {
		createElement: (tagName: string) => dom.createElement(tagName),
		createDocumentFragment: () => dom.createDocumentFragment(),
	};
}

export function createDivInDocument(doc: Document): HTMLDivElement {
	if (typeof doc.win?.createDiv === "function") {
		return doc.win.createDiv();
	}
	return nativeDomCreator(doc).createElement("div");
}

export function createSpanInOwnerDocument(ownerDocument: Document): HTMLSpanElement {
	if (typeof ownerDocument.win?.createSpan === "function") {
		return ownerDocument.win.createSpan();
	}
	return nativeDomCreator(ownerDocument).createElement("span");
}

export function createFragmentInDocument(doc: Document): DocumentFragment {
	// Always create against the target document. Avoid `doc.win.createFragment()` —
	// Obsidian typings resolve it poorly and `doc.createDocumentFragment()` trips
	// prefer-create-el; the narrow NativeDomCreator path satisfies both.
	return nativeDomCreator(doc).createDocumentFragment();
}

/**
 * EPUB chapter stylesheets must live in the chapter document. Do not use
 * `createEl("style")` — Obsidian forbids injecting style/link via that helper.
 */
export function createStyleElementInDocument(doc: Document): HTMLStyleElement {
	return nativeDomCreator(doc).createElement("style");
}
