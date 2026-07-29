import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { mimeTypeForExtension } from "./utils/file.js";

export type { FileLike } from "./utils/file.js";

/**
 * Reads a file from disk into a `File` suitable for `client.items.upload()`. Node-only —
 * imported from `cash-drive/node`, never from the root or `/agent` entries, so browser
 * bundlers never pull in `node:fs`.
 *
 * @example
 * import { fileFromPath } from "cash-drive/node";
 * const file = await fileFromPath("./report.pdf");
 * await client.items.upload({ file, name: "report.pdf" });
 */
export async function fileFromPath(path: string, o?: { name?: string; type?: string }): Promise<File> {
  const buffer = await readFile(path);
  const name = o?.name ?? basename(path);
  const type = o?.type ?? mimeTypeForExtension(extname(path));
  return new File([buffer], name, { type });
}
