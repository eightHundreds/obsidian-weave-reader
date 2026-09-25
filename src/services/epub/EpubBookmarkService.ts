import { App, TFile, normalizePath } from "obsidian";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import { sanitizeForSync } from "../../utils/sync-safe-filename";
import { EpubLinkService } from "./EpubLinkService";
import { generateUniqueVaultFilePath } from "./epub-markdown-path-resolver";
import {
	areEpubBookmarkAnalyticsEquivalent,
	buildEpubBookmarkAnalytics,
	readEpubBookmarkAnalyticsFromFrontmatter,
} from "./epub-bookmark-analytics";
import { resolveEpubBookmarkFolderForApp } from "./epub-bookmark-vault-path";
import {
	EPUB_BOOKMARK_DATA_FILE_PREFIX,
	isEpubBookmarkMarkdownInFolder,
} from "./epub-bookmark-folder-path";
import {
	isEpubBookmarkVaultFrontmatter,
	parseEpubBookmarkVaultYamlBlock,
} from "./epub-bookmark-vault-parse";
import { getEpubStorageService } from "./epub-storage-access";
import type {
	EpubBookmarkAnalytics,
	EpubBookmarkUserMetadata,
} from "./epub-bookmark-page-types";
import {
	EPUB_BOOKMARK_ACCEPTED_FORMATS,
	EPUB_BOOKMARK_FILE_FORMAT_V3,
} from "./epub-bookmark-page-types";
import {
	EPUB_BOOKMARK_PAGE_MAINTENANCE_NOTE,
	renderEpubBookmarkFileContent,
} from "./epub-bookmark-page-render";
import { deriveEpubBookmarkDisplayTitle } from "./epub-bookmark-display-title";
import { ensureEpubBookmarkCoverPath } from "./epub-bookmark-cover";
import { isPlainObject, normalizeReadingPaceStats } from "./reading-pace";
import type { ReaderHighlightInput } from "./reader-engine-types";
import {
	normalizeTocChapterMarkKey,
	normalizeTocChapterMarkMap,
	type EpubTocChapterMark,
	type EpubTocChapterMarkMap,
} from "./epub-toc-chapter-mark";
import {
	normalizeConcealedTexts,
	normalizeReadingReferencePoint,
} from "./epub-local-data-normalize";
import type {
	ConcealedText,
	EpubBook,
	EpubReadingReferencePoint,
	ReadingPosition,
	ReadingStats,
} from "./types";
import { errorPlainText, unknownPlainText } from "../../utils/unknown-plain-text";

export {
	DEFAULT_EPUB_BOOKMARK_FOLDER,
	EPUB_BOOKMARK_DATA_FILE_PREFIX,
	normalizeEpubBookmarkFolderPath,
} from "./epub-bookmark-folder-path";
const EPUB_BOOKMARK_FILE_FORMAT = EPUB_BOOKMARK_FILE_FORMAT_V3;

/** Obsidian note shown at the top of every EPUB bookmark file. */
export const EPUB_BOOKMARK_AUTO_MAINTAINED_CALLOUT = EPUB_BOOKMARK_PAGE_MAINTENANCE_NOTE;

export type { EpubBookmarkAnalytics } from "./epub-bookmark-page-types";
export { buildEpubBookmarkAnalytics } from "./epub-bookmark-analytics";

export interface EpubBookmarkReadingState {
	currentPosition: ReadingPosition;
	readingStats: ReadingStats;
}

export interface EpubBookmarkRecord {
	id: string;
	cfi: string;
	chapterIndex: number;
	percent: number;
	chapterTitle: string;
	pageNumber?: number;
	totalPages?: number;
	createdAt: number;
	preview?: string;
}

export interface EpubBookmarkCreateInput {
	cfi: string;
	chapterIndex: number;
	percent: number;
	chapterTitle: string;
	pageNumber?: number;
	totalPages?: number;
	createdAt?: number;
	preview?: string;
}

export interface EpubBookmarkWriteResult {
	bookmark: EpubBookmarkRecord;
	created: boolean;
	filePath: string;
}

interface EpubBookmarkFileFrontmatter {
	format: string;
	weave_epub_bookmark_file: boolean;
	stableKey: string;
	bookId: string;
	sourceId?: string;
	sourceFingerprint?: string;
	bookPath: string;
	displayTitle?: string;
	bookTitle: string;
	bookAuthor?: string;
	bookLanguage?: string;
	publisher?: string;
	isbn?: string;
	publishDate?: string;
	subjects?: string[];
	description?: string;
	translator?: string;
	coverPath?: string;
	canvasPath?: string;
	customCoverPath?: string;
	notesExportPath?: string;
	readingReferencePoint?: EpubReadingReferencePoint;
	concealedTexts?: ConcealedText[];
	tocChapterMarks?: EpubTocChapterMarkMap;
	wordCount?: number;
	chapterCount?: number;
	updatedAt: number;
	bookmarks: EpubBookmarkRecord[];
	readingState?: EpubBookmarkReadingState;
	analytics?: EpubBookmarkAnalytics;
	user?: EpubBookmarkUserMetadata;
}

/** Normalize title punctuation so bookmark filenames stay stable across platforms. */
export function normalizeBookmarkTitleForFileName(title: string): string {
	return String(title || "").replace(/[\u2022\u00B7\u2219\u30FB\u0387\u22C5\u2027]/g, "-");
}

/** Hex length taken from `sourceFingerprint` when building a short `stableKey` / filename suffix. */
export const EPUB_BOOKMARK_STABLE_KEY_FINGERPRINT_HEX_LENGTH = 12;

function isEphemeralEpubRuntimeId(value: string): boolean {
	return /^epub-[0-9a-z]+$/i.test(String(value || "").trim());
}

/**
 * Short, vault-safe book identity for bookmark filenames and frontmatter `stableKey`.
 * Full `sourceFingerprint` remains in YAML for rename/move reconciliation.
 */
export function buildEpubBookmarkStableKey(input: {
	sourceFingerprint?: string;
	sourceId?: string;
	id?: string;
	title?: string;
}): string {
	const fingerprint = String(input.sourceFingerprint || "")
		.trim()
		.toLowerCase();
	if (fingerprint) {
		const prefix = fingerprint.slice(0, EPUB_BOOKMARK_STABLE_KEY_FINGERPRINT_HEX_LENGTH);
		return sanitizeForSync(`epubsrc-${prefix}`, 20);
	}

	const sourceId = String(input.sourceId || "").trim();
	if (sourceId && !isEphemeralEpubRuntimeId(sourceId)) {
		return sanitizeForSync(sourceId, 32);
	}

	const bookId = String(input.id || "").trim();
	if (bookId && !isEphemeralEpubRuntimeId(bookId)) {
		return sanitizeForSync(bookId, 32);
	}

	const title = String(input.title || "").trim();
	return sanitizeForSync(title, 32) || "epub-book";
}

/** Legacy filename suffixes that used the full fingerprint or long source id in the path. */
export function buildLegacyEpubBookmarkStableKeySuffixes(input: {
	sourceFingerprint?: string;
	sourceId?: string;
	canonicalStableKey: string;
}): string[] {
	const suffixes = new Set<string>();
	const canonical = String(input.canonicalStableKey || "").trim();
	const addSuffix = (stableKey: string) => {
		const normalized = String(stableKey || "").trim();
		if (!normalized || normalized === canonical) {
			return;
		}
		suffixes.add(`--${normalized}.md`);
	};

	const fingerprint = String(input.sourceFingerprint || "").trim();
	if (fingerprint) {
		addSuffix(sanitizeForSync(fingerprint, 56));
	}

	const sourceId = String(input.sourceId || "").trim();
	if (sourceId) {
		addSuffix(sanitizeForSync(sourceId, 56));
	}

	return [...suffixes];
}

export function buildEpubBookmarkFileBaseName(title: string): string {
	const normalizedTitle = sanitizeForSync(
		normalizeBookmarkTitleForFileName(String(title || "").trim()),
		64
	);
	return `${EPUB_BOOKMARK_DATA_FILE_PREFIX}${normalizedTitle || "EPUB"}`;
}

export function buildEpubBookmarkFileName(title: string): string {
	return `${buildEpubBookmarkFileBaseName(title)}.md`;
}

export function buildEpubBookmarkFileNameCandidates(input: {
	title: string;
	author?: string;
	epubBaseName?: string;
}): string[] {
	const candidates: string[] = [];
	const seen = new Set<string>();
	const push = (fileName: string) => {
		const normalized = String(fileName || "").trim();
		if (!normalized || seen.has(normalized)) {
			return;
		}
		seen.add(normalized);
		candidates.push(normalized);
	};

	push(buildEpubBookmarkFileName(input.title));

	const baseName = buildEpubBookmarkFileBaseName(input.title);
	const author = String(input.author || "").trim();
	if (author) {
		push(`${baseName} - ${sanitizeForSync(author, 32)}.md`);
	}

	const epubBaseName = String(input.epubBaseName || "").trim();
	if (epubBaseName) {
		push(`${baseName} - ${sanitizeForSync(epubBaseName, 32)}.md`);
	}

	for (let index = 2; index <= 500; index += 1) {
		push(`${baseName} ${index}.md`);
	}

	return candidates;
}

/** Legacy `{title}--{id}.md` filenames (pre `data_` naming). */
export function buildLegacyEpubBookmarkTitleIdPrefix(title: string): string | null {
	const titleSegment = sanitizeForSync(
		normalizeBookmarkTitleForFileName(String(title || "").trim()),
		64
	);
	if (!titleSegment) {
		return null;
	}
	return `${titleSegment}--`;
}

function normalizeBookmarkVaultPath(value: unknown): string | null {
	const normalized = normalizePath(unknownPlainText(value).trim());
	return normalized || null;
}

function normalizeBookmarkCanvasPath(value: unknown): string | null {
	return normalizeBookmarkVaultPath(value);
}

function remapBookmarkCanvasPath(filePath: string, oldPath: string, newPath: string): string | null {
	if (filePath === oldPath) {
		return newPath;
	}
	if (filePath.startsWith(`${oldPath}/`)) {
		return `${newPath}${filePath.slice(oldPath.length)}`;
	}
	return null;
}

function isFilesystemNotFoundError(error: unknown): boolean {
	const code =
		error && typeof error === "object" && "code" in error
			? unknownPlainText((error as { code?: unknown }).code)
			: "";
	const message = errorPlainText(error);
	return code === "ENOENT" || /no such file or directory/i.test(message);
}

export class EpubBookmarkService {
	private app: App;
	private linkService: EpubLinkService;
	private bookmarkFileLocks = new Map<string, Promise<void>>();

	constructor(app: App) {
		this.app = app;
		this.linkService = new EpubLinkService(app);
	}

	private runSerializedBookmarkMutation<T>(book: EpubBook, operation: () => Promise<T>): Promise<T> {
		const lockKey =
			this.buildStableKey(book) || String(book.id || "").trim() || "epub-book";
		const previous = this.bookmarkFileLocks.get(lockKey) || Promise.resolve();
		const next = previous.catch(() => undefined).then(operation, operation);
		this.bookmarkFileLocks.set(
			lockKey,
			next.then(
				() => undefined,
				() => undefined
			)
		);
		return next;
	}

	getBookmarkFolder(): string {
		return resolveEpubBookmarkFolderForApp(this.app);
	}

	async loadBookmarksForBook(book: EpubBook): Promise<EpubBookmarkRecord[]> {
		const fileData = await this.readBookmarkFileForBook(book);
		if (!fileData) {
			return [];
		}
		return [...fileData.bookmarks].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
	}

	async getBookmarkCountForBook(book: EpubBook): Promise<number> {
		return (await this.loadBookmarksForBook(book)).length;
	}

	async addBookmark(
		book: EpubBook,
		input: EpubBookmarkCreateInput
	): Promise<EpubBookmarkWriteResult> {
		return await this.runSerializedBookmarkMutation(book, async () => {
			return await this.addBookmarkInternal(book, input);
		});
	}

	private async addBookmarkInternal(
		book: EpubBook,
		input: EpubBookmarkCreateInput
	): Promise<EpubBookmarkWriteResult> {
		const filePath = await this.ensureCanonicalBookmarkFilePath(book);
		const existing =
			(await this.readBookmarkFileByPath(filePath)) ?? this.createEmptyFileFrontmatter(book);
		const normalizedBookmark = this.normalizeBookmarkRecord(
			{
				...input,
				id: this.createBookmarkId(existing.stableKey, input.cfi, input.createdAt ?? Date.now()),
			},
			existing.stableKey
		);
		if (!normalizedBookmark) {
			throw new Error("Invalid EPUB bookmark payload");
		}

		const normalizedCfi = EpubLinkService.normalizeCfi(normalizedBookmark.cfi);
		const existingIndex = existing.bookmarks.findIndex(
			(bookmark) => EpubLinkService.normalizeCfi(bookmark.cfi) === normalizedCfi
		);
		let created = false;
		let bookmark = normalizedBookmark;

		if (existingIndex >= 0) {
			const preserved = existing.bookmarks[existingIndex];
			bookmark = {
				...normalizedBookmark,
				id: preserved.id,
				createdAt: preserved.createdAt,
			};
			existing.bookmarks[existingIndex] = bookmark;
		} else {
			created = true;
			existing.bookmarks = [bookmark, ...existing.bookmarks];
		}

		const merged = this.mergeBookIdentity(existing, book);
		Object.assign(existing, merged);
		existing.updatedAt = Date.now();
		existing.bookmarks = existing.bookmarks
			.filter((item) => Boolean(item.cfi))
			.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

		await this.writeBookmarkFile(filePath, existing);
		return {
			bookmark,
			created,
			filePath,
		};
	}

	async deleteBookmark(book: EpubBook, bookmarkId: string): Promise<boolean> {
		const normalizedBookmarkId = String(bookmarkId || "").trim();
		if (!normalizedBookmarkId) {
			return false;
		}

		return await this.runSerializedBookmarkMutation(book, async () => {
			const filePath = await this.findCompatibleBookmarkFilePath(book);
			if (!filePath) {
				return false;
			}

			const existing = await this.readBookmarkFileByPath(filePath);
			if (!existing) {
				return false;
			}

			const nextBookmarks = existing.bookmarks.filter(
				(bookmark) => String(bookmark.id || "").trim() !== normalizedBookmarkId
			);
			if (nextBookmarks.length === existing.bookmarks.length) {
				return false;
			}

			existing.bookmarks = nextBookmarks.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
			existing.updatedAt = Date.now();
			await this.writeBookmarkFile(filePath, existing);
			return true;
		});
	}

	async readReadingState(book: EpubBook): Promise<EpubBookmarkReadingState | null> {
		const fileData = await this.readBookmarkFileForBook(book);
		return fileData?.readingState ?? null;
	}

	async readBookmarkSnapshotForBook(
		book: EpubBook
	): Promise<EpubBookmarkFileFrontmatter | null> {
		return await this.readBookmarkFileForBook(book);
	}

	async readReadingStateByBookPath(filePath: string): Promise<EpubBookmarkReadingState | null> {
		const snapshot = await this.findBookmarkSnapshotByBookPath(filePath);
		return snapshot?.readingState ?? null;
	}

	async findBookmarkSnapshotByBookPath(
		filePath: string
	): Promise<EpubBookmarkFileFrontmatter | null> {
		const bookmarkPath = await this.findBookmarkFilePathByBookPath(filePath);
		if (!bookmarkPath) {
			return null;
		}
		return await this.readBookmarkFileByPath(bookmarkPath);
	}

	async writeReadingState(
		book: EpubBook,
		state: EpubBookmarkReadingState
	): Promise<string> {
		return await this.runSerializedBookmarkMutation(book, async () => {
			const filePath = await this.ensureCanonicalBookmarkFilePath(book);
			const existing =
				(await this.readBookmarkFileByPath(filePath)) || this.createEmptyFileFrontmatter(book);
			const nextFrontmatter = this.mergeBookIdentity(existing, book);
			nextFrontmatter.updatedAt = Date.now();
			nextFrontmatter.readingState = this.normalizeReadingState(state) ?? undefined;
			await this.writeBookmarkFile(filePath, nextFrontmatter);
			return filePath;
		});
	}

	async syncBookDisplayMetadata(book: EpubBook): Promise<void> {
		const filePath = await this.findCompatibleBookmarkFilePath(book);
		if (!filePath) {
			return;
		}
		await this.migrateBookmarkFileForBook(book, filePath);
	}

	async syncAnalytics(book: EpubBook, highlights: ReaderHighlightInput[]): Promise<string | null> {
		return await this.runSerializedBookmarkMutation(book, async () => {
			const filePath = await this.ensureCanonicalBookmarkFilePath(book);
			const existing =
				(await this.readBookmarkFileByPath(filePath)) || this.createEmptyFileFrontmatter(book);
			const excerptSettings = await getEpubStorageService(this.app).loadExcerptSettings();
			const nextAnalytics = buildEpubBookmarkAnalytics(highlights, Date.now(), {
				strikethroughDisplayMode: excerptSettings.strikethroughDisplayMode,
				showStrikethroughInSidebar: excerptSettings.showStrikethroughInSidebar,
			});
			if (areEpubBookmarkAnalyticsEquivalent(existing.analytics, nextAnalytics)) {
				return filePath;
			}
			const nextFrontmatter = this.mergeBookIdentity(existing, book);
			nextFrontmatter.analytics = nextAnalytics;
			nextFrontmatter.updatedAt = Date.now();
			await this.writeBookmarkFile(filePath, nextFrontmatter);
			return filePath;
		});
	}

	async readCanvasBinding(book: EpubBook): Promise<string | null> {
		const fileData = await this.readBookmarkFileForBook(book);
		return normalizeBookmarkCanvasPath(fileData?.canvasPath);
	}

	async writeCanvasBinding(book: EpubBook, canvasPath: string | null): Promise<void> {
		await this.runSerializedBookmarkMutation(book, async () => {
			const filePath = await this.ensureCanonicalBookmarkFilePath(book);
			const existing =
				(await this.readBookmarkFileByPath(filePath)) || this.createEmptyFileFrontmatter(book);
			const nextFrontmatter = this.mergeBookIdentity(existing, book);
			const normalized = normalizeBookmarkCanvasPath(canvasPath);
			if (normalized) {
				nextFrontmatter.canvasPath = normalized;
			} else {
				delete nextFrontmatter.canvasPath;
			}
			nextFrontmatter.updatedAt = Date.now();
			await this.writeBookmarkFile(filePath, nextFrontmatter);
		});
	}

	async readReadingReferencePoint(book: EpubBook): Promise<EpubReadingReferencePoint | null> {
		const fileData = await this.readBookmarkFileForBook(book);
		return normalizeReadingReferencePoint(fileData?.readingReferencePoint);
	}

	async writeReadingReferencePoint(
		book: EpubBook,
		point: EpubReadingReferencePoint | null
	): Promise<void> {
		await this.updateBookmarkFrontmatter(book, (frontmatter) => {
			const normalized = point ? normalizeReadingReferencePoint(point) : null;
			if (normalized?.cfi) {
				frontmatter.readingReferencePoint = normalized;
			} else {
				delete frontmatter.readingReferencePoint;
			}
		});
	}

	async readConcealedTexts(book: EpubBook): Promise<ConcealedText[]> {
		const fileData = await this.readBookmarkFileForBook(book);
		return normalizeConcealedTexts(fileData?.concealedTexts);
	}

	async writeConcealedTexts(book: EpubBook, concealedTexts: ConcealedText[]): Promise<void> {
		await this.updateBookmarkFrontmatter(book, (frontmatter) => {
			const normalized = normalizeConcealedTexts(concealedTexts);
			if (normalized.length > 0) {
				frontmatter.concealedTexts = normalized;
			} else {
				delete frontmatter.concealedTexts;
			}
		});
	}

	async readTocChapterMarks(book: EpubBook): Promise<EpubTocChapterMarkMap> {
		const fileData = await this.readBookmarkFileForBook(book);
		return normalizeTocChapterMarkMap(fileData?.tocChapterMarks);
	}

	async setTocChapterMark(
		book: EpubBook,
		href: string,
		mark: EpubTocChapterMark | null
	): Promise<EpubTocChapterMarkMap> {
		const hrefKey = normalizeTocChapterMarkKey(href);
		let nextMarks: EpubTocChapterMarkMap = {};
		if (!hrefKey) {
			return await this.readTocChapterMarks(book);
		}
		await this.updateBookmarkFrontmatter(book, (frontmatter) => {
			nextMarks = { ...normalizeTocChapterMarkMap(frontmatter.tocChapterMarks) };
			if (mark) {
				nextMarks[hrefKey] = mark;
			} else {
				delete nextMarks[hrefKey];
			}
			if (Object.keys(nextMarks).length > 0) {
				frontmatter.tocChapterMarks = nextMarks;
			} else {
				delete frontmatter.tocChapterMarks;
			}
		});
		return nextMarks;
	}

	async readCustomCoverPathByBookPath(bookPath: string): Promise<string | null> {
		const snapshot = await this.findBookmarkSnapshotByBookPath(bookPath);
		return normalizeBookmarkVaultPath(snapshot?.customCoverPath);
	}

	async readCustomCoverPathsByBookPath(): Promise<Map<string, string>> {
		const folderPath = this.getBookmarkFolder();
		const covers = new Map<string, string>();
		for (const file of this.app.vault.getFiles()) {
			if (file.extension !== "md" || !this.isBookmarkFileInsideFolder(file.path, folderPath)) {
				continue;
			}
			const fileData = await this.readBookmarkFileByPath(file.path);
			const normalizedBookPath = normalizePath(String(fileData?.bookPath || "").trim());
			const coverPath = normalizeBookmarkVaultPath(fileData?.customCoverPath);
			if (!normalizedBookPath || !coverPath) {
				continue;
			}
			covers.set(normalizedBookPath, coverPath);
		}
		return covers;
	}

	async writeCustomCoverPathForBookPath(
		bookPath: string,
		book: EpubBook | null,
		coverPath: string | null
	): Promise<void> {
		await this.writeFrontmatterForBookPath(bookPath, book, (frontmatter) => {
			this.assignVaultPathField(frontmatter, "customCoverPath", coverPath);
		});
	}

	async readNotesExportPathByBookPath(bookPath: string): Promise<string | null> {
		const snapshot = await this.findBookmarkSnapshotByBookPath(bookPath);
		return normalizeBookmarkVaultPath(snapshot?.notesExportPath);
	}

	async writeNotesExportPathForBookPath(
		bookPath: string,
		book: EpubBook | null,
		notesExportPath: string | null
	): Promise<void> {
		await this.writeFrontmatterForBookPath(bookPath, book, (frontmatter) => {
			this.assignVaultPathField(frontmatter, "notesExportPath", notesExportPath);
		});
	}

	async remapCanvasBindingPaths(oldPath: string, newPath: string): Promise<number> {
		const normalizedOldPath = normalizePath(String(oldPath || "").trim());
		const normalizedNewPath = normalizePath(String(newPath || "").trim());
		if (!normalizedOldPath || !normalizedNewPath || normalizedOldPath === normalizedNewPath) {
			return 0;
		}

		const folderPath = this.getBookmarkFolder();
		const candidates = this.app.vault
			.getFiles()
			.filter(
				(file) => file.extension === "md" && this.isBookmarkFileInsideFolder(file.path, folderPath)
			);
		let updated = 0;

		for (const file of candidates) {
			const fileData = await this.readBookmarkFileByPath(file.path);
			if (!fileData) {
				continue;
			}
			const changed = [
				this.remapFrontmatterVaultPath(fileData, "canvasPath", normalizedOldPath, normalizedNewPath),
				this.remapFrontmatterVaultPath(
					fileData,
					"customCoverPath",
					normalizedOldPath,
					normalizedNewPath
				),
				this.remapFrontmatterVaultPath(
					fileData,
					"notesExportPath",
					normalizedOldPath,
					normalizedNewPath
				),
			].some(Boolean);
			if (!changed) {
				continue;
			}
			fileData.updatedAt = Date.now();
			await this.writeBookmarkFile(file.path, fileData);
			updated += 1;
		}

		return updated;
	}

	async updateBookFileReferences(oldPath: string, newPath: string): Promise<number> {
		const normalizedOldPath = normalizePath(String(oldPath || "").trim());
		const normalizedNewPath = normalizePath(String(newPath || "").trim());
		if (!normalizedOldPath || !normalizedNewPath || normalizedOldPath === normalizedNewPath) {
			return 0;
		}

		const folderPath = this.getBookmarkFolder();
		const candidates = this.app.vault
			.getFiles()
			.filter(
				(file) => file.extension === "md" && this.isBookmarkFileInsideFolder(file.path, folderPath)
			);
		let updated = 0;

		for (const file of candidates) {
			const fileData = await this.readBookmarkFileByPath(file.path);
			if (!fileData || normalizePath(fileData.bookPath) !== normalizedOldPath) {
				continue;
			}
			fileData.bookPath = normalizedNewPath;
			fileData.updatedAt = Date.now();
			await this.writeBookmarkFile(file.path, fileData);
			updated += 1;
		}

		return updated;
	}

	private async updateBookmarkFrontmatter(
		book: EpubBook,
		update: (frontmatter: EpubBookmarkFileFrontmatter) => void
	): Promise<void> {
		await this.runSerializedBookmarkMutation(book, async () => {
			const filePath = await this.ensureCanonicalBookmarkFilePath(book);
			const existing =
				(await this.readBookmarkFileByPath(filePath)) || this.createEmptyFileFrontmatter(book);
			const nextFrontmatter = this.mergeBookIdentity(existing, book);
			update(nextFrontmatter);
			nextFrontmatter.updatedAt = Date.now();
			await this.writeBookmarkFile(filePath, nextFrontmatter);
		});
	}

	private async writeFrontmatterForBookPath(
		bookPath: string,
		book: EpubBook | null,
		update: (frontmatter: EpubBookmarkFileFrontmatter) => void
	): Promise<void> {
		const normalizedBookPath = normalizePath(String(bookPath || "").trim());
		if (!normalizedBookPath) {
			return;
		}
		if (book && normalizePath(String(book.filePath || "").trim()) === normalizedBookPath) {
			await this.updateBookmarkFrontmatter(book, update);
			return;
		}
		const existingPath = await this.findBookmarkFilePathByBookPath(normalizedBookPath);
		if (existingPath) {
			const existing = await this.readBookmarkFileByPath(existingPath);
			if (!existing) {
				return;
			}
			update(existing);
			existing.updatedAt = Date.now();
			await this.writeBookmarkFile(existingPath, existing);
			return;
		}
		await this.updateBookmarkFrontmatter(this.createPathStubBook(normalizedBookPath), update);
	}

	private createPathStubBook(bookPath: string): EpubBook {
		const normalizedBookPath = normalizePath(bookPath);
		const title =
			EpubLinkService.extractShortBookName(normalizedBookPath) || "EPUB";
		return {
			id: "",
			filePath: normalizedBookPath,
			metadata: {
				title,
				author: "",
				chapterCount: 0,
			},
			currentPosition: { chapterIndex: 0, cfi: "", percent: 0 },
			readingStats: { totalReadTime: 0, lastReadTime: 0, createdTime: 0 },
		};
	}

	private assignVaultPathField(
		frontmatter: EpubBookmarkFileFrontmatter,
		field: "customCoverPath" | "notesExportPath",
		value: string | null
	): void {
		const normalized = normalizeBookmarkVaultPath(value);
		if (normalized) {
			frontmatter[field] = normalized;
		} else {
			delete frontmatter[field];
		}
	}

	private remapFrontmatterVaultPath(
		frontmatter: EpubBookmarkFileFrontmatter,
		field: "canvasPath" | "customCoverPath" | "notesExportPath",
		oldPath: string,
		newPath: string
	): boolean {
		const currentPath = normalizeBookmarkVaultPath(frontmatter[field]);
		if (!currentPath) {
			return false;
		}
		const remapped = remapBookmarkCanvasPath(currentPath, oldPath, newPath);
		if (!remapped || remapped === currentPath) {
			return false;
		}
		frontmatter[field] = remapped;
		return true;
	}

	private async findBookmarkFilePathByBookPath(filePath: string): Promise<string | null> {
		const normalizedPath = normalizePath(String(filePath || "").trim());
		if (!normalizedPath) {
			return null;
		}
		const folderPath = this.getBookmarkFolder();
		for (const file of this.app.vault.getFiles()) {
			if (file.extension !== "md" || !this.isBookmarkFileInsideFolder(file.path, folderPath)) {
				continue;
			}
			const fileData = await this.readBookmarkFileByPath(file.path);
			if (!fileData || normalizePath(fileData.bookPath) !== normalizedPath) {
				continue;
			}
			return file.path;
		}
		return null;
	}

	private async readBookmarkFileForBook(
		book: EpubBook
	): Promise<EpubBookmarkFileFrontmatter | null> {
		const filePath = await this.findCompatibleBookmarkFilePath(book);
		if (!filePath) {
			return null;
		}
		return await this.readBookmarkFileByPath(filePath);
	}

	private async ensureCanonicalBookmarkFilePath(book: EpubBook): Promise<string> {
		const existingPath = await this.findCompatibleBookmarkFilePath(book);
		if (!existingPath) {
			return await this.resolvePreferredBookmarkFilePath(book);
		}
		return (await this.migrateBookmarkFileForBook(book, existingPath)) || existingPath;
	}

	private buildBookmarkFileNameCandidates(book: EpubBook): string[] {
		const filePath = String(book.filePath || "").trim();
		const epubBaseName = filePath
			? EpubLinkService.extractShortBookName(filePath)
			: undefined;
		return buildEpubBookmarkFileNameCandidates({
			title: this.resolveBookTitle(book),
			author: this.resolveBookAuthor(book),
			epubBaseName: epubBaseName || undefined,
		});
	}

	private bookmarkFileBelongsToBook(
		fileData: EpubBookmarkFileFrontmatter,
		book: EpubBook
	): boolean {
		const normalizedBookPath = normalizePath(String(book.filePath || "").trim());
		const normalizedSourceFingerprint = String(book.sourceFingerprint || "").trim();
		const normalizedSourceId = String(book.sourceId || "").trim();
		const normalizedBookId = String(book.id || "").trim();

		return (
			(normalizedBookPath &&
				normalizePath(String(fileData.bookPath || "").trim()) === normalizedBookPath) ||
			(normalizedSourceFingerprint &&
				String(fileData.sourceFingerprint || "").trim() === normalizedSourceFingerprint) ||
			(normalizedSourceId && String(fileData.sourceId || "").trim() === normalizedSourceId) ||
			(normalizedBookId && String(fileData.bookId || "").trim() === normalizedBookId)
		);
	}

	private async resolvePreferredBookmarkFilePath(book: EpubBook): Promise<string> {
		const folderPath = this.getBookmarkFolder();
		const fileNameCandidates = this.buildBookmarkFileNameCandidates(book);

		for (const fileName of fileNameCandidates) {
			const fullPath = folderPath
				? normalizePath(`${folderPath}/${fileName}`)
				: fileName;
			if (!(await this.app.vault.adapter.exists(fullPath))) {
				return fullPath;
			}
			const fileData = await this.readBookmarkFileByPath(fullPath);
			if (fileData && this.bookmarkFileBelongsToBook(fileData, book)) {
				return fullPath;
			}
		}

		const fallbackFileName = fileNameCandidates[0] || buildEpubBookmarkFileName(this.resolveBookTitle(book));
		return await generateUniqueVaultFilePath(
			this.app,
			folderPath || "/",
			fallbackFileName
		);
	}

	private async findExistingBookmarkFilePath(book: EpubBook): Promise<string | null> {
		const folderPath = this.getBookmarkFolder();
		const preferredPath = await this.resolvePreferredBookmarkFilePath(book);
		if (await this.app.vault.adapter.exists(preferredPath)) {
			const preferredData = await this.readBookmarkFileByPath(preferredPath);
			if (preferredData && this.bookmarkFileBelongsToBook(preferredData, book)) {
				return preferredPath;
			}
		}

		const stableKey = this.buildStableKey(book);
		const suffixCandidates = [
			`--${stableKey}.md`,
			...buildLegacyEpubBookmarkStableKeySuffixes({
				sourceFingerprint: book.sourceFingerprint,
				sourceId: book.sourceId,
				canonicalStableKey: stableKey,
			}),
		];
		for (const suffix of suffixCandidates) {
			const suffixMatches = this.app.vault
				.getFiles()
				.filter(
					(file) =>
						file.extension === "md" &&
						this.isBookmarkFileInsideFolder(file.path, folderPath) &&
						file.name.endsWith(suffix)
				)
				.sort((left, right) => right.stat.mtime - left.stat.mtime);

			for (const match of suffixMatches) {
				const fileData = await this.readBookmarkFileByPath(match.path);
				if (fileData && this.bookmarkFileBelongsToBook(fileData, book)) {
					return match.path;
				}
			}
		}

		const legacyTitlePrefix = buildLegacyEpubBookmarkTitleIdPrefix(this.resolveBookTitle(book));
		if (legacyTitlePrefix) {
			const legacyTitleMatches = this.app.vault
				.getFiles()
				.filter(
					(file) =>
						file.extension === "md" &&
						this.isBookmarkFileInsideFolder(file.path, folderPath) &&
						file.name.startsWith(legacyTitlePrefix)
				)
				.sort((left, right) => right.stat.mtime - left.stat.mtime);

			for (const match of legacyTitleMatches) {
				const fileData = await this.readBookmarkFileByPath(match.path);
				if (fileData && this.bookmarkFileBelongsToBook(fileData, book)) {
					return match.path;
				}
			}
		}

		return null;
	}

	private async findCompatibleBookmarkFilePath(book: EpubBook): Promise<string | null> {
		const preferredPath = await this.findExistingBookmarkFilePath(book);
		if (preferredPath) {
			return preferredPath;
		}

		const folderPath = this.getBookmarkFolder();

		for (const file of this.app.vault.getFiles()) {
			if (
				file.extension !== "md" ||
				!this.isBookmarkFileInsideFolder(file.path, folderPath)
			) {
				continue;
			}
			const fileData = await this.readBookmarkFileByPath(file.path);
			if (!fileData) {
				continue;
			}
			if (this.bookmarkFileBelongsToBook(fileData, book)) {
				return file.path;
			}
		}

		return null;
	}

	private isBookmarkFileInsideFolder(filePath: string, folderPath: string): boolean {
		return isEpubBookmarkMarkdownInFolder(filePath, folderPath);
	}

	private async pruneDuplicateBookmarkFiles(book: EpubBook, keepPath: string): Promise<void> {
		const normalizedKeepPath = normalizePath(String(keepPath || "").trim());
		if (!normalizedKeepPath) {
			return;
		}

		const folderPath = this.getBookmarkFolder();
		const normalizedBookPath = normalizePath(String(book.filePath || "").trim());
		const normalizedBookId = String(book.id || "").trim();
		const normalizedSourceFingerprint = String(book.sourceFingerprint || "").trim();
		const normalizedSourceId = String(book.sourceId || "").trim();

		for (const file of this.app.vault.getFiles()) {
			if (
				file.extension !== "md" ||
				!this.isBookmarkFileInsideFolder(file.path, folderPath) ||
				normalizePath(file.path) === normalizedKeepPath
			) {
				continue;
			}

			const fileData = await this.readBookmarkFileByPath(file.path);
			if (!fileData) {
				continue;
			}

			const matchesBook =
				(normalizedBookId && String(fileData.bookId || "").trim() === normalizedBookId) ||
				(normalizedSourceFingerprint &&
					String(fileData.sourceFingerprint || "").trim() === normalizedSourceFingerprint) ||
				(normalizedSourceId && String(fileData.sourceId || "").trim() === normalizedSourceId) ||
				(normalizedBookPath &&
					normalizePath(String(fileData.bookPath || "").trim()) === normalizedBookPath);

			if (matchesBook) {
				await this.safeRemovePath(file.path);
			}
		}
	}

	private buildStableKey(book: EpubBook): string {
		return buildEpubBookmarkStableKey({
			sourceFingerprint: book.sourceFingerprint,
			sourceId: book.sourceId,
			id: book.id,
			title: this.resolveBookTitle(book),
		});
	}

	private async migrateBookmarkFileForBook(
		book: EpubBook,
		filePath: string
	): Promise<string | null> {
		const current = await this.readBookmarkFileByPath(filePath);
		if (!current) {
			return null;
		}

		const preferredPath = await this.resolvePreferredBookmarkFilePath(book);
		const nextStableKey = this.buildStableKey(book);
		const normalizedCurrentPath = normalizePath(String(filePath || "").trim());
		const normalizedPreferredPath = normalizePath(String(preferredPath || "").trim());
		const nextFrontmatter = this.mergeBookIdentity(current, book);
		nextFrontmatter.stableKey = nextStableKey;
		nextFrontmatter.updatedAt = Date.now();
		nextFrontmatter.bookmarks = this.normalizeBookmarkRecords(current.bookmarks, nextStableKey);

		if (normalizedCurrentPath === normalizedPreferredPath) {
			if (!this.bookmarkFrontmatterNeedsPersist(current, nextFrontmatter)) {
				return normalizedPreferredPath;
			}
			await this.writeBookmarkFile(normalizedPreferredPath, nextFrontmatter);
			return normalizedPreferredPath;
		}

		const existingPreferred = await this.readBookmarkFileByPath(normalizedPreferredPath);
		if (existingPreferred) {
			nextFrontmatter.bookmarks = this.mergeBookmarkRecords(
				existingPreferred.bookmarks,
				nextFrontmatter.bookmarks,
				nextStableKey
			);
			nextFrontmatter.readingState =
				nextFrontmatter.readingState ?? existingPreferred.readingState;
			nextFrontmatter.analytics = nextFrontmatter.analytics ?? existingPreferred.analytics;
			nextFrontmatter.user = nextFrontmatter.user ?? existingPreferred.user;
			nextFrontmatter.canvasPath = nextFrontmatter.canvasPath ?? existingPreferred.canvasPath;
			nextFrontmatter.customCoverPath =
				nextFrontmatter.customCoverPath ?? existingPreferred.customCoverPath;
			nextFrontmatter.notesExportPath =
				nextFrontmatter.notesExportPath ?? existingPreferred.notesExportPath;
			nextFrontmatter.readingReferencePoint =
				nextFrontmatter.readingReferencePoint ?? existingPreferred.readingReferencePoint;
			nextFrontmatter.concealedTexts = nextFrontmatter.concealedTexts?.length
				? nextFrontmatter.concealedTexts
				: existingPreferred.concealedTexts;
			nextFrontmatter.tocChapterMarks =
				nextFrontmatter.tocChapterMarks && Object.keys(nextFrontmatter.tocChapterMarks).length > 0
					? nextFrontmatter.tocChapterMarks
					: existingPreferred.tocChapterMarks;
		}

		await this.writeBookmarkFile(normalizedPreferredPath, nextFrontmatter);
		await this.safeRemovePath(normalizedCurrentPath);
		await this.pruneDuplicateBookmarkFiles(book, normalizedPreferredPath);
		return normalizedPreferredPath;
	}

	private bookmarkFrontmatterNeedsPersist(
		current: EpubBookmarkFileFrontmatter,
		next: EpubBookmarkFileFrontmatter
	): boolean {
		if (current.stableKey !== next.stableKey) {
			return true;
		}
		if (current.bookId !== next.bookId) {
			return true;
		}
		if (normalizePath(current.bookPath) !== normalizePath(next.bookPath)) {
			return true;
		}
		if (current.bookTitle !== next.bookTitle) {
			return true;
		}
		if (current.bookAuthor !== next.bookAuthor) {
			return true;
		}
		if (current.sourceId !== next.sourceId) {
			return true;
		}
		if (current.sourceFingerprint !== next.sourceFingerprint) {
			return true;
		}
		if (current.bookmarks.length !== next.bookmarks.length) {
			return true;
		}
		if (JSON.stringify(current.readingState) !== JSON.stringify(next.readingState)) {
			return true;
		}
		if (JSON.stringify(current.analytics) !== JSON.stringify(next.analytics)) {
			return true;
		}
		if (current.bookLanguage !== next.bookLanguage) {
			return true;
		}
		if (current.wordCount !== next.wordCount) {
			return true;
		}
		if (current.chapterCount !== next.chapterCount) {
			return true;
		}
		if (current.displayTitle !== next.displayTitle) {
			return true;
		}
		if (current.coverPath !== next.coverPath) {
			return true;
		}
		if (current.publisher !== next.publisher) {
			return true;
		}
		if (current.description !== next.description) {
			return true;
		}
		return false;
	}

	private mergeBookmarkRecords(
		existing: EpubBookmarkRecord[],
		incoming: EpubBookmarkRecord[],
		stableKey: string
	): EpubBookmarkRecord[] {
		const merged = new Map<string, EpubBookmarkRecord>();
		for (const item of [...existing, ...incoming]) {
			const normalized = this.normalizeBookmarkRecord(item, stableKey);
			if (!normalized) {
				continue;
			}
			const key = EpubLinkService.normalizeCfi(normalized.cfi);
			const current = merged.get(key);
			if (!current || (normalized.createdAt || 0) >= (current.createdAt || 0)) {
				merged.set(key, normalized);
			}
		}
		return Array.from(merged.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
	}

	private resolveBookTitle(book: EpubBook): string {
		return (
			String(book.metadata?.title || "").trim() ||
			EpubLinkService.extractShortBookName(String(book.filePath || "").trim()) ||
			"EPUB"
		);
	}

	private resolveBookAuthor(book: EpubBook): string | undefined {
		const author = String(book.metadata?.author || "").trim();
		return author || undefined;
	}

	private createEmptyFileFrontmatter(book: EpubBook): EpubBookmarkFileFrontmatter {
		return this.mergeBookIdentity(
			{
				format: EPUB_BOOKMARK_FILE_FORMAT,
				weave_epub_bookmark_file: true,
				stableKey: this.buildStableKey(book),
				bookId: String(book.id || "").trim(),
				bookPath: normalizePath(String(book.filePath || "").trim()),
				bookTitle: this.resolveBookTitle(book),
				updatedAt: Date.now(),
				bookmarks: [],
			},
			book
		);
	}

	private mergeBookIdentity(
		frontmatter: EpubBookmarkFileFrontmatter,
		book: EpubBook
	): EpubBookmarkFileFrontmatter {
		const metadata = book.metadata;
		const bookTitle = this.resolveBookTitle(book);
		const bookAuthor = this.resolveBookAuthor(book);
		const bookPath = normalizePath(String(book.filePath || "").trim());
		const displayTitle = deriveEpubBookmarkDisplayTitle({
			bookTitle,
			bookAuthor,
			bookPath,
		});
		return {
			...frontmatter,
			format: EPUB_BOOKMARK_FILE_FORMAT,
			weave_epub_bookmark_file: true,
			stableKey: this.buildStableKey(book),
			bookId: String(book.id || "").trim(),
			sourceId: typeof book.sourceId === "string" ? book.sourceId : undefined,
			sourceFingerprint:
				typeof book.sourceFingerprint === "string" ? book.sourceFingerprint : undefined,
			bookPath,
			displayTitle: frontmatter.displayTitle || displayTitle,
			bookTitle,
			bookAuthor,
			bookLanguage: String(metadata?.language || "").trim() || frontmatter.bookLanguage,
			publisher: metadata?.publisher || frontmatter.publisher,
			isbn: metadata?.isbn || frontmatter.isbn,
			publishDate: metadata?.publishDate || frontmatter.publishDate,
			subjects:
				metadata?.subjects && metadata.subjects.length > 0
					? metadata.subjects
					: frontmatter.subjects,
			description: metadata?.description || frontmatter.description,
			translator: metadata?.translator || frontmatter.translator,
			coverPath: frontmatter.coverPath,
			wordCount:
				typeof metadata?.wordCount === "number" && metadata.wordCount > 0
					? metadata.wordCount
					: frontmatter.wordCount,
			chapterCount:
				typeof metadata?.chapterCount === "number" && metadata.chapterCount > 0
					? metadata.chapterCount
					: frontmatter.chapterCount,
		};
	}

	private createBookmarkId(stableKey: string, cfi: string, createdAt: number): string {
		const seed = `${stableKey}::${createdAt}::${cfi}`;
		return `epub-bm-${this.hashString(seed).toString(36)}`;
	}

	private hashString(value: string): number {
		let hash = 0;
		for (let index = 0; index < value.length; index += 1) {
			hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
		}
		return hash;
	}

	private async readBookmarkFileByPath(
		filePath: string
	): Promise<EpubBookmarkFileFrontmatter | null> {
		const normalizedPath = normalizePath(String(filePath || "").trim());
		if (!normalizedPath) {
			return null;
		}

		const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (existing instanceof TFile) {
			try {
				const content = await this.app.vault.read(existing);
				return this.parseBookmarkFileContent(content);
			} catch (error) {
				if (!isFilesystemNotFoundError(error)) {
					logger.warn("[EpubBookmarkService] Failed to read bookmark file:", error);
				}
			}
		}

		try {
			if (!(await this.app.vault.adapter.exists(normalizedPath))) {
				return null;
			}
			const content = await this.app.vault.adapter.read(normalizedPath);
			return this.parseBookmarkFileContent(content);
		} catch (error) {
			if (!isFilesystemNotFoundError(error)) {
				logger.warn("[EpubBookmarkService] Failed to read bookmark file via adapter:", error);
			}
			return null;
		}
	}

	private async safeRemovePath(filePath: string): Promise<void> {
		const normalizedPath = normalizePath(String(filePath || "").trim());
		if (!normalizedPath) {
			return;
		}
		try {
			await this.app.vault.adapter.remove(normalizedPath);
		} catch (error) {
			const code =
				error && typeof error === "object" && "code" in error
					? String((error as { code?: string }).code || "")
					: "";
			const message = error instanceof Error ? error.message : String(error);
			if (code === "ENOENT" || /no such file or directory/i.test(message)) {
				return;
			}
			logger.warn("[EpubBookmarkService] Failed to remove bookmark file:", error);
		}
	}

	private parseBookmarkFileContent(content: string): EpubBookmarkFileFrontmatter | null {
		const value = parseEpubBookmarkVaultYamlBlock(content);
		if (!value || !isEpubBookmarkVaultFrontmatter(value)) {
			return null;
		}
		try {
			return this.normalizeBookmarkFileFrontmatter(value);
		} catch (error) {
			logger.warn("[EpubBookmarkService] Failed to parse bookmark frontmatter:", error);
			return null;
		}
	}

	private normalizeBookmarkFileFrontmatter(
		value: Record<string, unknown>
	): EpubBookmarkFileFrontmatter | null {
		const format = unknownPlainText(value.format).trim();
		const stableKey = unknownPlainText(value.stableKey).trim();
		const bookId = unknownPlainText(value.bookId).trim();
		const bookPath = normalizePath(unknownPlainText(value.bookPath).trim());
		const bookTitle = unknownPlainText(value.bookTitle).trim();
		if (
			(format &&
				!EPUB_BOOKMARK_ACCEPTED_FORMATS.includes(
					format as (typeof EPUB_BOOKMARK_ACCEPTED_FORMATS)[number]
				)) ||
			!stableKey ||
			!bookPath
		) {
			return null;
		}
		return {
			format: EPUB_BOOKMARK_FILE_FORMAT,
			weave_epub_bookmark_file: true,
			stableKey,
			bookId,
			sourceId: typeof value.sourceId === "string" ? value.sourceId : undefined,
			sourceFingerprint:
				typeof value.sourceFingerprint === "string" ? value.sourceFingerprint : undefined,
			bookPath,
			displayTitle:
				typeof value.displayTitle === "string" ? value.displayTitle.trim() : undefined,
			bookTitle,
			bookAuthor: typeof value.bookAuthor === "string" ? value.bookAuthor : undefined,
			bookLanguage: typeof value.bookLanguage === "string" ? value.bookLanguage : undefined,
			publisher: typeof value.publisher === "string" ? value.publisher : undefined,
			isbn: typeof value.isbn === "string" ? value.isbn : undefined,
			publishDate: typeof value.publishDate === "string" ? value.publishDate : undefined,
			subjects: Array.isArray(value.subjects)
				? value.subjects.map((item) => String(item || "").trim()).filter(Boolean)
				: undefined,
			description: typeof value.description === "string" ? value.description : undefined,
			translator: typeof value.translator === "string" ? value.translator : undefined,
			coverPath: typeof value.coverPath === "string" ? value.coverPath : undefined,
			canvasPath: normalizeBookmarkCanvasPath(value.canvasPath) || undefined,
			customCoverPath: normalizeBookmarkVaultPath(value.customCoverPath) || undefined,
			notesExportPath: normalizeBookmarkVaultPath(value.notesExportPath) || undefined,
			readingReferencePoint: this.normalizeStoredReadingReferencePoint(value.readingReferencePoint),
			concealedTexts: this.normalizeStoredConcealedTexts(value.concealedTexts),
			tocChapterMarks: this.normalizeStoredTocChapterMarks(value.tocChapterMarks),
			wordCount: typeof value.wordCount === "number" ? value.wordCount : undefined,
			chapterCount: typeof value.chapterCount === "number" ? value.chapterCount : undefined,
			updatedAt: typeof value.updatedAt === "number" ? value.updatedAt : 0,
			bookmarks: this.normalizeBookmarkRecords(value.bookmarks, stableKey),
			readingState: this.normalizeReadingState(value.readingState) || undefined,
			analytics: readEpubBookmarkAnalyticsFromFrontmatter(value) || undefined,
			user: this.normalizeUserMetadata(value.user) || undefined,
		};
	}

	private normalizeUserMetadata(value: unknown): EpubBookmarkUserMetadata | null {
		if (!value || typeof value !== "object") {
			return null;
		}
		const record = value as Record<string, unknown>;
		const tags = Array.isArray(record.tags)
			? record.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
			: undefined;
		const rating =
			typeof record.rating === "number" && Number.isFinite(record.rating)
				? record.rating
				: record.rating === null
					? null
					: undefined;
		const priority =
			typeof record.priority === "string" && record.priority.trim()
				? record.priority.trim()
				: undefined;
		const notes =
			typeof record.notes === "string" && record.notes.trim() ? record.notes.trim() : undefined;

		if (!tags?.length && rating == null && !priority && !notes) {
			return null;
		}

		return {
			tags,
			rating,
			priority,
			notes,
		};
	}

	private normalizeStoredReadingReferencePoint(
		value: unknown
	): EpubReadingReferencePoint | undefined {
		const point = normalizeReadingReferencePoint(value);
		return point?.cfi ? point : undefined;
	}

	private normalizeStoredConcealedTexts(value: unknown): ConcealedText[] | undefined {
		const texts = normalizeConcealedTexts(value);
		return texts.length > 0 ? texts : undefined;
	}

	private normalizeStoredTocChapterMarks(value: unknown): EpubTocChapterMarkMap | undefined {
		const marks = normalizeTocChapterMarkMap(value);
		return Object.keys(marks).length > 0 ? marks : undefined;
	}

	private normalizeReadingState(value: unknown): EpubBookmarkReadingState | null {
		if (!value || typeof value !== "object") {
			return null;
		}
		const record = value as Record<string, unknown>;
		const currentPosition = this.normalizeReadingPosition(record.currentPosition);
		const readingStats = this.normalizeReadingStats(record.readingStats);
		if (!currentPosition && !readingStats) {
			return null;
		}
		const now = Date.now();
		return {
			currentPosition: currentPosition ?? { chapterIndex: 0, cfi: "", percent: 0 },
			readingStats:
				readingStats ?? normalizeReadingPaceStats({ createdTime: now, lastReadTime: now }),
		};
	}

	private normalizeReadingPosition(value: unknown): ReadingPosition | null {
		if (!value || typeof value !== "object") {
			return null;
		}
		const position = value as Partial<ReadingPosition>;
		const cfi = String(position.cfi || "").trim();
		if (!cfi && typeof position.percent !== "number") {
			return null;
		}
		return {
			chapterIndex: typeof position.chapterIndex === "number" ? position.chapterIndex : 0,
			cfi,
			percent: typeof position.percent === "number" ? position.percent : 0,
		};
	}

	private normalizeReadingStats(value: unknown): ReadingStats | null {
		if (!isPlainObject(value)) {
			return null;
		}
		return normalizeReadingPaceStats(value);
	}

	private normalizeBookmarkRecords(value: unknown, stableKey: string): EpubBookmarkRecord[] {
		if (!Array.isArray(value)) {
			return [];
		}
		return value
			.map((item) => this.normalizeBookmarkRecord(item, stableKey))
			.filter((item): item is EpubBookmarkRecord => Boolean(item))
			.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
	}

	private normalizeBookmarkRecord(value: unknown, stableKey: string): EpubBookmarkRecord | null {
		if (!value || typeof value !== "object") {
			return null;
		}
		const record = value as Record<string, unknown>;
		const cfi = EpubLinkService.normalizeCfi(unknownPlainText(record.cfi).trim());
		if (!cfi) {
			return null;
		}
		const createdAt = typeof record.createdAt === "number" ? record.createdAt : Date.now();
		const chapterTitle = unknownPlainText(record.chapterTitle).trim();
		return {
			id:
				typeof record.id === "string" && record.id.trim().length > 0
					? record.id.trim()
					: this.createBookmarkId(stableKey, cfi, createdAt),
			cfi,
			chapterIndex: typeof record.chapterIndex === "number" ? record.chapterIndex : 0,
			percent: typeof record.percent === "number" ? record.percent : 0,
			chapterTitle,
			pageNumber: typeof record.pageNumber === "number" ? record.pageNumber : undefined,
			totalPages: typeof record.totalPages === "number" ? record.totalPages : undefined,
			createdAt,
			preview: typeof record.preview === "string" ? record.preview : undefined,
		};
	}

	private async writeBookmarkFile(
		filePath: string,
		frontmatter: EpubBookmarkFileFrontmatter
	): Promise<void> {
		const normalizedPath = normalizePath(String(filePath || "").trim());
		if (!normalizedPath) {
			throw new Error("Bookmark file path is required");
		}

		const prepared = await this.prepareFrontmatterForWrite(frontmatter);
		const content = this.renderBookmarkFileContent(prepared);
		const adapter = this.app.vault.adapter;
		await DirectoryUtils.ensureDirForFile(adapter, normalizedPath);

		const existing = this.app.vault.getAbstractFileByPath(normalizedPath);
		if (existing instanceof TFile) {
			try {
				await this.app.vault.modify(existing, content);
				return;
			} catch (error) {
				if (!isFilesystemNotFoundError(error)) {
					throw error;
				}
			}
		}

		if (await adapter.exists(normalizedPath)) {
			await adapter.write(normalizedPath, content);
			return;
		}

		try {
			await this.app.vault.create(normalizedPath, content);
		} catch (error) {
			if (await adapter.exists(normalizedPath)) {
				await adapter.write(normalizedPath, content);
				return;
			}
			throw error;
		}
	}

	private async prepareFrontmatterForWrite(
		frontmatter: EpubBookmarkFileFrontmatter
	): Promise<EpubBookmarkFileFrontmatter> {
		const bookmarkFolder = this.getBookmarkFolder();
		const displayTitle =
			frontmatter.displayTitle ||
			deriveEpubBookmarkDisplayTitle({
				bookTitle: frontmatter.bookTitle,
				bookAuthor: frontmatter.bookAuthor,
				bookPath: frontmatter.bookPath,
			});
		const coverPath =
			(await ensureEpubBookmarkCoverPath(this.app, {
				bookPath: frontmatter.bookPath,
				stableKey: frontmatter.stableKey,
				bookmarkFolder,
				existingCoverPath: frontmatter.coverPath,
			})) || frontmatter.coverPath;

		return {
			...frontmatter,
			format: EPUB_BOOKMARK_FILE_FORMAT,
			displayTitle,
			coverPath,
			user: frontmatter.user ?? {
				tags: [],
				rating: null,
				priority: "",
				notes: "",
			},
		};
	}

	private renderBookmarkFileContent(frontmatter: EpubBookmarkFileFrontmatter): string {
		const displayTitle =
			frontmatter.displayTitle ||
			deriveEpubBookmarkDisplayTitle({
				bookTitle: frontmatter.bookTitle,
				bookAuthor: frontmatter.bookAuthor,
				bookPath: frontmatter.bookPath,
			});
		return renderEpubBookmarkFileContent(
			{
				stableKey: frontmatter.stableKey,
				bookId: frontmatter.bookId,
				sourceId: frontmatter.sourceId,
				sourceFingerprint: frontmatter.sourceFingerprint,
				bookPath: frontmatter.bookPath,
				displayTitle,
				bookTitle: frontmatter.bookTitle,
				bookAuthor: frontmatter.bookAuthor,
				bookLanguage: frontmatter.bookLanguage,
				publisher: frontmatter.publisher,
				isbn: frontmatter.isbn,
				publishDate: frontmatter.publishDate,
				subjects: frontmatter.subjects,
				description: frontmatter.description,
				translator: frontmatter.translator,
				coverPath: frontmatter.coverPath,
				canvasPath: frontmatter.canvasPath,
				customCoverPath: frontmatter.customCoverPath,
				notesExportPath: frontmatter.notesExportPath,
				readingReferencePoint: frontmatter.readingReferencePoint,
				concealedTexts: frontmatter.concealedTexts,
				tocChapterMarks: frontmatter.tocChapterMarks,
				wordCount: frontmatter.wordCount,
				chapterCount: frontmatter.chapterCount,
				updatedAt: frontmatter.updatedAt,
				bookmarks: frontmatter.bookmarks,
				readingState: frontmatter.readingState,
				analytics: frontmatter.analytics,
				user: frontmatter.user,
			},
			this.linkService
		);
	}
}
