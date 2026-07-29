import type { ISODate, ObjectId } from "./common.js";
import type { FileLike } from "../utils/file.js";

export type ItemType = "file" | "folder";

export type AiProcessingStatus = "none" | "pending" | "processing" | "completed" | "failed";

export interface ItemAiProcessing {
  status?: AiProcessingStatus;
  /** Set by the backend on upload of a `text/plain`/`application/pdf`/`.docx` file; no further state is observable from this SDK — treat as fire-and-forget. */
  queued?: boolean;
  queuedAt?: ISODate;
  textContent?: string;
  processedAt?: ISODate;
  topics?: string[];
  chunksCount?: number;
}

export type ItemContentSource = "user_upload" | "ai_generated" | "marketplace_purchase" | "shared_link";

export interface Item {
  _id: ObjectId;
  name: string;
  type: ItemType;
  parentId: ObjectId | null;
  owner: ObjectId;
  size?: number;
  mimeType?: string | null;
  /**
   * A presigned, expiring GCS URL when `type === 'file'`. Do not persist it — re-fetch
   * (`items.get`/`items.list`) to get a fresh one once it's close to expiring.
   */
  url?: string | null;
  aiProcessing?: ItemAiProcessing;
  contentSource?: ItemContentSource;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** One entry in the root-first breadcrumb path returned by `items.path()`. */
export interface Breadcrumb {
  id: ObjectId;
  name: string;
  type: ItemType;
}

export interface ListItemsParams {
  parentId?: ObjectId;
  limit?: number;
  cursor?: string;
  page?: number;
}

export interface CreateFolderInput {
  name: string;
  parentId?: ObjectId;
}

export interface UploadItemInput {
  file: FileLike;
  name: string;
  parentId?: ObjectId;
}

export interface CreateItemFromUrlInput {
  url: string;
  name: string;
  parentId?: ObjectId;
}

export interface UpdateItemInput {
  name?: string;
  parentId?: ObjectId;
}

export interface DeleteItemResult {
  message: string;
  deletedCount: number;
}
