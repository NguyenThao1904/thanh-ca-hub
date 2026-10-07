// Rules for uploaded sheet-music files. The server checks the same limits
// (backend/thanhca/files.py); checking here first avoids a long upload that would fail.

export const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PDF_MIME_TYPE = "application/pdf";

/** Limit per file before the browser downsizes large photos. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGES_PER_SONG = 40;

export const IMAGE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp";
export const PDF_ACCEPT = ".pdf,application/pdf";

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: PDF_MIME_TYPE,
};

export type FileKind = "image" | "pdf";
type FileLike = { name: string; type: string; size: number };

export function fileExtension(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toLowerCase() : "";
}

/** The MIME type of a file, falling back to its extension (some phones send no type). */
export function detectMimeType(file: Pick<FileLike, "name" | "type">) {
  const fromExtension = MIME_BY_EXTENSION[fileExtension(file.name)];
  if (file.type && Object.values(MIME_BY_EXTENSION).includes(file.type)) return file.type;
  return fromExtension ?? file.type ?? "";
}

export type FileProblem = { problem: "type" | "size"; maxBytes: number };

export function checkFile(file: FileLike, kind: FileKind): FileProblem | null {
  const mime = detectMimeType(file);
  const maxBytes = kind === "pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES;
  const typeOk = kind === "pdf" ? mime === PDF_MIME_TYPE : (IMAGE_MIME_TYPES as readonly string[]).includes(mime);
  if (!typeOk) return { problem: "type", maxBytes };
  if (file.size > maxBytes) return { problem: "size", maxBytes };
  return null;
}

export function formatBytes(bytes: number, localeTag: string) {
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${new Intl.NumberFormat(localeTag, { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
}
