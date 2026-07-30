/**
 * Anything the SDK can hand to `FormData.set()` for an upload. The global `File` (Node 20+
 * via undici, and every browser) satisfies this — `node.ts#fileFromPath` returns one.
 */
export type FileLike = File;

/** Extension -> MIME type, covering the backend's AI-processing-queue types plus common ones. */
export const EXTENSION_MIME_TYPES: Record<string, string> = {
  ".txt": "text/plain",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".md": "text/markdown",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".csv": "text/csv",
};

export const DEFAULT_MIME_TYPE = "application/octet-stream";

/** Looks up a MIME type for a file extension (case-insensitive, leading dot required). Falls back to `application/octet-stream`. */
export function mimeTypeForExtension(ext: string): string {
  return EXTENSION_MIME_TYPES[ext.toLowerCase()] ?? DEFAULT_MIME_TYPE;
}
