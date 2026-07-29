import type { HttpClient } from "../core/http.js";
import { iteratePages, normalizePage, type Page } from "../core/pagination.js";
import { CashDriveError } from "../errors.js";
import type {
  Breadcrumb,
  CreateFolderInput,
  CreateItemFromUrlInput,
  DeleteItemResult,
  Item,
  ListItemsParams,
  UpdateItemInput,
  UploadItemInput,
} from "../types/item.js";

const DEFAULT_LIST_LIMIT = 20;

export class ItemsResource {
  private rootFolderPromise: Promise<Item> | undefined;

  constructor(private readonly getHttp: () => Promise<HttpClient>) {}

  /**
   * Lists the children of a folder. **Requires `items:read`.**
   *
   * `GET /items` with no `parentId` doesn't list root children on the backend — it
   * returns the root folder document itself (see {@link getRootFolder}). This method
   * transparently resolves and caches the owner's root folder id (via one extra call to
   * `getRootFolder()`, cached for the process lifetime) so that calling it with no
   * `parentId` does what you'd expect: lists the root folder's children.
   *
   * @example
   * const page = await client.items.list({ parentId: someFolderId });
   * const rootChildren = await client.items.list(); // resolves the root folder for you
   */
  async list(params: ListItemsParams = {}): Promise<Page<Item>> {
    const parentId = params.parentId ?? (await this.resolveRootFolderId());
    const limit = params.limit ?? DEFAULT_LIST_LIMIT;
    const http = await this.getHttp();
    const raw = await http.request<unknown>("GET", "/items", {
      query: { parentId, limit, cursor: params.cursor, page: params.page },
    });
    return normalizePage<Item>(raw, "items", limit);
  }

  /** Async-generator form of {@link list}. Requires `items:read`. */
  async *iterate(params: ListItemsParams = {}): AsyncGenerator<Item> {
    yield* iteratePages<Item>((p) => this.list(p as ListItemsParams), params as Record<string, unknown>);
  }

  /**
   * Calls `GET /items` with no `parentId` and returns the **raw** backend behaviour: the
   * root folder document itself, not its children. `list()` is almost always what you
   * want instead; this exists to expose the quirk directly, and is what `list()` uses
   * internally to resolve and cache the root folder id.
   */
  async getRootFolder(): Promise<Item> {
    const http = await this.getHttp();
    const raw = await http.request<{ items: Item[] }>("GET", "/items");
    const item = raw.items[0];
    if (!item) {
      throw new CashDriveError("The backend returned no root folder for this owner.", "server_error");
    }
    return item;
  }

  private resolveRootFolderId(): Promise<string> {
    if (!this.rootFolderPromise) {
      this.rootFolderPromise = this.getRootFolder();
    }
    return this.rootFolderPromise.then((root) => root._id);
  }

  /**
   * Fetches a single item by id. **Requires `items:read`.**
   *
   * `item.url` (when present) is a presigned, expiring GCS URL — don't persist it;
   * re-fetch to refresh.
   *
   * @example
   * const item = await client.items.get(itemId);
   */
  async get(id: string): Promise<Item> {
    const http = await this.getHttp();
    return http.request<Item>("GET", `/items/${encodeURIComponent(id)}`);
  }

  /**
   * Creates a folder. **Requires `items:write`.**
   *
   * @example
   * const folder = await client.items.createFolder({ name: "reports" });
   */
  async createFolder(input: CreateFolderInput): Promise<Item> {
    const http = await this.getHttp();
    return http.request<Item>("POST", "/items", {
      body: { name: input.name, type: "folder", parentId: input.parentId },
    });
  }

  /**
   * Uploads a file. **Requires `items:write`.** Always sent as `multipart/form-data` —
   * never set `Content-Type` yourself.
   *
   * Uploads of `text/plain`, `application/pdf`, and `.docx` are queued by the backend for
   * background processing about a second later; the returned item may carry
   * `aiProcessing.queued === true` with no further observable state through this SDK.
   * Treat it as fire-and-forget.
   *
   * @example
   * import { fileFromPath } from "cash-drive/node";
   * const file = await fileFromPath("./report.pdf");
   * const item = await client.items.upload({ file, name: "report.pdf" });
   */
  async upload(input: UploadItemInput): Promise<Item> {
    const form = new FormData();
    form.set("file", input.file, input.file.name);
    form.set("name", input.name);
    if (input.parentId) form.set("parentId", input.parentId);
    const http = await this.getHttp();
    return http.request<Item>("POST", "/items", { body: form });
  }

  /**
   * Creates an item from a remote URL. **Requires `items:write`.** The backend only reads
   * `url` from `multipart/form-data` — never from a JSON body — so this always sends a
   * form, even though there's no file involved.
   *
   * @example
   * const item = await client.items.createFromUrl({ url: "https://example.com/a.pdf", name: "a.pdf" });
   */
  async createFromUrl(input: CreateItemFromUrlInput): Promise<Item> {
    const form = new FormData();
    form.set("url", input.url);
    form.set("name", input.name);
    if (input.parentId) form.set("parentId", input.parentId);
    const http = await this.getHttp();
    return http.request<Item>("POST", "/items", { body: form });
  }

  /**
   * Renames and/or moves an item. **Requires `items:write`.** Moving a folder into its
   * own descendant throws a `ValidationError` ("Cannot move folder into itself or its
   * children").
   *
   * @example
   * const renamed = await client.items.update(itemId, { name: "new-name.pdf" });
   */
  async update(id: string, input: UpdateItemInput): Promise<Item> {
    const http = await this.getHttp();
    return http.request<Item>("PUT", `/items/${encodeURIComponent(id)}`, { body: input });
  }

  /**
   * Deletes an item. **Requires `items:write`.**
   *
   * @destructive Recursive: deletes the item, every descendant, their processing chunks,
   * and their GCS objects. Not reversible.
   *
   * @example
   * await client.items.delete(itemId);
   */
  async delete(id: string): Promise<DeleteItemResult> {
    const http = await this.getHttp();
    return http.request<DeleteItemResult>("DELETE", `/items/${encodeURIComponent(id)}`);
  }

  /**
   * Returns the root-first breadcrumb path to an item. **Requires `items:read`.** The
   * response is a bare array, not wrapped in an envelope.
   *
   * @example
   * const crumbs = await client.items.path(itemId); // [{ id, name, type }, ...]
   */
  async path(itemId: string): Promise<Breadcrumb[]> {
    const http = await this.getHttp();
    return http.request<Breadcrumb[]>("GET", "/items/path", { query: { itemId } });
  }
}
