export const CHAT_FILES_BUCKET = "chat-files";
export const CHAT_FILE_MAX_BYTES = 25 * 1024 * 1024;
/** Only these are shown inline; everything else is a download link. */
export const INLINE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export function chatFileError(file: { size: number }): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > CHAT_FILE_MAX_BYTES) return "Files can be up to 25 MB.";
  return null;
}

/** Storage path for an upload: <room>/<uploader>/<time>-<safe name>. */
export function chatFilePath(roomId: string, userId: string, fileName: string, now = Date.now()): string {
  const safe =
    fileName
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9._-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(-100) || "file";
  return `${roomId}/${userId}/${now}-${safe}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
