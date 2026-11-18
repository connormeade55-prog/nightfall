import { describe, expect, it } from "vitest";

import { chatFileError, chatFilePath } from "@/lib/chat-files";

describe("chat files", () => {
  it("allows files up to 25 MB", () => {
    expect(chatFileError({ size: 25 * 1024 * 1024 })).toBeNull();
    expect(chatFileError({ size: 25 * 1024 * 1024 + 1 })).not.toBeNull();
  });
  it("stores uploads in the room and uploader's folder with a safe name", () => {
    expect(chatFilePath("room", "me", "my photo (1).png", 5)).toBe("room/me/5-my_photo_1_.png");
  });
});
