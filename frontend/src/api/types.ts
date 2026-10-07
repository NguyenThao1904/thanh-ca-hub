// Shapes of the API's JSON (see backend/thanhca/schemas.py, or /api/docs on a running server).

import type { Locale } from "@/lib/i18n/config";
import type { SortOption } from "@/lib/library";

export type Role = "admin" | "member";

export type SessionUser = {
  id: number;
  email: string;
  displayName: string;
  role: Role;
  isAdmin: boolean;
};

export type AppConfig = { appName: string; defaultLocale: Locale; timeZone: string };

export type SessionData = {
  config: AppConfig;
  user: SessionUser | null;
  /** Set in the browser when the server ended the session (shown on the sign-in page). */
  expired?: boolean;
};

export type Category = {
  id: number;
  name: string;
  code: string;
  binderCount: number;
  sortOrder: number;
  songCount: number;
  maxBinderUsed: number | null;
};

export type SongListItem = {
  id: number;
  songNumber: number | null;
  title: string;
  composer: string | null;
  firstSentence: string | null;
  categoryId: number;
  categoryName: string;
  categoryCode: string;
  binderNumber: number;
  pageNumber: number;
  location: string;
  createdAt: string;
  updatedAt: string;
  hasPdf: boolean;
  imageCount: number;
};

export type SongPage = { items: SongListItem[]; total: number; page: number; pageSize: number };

export type SongSearch = {
  q?: string;
  category?: number | null;
  binder?: number | null;
  sort?: SortOption;
  page?: number;
  pageSize?: number;
};

export type Attachment = {
  id: number;
  fileType: "pdf" | "image";
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  displayOrder: number;
  createdAt: string;
};

export type SongDetail = {
  id: number;
  songNumber: number | null;
  title: string;
  composer: string | null;
  firstSentence: string | null;
  notes: string | null;
  binderNumber: number;
  pageNumber: number;
  location: string;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
  updatedByName: string | null;
  category: { id: number; name: string; code: string; binderCount: number };
  pdf: Attachment | null;
  images: Attachment[];
};

export type SongInput = {
  categoryId: number | null;
  binderNumber: number | null;
  pageNumber: number | null;
  songNumber: number | string | null;
  title: string;
  composer: string;
  firstSentence: string;
  notes: string;
};

export type LocationCheck = { takenBy: { id: number; title: string } | null; nextFreePage: number };

export type Upload = { id: number; fileType: "pdf" | "image"; fileName: string; mimeType: string; sizeBytes: number };

export type FileChanges = {
  /** The complete, ordered list of images to keep ({id}) or add ({uploadId}); null leaves images as they are. */
  images: ({ id: number } | { uploadId: number })[] | null;
  removeImageIds: number[];
  /** null = unchanged, {remove: true}, or a finished PDF upload. */
  pdf: { remove: true } | { uploadId: number } | null;
};

export type AuditEntry = {
  id: number;
  createdAt: string;
  actorName: string | null;
  action: string;
  entityType: string;
  songId: number | null;
  summary: string | null;
  details: Record<string, unknown>;
  songExists: boolean;
};

export type AuditPage = { items: AuditEntry[]; total: number; page: number; pageSize: number };

export type LibraryStats = {
  totalSongs: number;
  totalCategories: number;
  songsWithPdf: number;
  songsWithoutPdf: number;
  songsWithImages: number;
};

export type ManagedUser = {
  id: number;
  email: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  lastSignInAt: string | null;
  createdAt: string;
};
