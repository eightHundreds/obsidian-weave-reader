import { describe, expect, it } from "vitest";
import {
	isEpubBookmarkMarkdownInFolder,
	isPathUnderEpubBookmarkFolder,
} from "../epub-bookmark-folder-path";

describe("epub-bookmark-folder-path", () => {
	it("matches bookmark folder descendants including nested data notes", () => {
		const folder = "Weave EPUB Reader";
		expect(isPathUnderEpubBookmarkFolder("Weave EPUB Reader", folder)).toBe(true);
		expect(isPathUnderEpubBookmarkFolder("Weave EPUB Reader/data_Demo.md", folder)).toBe(
			true
		);
		expect(isPathUnderEpubBookmarkFolder("Weave EPUB Reader/archive/data_Demo.md", folder)).toBe(
			true
		);
		expect(isPathUnderEpubBookmarkFolder("Weave EPUB Reader/covers/demo.jpg", folder)).toBe(
			true
		);
		expect(isPathUnderEpubBookmarkFolder("Notes/demo.md", folder)).toBe(false);
	});

	it("treats markdown under bookmark folder as bookmark vault files", () => {
		const folder = "Weave EPUB Reader";
		expect(isEpubBookmarkMarkdownInFolder("Weave EPUB Reader/data_Demo.md", folder)).toBe(
			true
		);
		expect(isEpubBookmarkMarkdownInFolder("Weave EPUB Reader/archive/data_Demo.md", folder)).toBe(
			true
		);
		expect(isEpubBookmarkMarkdownInFolder("Weave EPUB Reader/covers/demo.jpg", folder)).toBe(
			false
		);
	});
});
