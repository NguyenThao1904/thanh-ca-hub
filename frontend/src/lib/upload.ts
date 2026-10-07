import { CSRF_HEADER, sessionExpired } from "@/api/client";
import type { Upload } from "@/api/types";
import { detectMimeType, type FileKind } from "@/lib/files";

export class UploadError extends Error {
  constructor(public reason: "session" | "network" | "too_large" | "rejected") {
    super(`Upload failed: ${reason}`);
  }
}

/**
 * Uploads one file to the server, with progress. The server checks the
 * permission (admins only) and the real file type, stores the file, and
 * returns an upload id; the file is attached to the song when the form is saved.
 */
export async function uploadFile(file: File, kind: FileKind, onProgress: (fraction: number) => void): Promise<Upload> {
  // Some phones send files without a type.
  const mimeType = detectMimeType(file);
  const body = new FormData();
  body.append("fileType", kind);
  body.append("file", file.type === mimeType ? file : new File([file], file.name, { type: mimeType }));

  return new Promise<Upload>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", "/api/uploads");
    for (const [name, value] of Object.entries(CSRF_HEADER)) request.setRequestHeader(name, value);
    request.responseType = "json";
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    request.onload = () => {
      if (request.status === 201) {
        onProgress(1);
        resolve(request.response as Upload);
      } else if (request.status === 413) {
        reject(new UploadError("too_large"));
      } else if (request.status === 401) {
        sessionExpired();
        reject(new UploadError("session"));
      } else if (request.status === 403) {
        reject(new UploadError("session"));
      } else {
        reject(new UploadError(request.status >= 500 || request.status === 0 ? "network" : "rejected"));
      }
    };
    request.onerror = () => reject(new UploadError("network"));
    request.ontimeout = () => reject(new UploadError("network"));
    request.send(body);
  });
}

const MAX_IMAGE_SIDE = 3000;
const KEEP_ORIGINAL_BELOW_BYTES = 1.5 * 1024 * 1024;

/**
 * Phone photos of sheet music are often 4–12 MB. Large images are scaled down
 * (longest side 3000 px, about 250 dpi for A4, still sharp) and saved as JPEG.
 * If anything goes wrong, the original file is used.
 */
export async function prepareImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= KEEP_ORIGINAL_BELOW_BYTES) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    // White background: transparent PNG areas would otherwise turn black in JPEG.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    const name = `${file.name.replace(/\.[^.]+$/, "") || "page"}.jpg`;
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
