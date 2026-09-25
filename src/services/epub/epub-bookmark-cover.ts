import type { App } from "obsidian";
import { TFile, normalizePath } from "obsidian";
import { DirectoryUtils } from "../../utils/directory-utils";
import { logger } from "../../utils/logger";
import { isSupportedBookPath } from "./book-format";
import { FoliateVaultPublicationParser } from "./FoliateVaultPublicationParser";

export const EPUB_BOOKMARK_COVER_SUBFOLDER = "covers";

export function buildEpubBookmarkCoverFolderPath(bookmarkFolder: string): string {
	const normalizedFolder = normalizePath(String(bookmarkFolder || "").trim());
	return normalizePath(`${normalizedFolder}/${EPUB_BOOKMARK_COVER_SUBFOLDER}`);
}

export function buildEpubBookmarkCoverPath(
	bookmarkFolder: string,
	stableKey: string,
	extension = "jpg"
): string {
	const safeKey = String(stableKey || "")
		.trim()
		.replace(/[\\/:*?"<>|]/g, "-");
	return normalizePath(
		`${buildEpubBookmarkCoverFolderPath(bookmarkFolder)}/${safeKey}.${extension}`
	);
}

function decodeDataUrlToArrayBuffer(dataUrl: string): { buffer: ArrayBuffer; mimeType: string } | null {
	const normalized = String(dataUrl || "").trim();
	const match = normalized.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/i);
	if (!match) {
		return null;
	}

	const mimeType = String(match[1] || "image/jpeg").trim().toLowerCase();
	const base64 = match[2] || "";
	if (!base64) {
		return null;
	}

	try {
		const binary = atob(base64);
		const bytes = new Uint8Array(binary.length);
		for (let index = 0; index < binary.length; index += 1) {
			bytes[index] = binary.charCodeAt(index);
		}
		return {
			buffer: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
			mimeType,
		};
	} catch {
		return null;
	}
}

function resolveCoverExtension(mimeType: string): string {
	switch (mimeType) {
		case "image/png":
			return "png";
		case "image/webp":
			return "webp";
		case "image/gif":
			return "gif";
		default:
			return "jpg";
	}
}

const COVER_EXTENSIONS = ["jpg", "png", "webp", "gif"] as const;

type CoverExtractionResult = {
	sourceSignature: string;
	coverPath?: string;
};

const coverExtractionResults = new WeakMap<App, Map<string, CoverExtractionResult>>();
const inflightCoverExtractions = new WeakMap<App, Map<string, Promise<string | undefined>>>();

function getAppScopedMap<T>(store: WeakMap<App, Map<string, T>>, app: App): Map<string, T> {
	let map = store.get(app);
	if (!map) {
		map = new Map();
		store.set(app, map);
	}
	return map;
}

function buildSourceSignature(file: TFile): string {
	return `${file.stat?.size ?? 0}:${file.stat?.mtime ?? 0}`;
}

async function findExistingCoverFile(
	app: App,
	bookmarkFolder: string,
	stableKey: string
): Promise<string | undefined> {
	for (const extension of COVER_EXTENSIONS) {
		const candidate = buildEpubBookmarkCoverPath(bookmarkFolder, stableKey, extension);
		if (await app.vault.adapter.exists(candidate)) {
			return candidate;
		}
	}
	return undefined;
}

async function extractCoverToVault(
	app: App,
	bookPath: string,
	bookmarkFolder: string,
	stableKey: string
): Promise<string | undefined> {
	let coverImage: string | undefined;
	const parser = new FoliateVaultPublicationParser(app);
	try {
		const loaded = await parser.load(bookPath, { coverOnly: true });
		coverImage = loaded.coverImage;
	} finally {
		parser.dispose();
	}

	const decoded = coverImage ? decodeDataUrlToArrayBuffer(coverImage) : null;
	if (!decoded) {
		return undefined;
	}

	const extension = resolveCoverExtension(decoded.mimeType);
	const coverPath = buildEpubBookmarkCoverPath(bookmarkFolder, stableKey, extension);
	await DirectoryUtils.ensureDirForFile(app.vault.adapter, coverPath);
	await app.vault.adapter.writeBinary(coverPath, decoded.buffer);
	return coverPath;
}

export async function ensureEpubBookmarkCoverPath(
	app: App,
	input: {
		bookPath: string;
		stableKey: string;
		bookmarkFolder: string;
		existingCoverPath?: string;
	}
): Promise<string | undefined> {
	const existingCoverPath = normalizePath(String(input.existingCoverPath || "").trim());
	if (existingCoverPath && (await app.vault.adapter.exists(existingCoverPath))) {
		return existingCoverPath;
	}

	const bookPath = normalizePath(String(input.bookPath || "").trim());
	const stableKey = String(input.stableKey || "").trim();
	if (!bookPath || !stableKey || !isSupportedBookPath(bookPath)) {
		return existingCoverPath || undefined;
	}

	const vaultFile = app.vault.getAbstractFileByPath(bookPath);
	if (!(vaultFile instanceof TFile)) {
		return existingCoverPath || undefined;
	}

	const onDiskCoverPath = await findExistingCoverFile(app, input.bookmarkFolder, stableKey);
	if (onDiskCoverPath) {
		return onDiskCoverPath;
	}

	// Misses are cached too: bookmark writes are frequent and parsing a large MOBI blocks the renderer.
	const cacheKey = `${bookPath}\u0000${normalizePath(input.bookmarkFolder)}\u0000${stableKey}`;
	const sourceSignature = buildSourceSignature(vaultFile);
	const results = getAppScopedMap(coverExtractionResults, app);
	const cached = results.get(cacheKey);
	if (cached && cached.sourceSignature === sourceSignature) {
		return cached.coverPath || existingCoverPath || undefined;
	}

	const inflight = getAppScopedMap(inflightCoverExtractions, app);
	let pending = inflight.get(cacheKey);
	if (!pending) {
		pending = extractCoverToVault(app, bookPath, input.bookmarkFolder, stableKey)
			.then((coverPath) => {
				results.set(cacheKey, { sourceSignature, coverPath });
				return coverPath;
			})
			.catch((error) => {
				logger.warn("[EpubBookmarkCover] Failed to load cover from book:", error);
				results.set(cacheKey, { sourceSignature });
				return undefined;
			})
			.finally(() => {
				inflight.delete(cacheKey);
			});
		inflight.set(cacheKey, pending);
	}

	return (await pending) || existingCoverPath || undefined;
}
