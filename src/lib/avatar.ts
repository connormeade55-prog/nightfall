import { useSignedUrl } from "@/lib/storage-url";

export const AVATAR_BUCKET = "avatars";
export const AVATAR_ACCEPT = ["image/png", "image/jpeg", "image/webp"] as const;
export const AVATAR_MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const AVATAR_SIZE = 256;

/** Reason a picked file can't be used as a profile picture, or null when it can. */
export function avatarFileError(file: { type: string; size: number }): string | null {
  if (!(AVATAR_ACCEPT as readonly string[]).includes(file.type))
    return "Pick a PNG, JPG or WEBP image.";
  if (file.size > AVATAR_MAX_UPLOAD_BYTES) return "That image is over 8 MB. Pick a smaller one.";
  return null;
}

/** Center-crop and shrink to a small square so uploads stay tiny. */
export async function shrinkAvatar(file: File): Promise<{ blob: Blob; ext: "webp" | "jpg" }> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    AVATAR_SIZE,
    AVATAR_SIZE,
  );
  bitmap.close();
  const toBlob = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  const webp = await toBlob("image/webp");
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp" };
  const jpg = await toBlob("image/jpeg");
  if (!jpg) throw new Error("Couldn't process that image");
  return { blob: jpg, ext: "jpg" };
}

/** Temporary link to a stored profile picture (the bucket is private to signed-in people). */
export function useAvatarUrl(path: string | null | undefined): string | null {
  return useSignedUrl(AVATAR_BUCKET, path);
}
