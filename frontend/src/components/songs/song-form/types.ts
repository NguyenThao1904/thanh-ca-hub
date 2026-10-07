import type { MessageKey } from "@/lib/i18n/config";

export type CategoryOption = { id: number; name: string; code: string; binderCount: number };

export type FormValues = {
  categoryId: string;
  binderNumber: string;
  pageNumber: string;
  songNumber: string;
  title: string;
  composer: string;
  firstSentence: string;
  notes: string;
};

export type ImageItem =
  | { key: string; kind: "existing"; id: number; name: string; src: string }
  | { key: string; kind: "new"; file: File; name: string; src: string };

export type PdfState = {
  existing: { id: number; fileName: string; sizeBytes: number } | null;
  remove: boolean;
  replacement: File | null;
};

export type UploadItem = {
  key: string;
  kind: "image" | "pdf";
  name: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  error?: MessageKey;
  /** Set once uploaded: the server's id for the file, used when attaching it to the song. */
  uploadId?: number;
};

export type LocationStatus =
  | { key: string; state: "available"; nextFreePage: number }
  | { key: string; state: "taken"; nextFreePage: number; takenBy: { id: number; title: string } };
