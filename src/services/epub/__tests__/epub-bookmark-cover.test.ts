import { TFile } from "obsidian";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ensureEpubBookmarkCoverPath } from "../epub-bookmark-cover";

const loadMock = vi.fn();
const disposeMock = vi.fn();

vi.mock("../FoliateVaultPublicationParser", () => ({
	FoliateVaultPublicationParser: class {
		load = loadMock;
		dispose = disposeMock;
	},
}));

function createApp(bookPath: string, stat: { size: number; mtime: number }) {
	const written = new Set<string>();
	const bookFile = Object.assign(Object.create(TFile.prototype), { path: bookPath, stat });
	return {
		written,
		bookFile,
		app: {
			vault: {
				getAbstractFileByPath: vi.fn((path: string) => (path === bookPath ? bookFile : null)),
				adapter: {
					exists: vi.fn(async (path: string) => written.has(path)),
					mkdir: vi.fn(async () => undefined),
					writeBinary: vi.fn(async (path: string) => {
						written.add(path);
					}),
				},
			},
		} as any,
	};
}

const input = {
	bookPath: "Books/large.mobi",
	stableKey: "stable-1",
	bookmarkFolder: "Weave EPUB Reader",
};

describe("ensureEpubBookmarkCoverPath", () => {
	beforeEach(() => {
		loadMock.mockReset();
		disposeMock.mockReset();
	});

	it("parses a coverless book only once while the source is unchanged", async () => {
		loadMock.mockResolvedValue({ coverImage: undefined });
		const { app } = createApp(input.bookPath, { size: 9_383_542, mtime: 1 });

		await Promise.all([
			ensureEpubBookmarkCoverPath(app, input),
			ensureEpubBookmarkCoverPath(app, input),
		]);
		await ensureEpubBookmarkCoverPath(app, input);

		expect(loadMock).toHaveBeenCalledTimes(1);
		expect(loadMock).toHaveBeenCalledWith(input.bookPath, { coverOnly: true });
		expect(disposeMock).toHaveBeenCalledTimes(1);
	});

	it("re-extracts after the book file changes", async () => {
		loadMock.mockResolvedValue({ coverImage: undefined });
		const { app, bookFile } = createApp(input.bookPath, { size: 10, mtime: 1 });

		await ensureEpubBookmarkCoverPath(app, input);
		bookFile.stat = { size: 10, mtime: 2 };
		await ensureEpubBookmarkCoverPath(app, input);

		expect(loadMock).toHaveBeenCalledTimes(2);
	});

	it("reuses a cover file already written for the stable key", async () => {
		loadMock.mockResolvedValue({ coverImage: "data:image/png;base64,AAAA" });
		const { app } = createApp(input.bookPath, { size: 10, mtime: 1 });

		const first = await ensureEpubBookmarkCoverPath(app, input);
		const second = await ensureEpubBookmarkCoverPath(app, input);

		expect(first).toBe("Weave EPUB Reader/covers/stable-1.png");
		expect(second).toBe(first);
		expect(loadMock).toHaveBeenCalledTimes(1);
	});
});
