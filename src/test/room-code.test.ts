import { describe, expect, it } from "vitest";

import { isCompleteRoomCode, normalizeRoomCode } from "@/lib/room-code";

describe("room codes", () => {
  it("uppercases and strips spaces and dashes so a pasted code still works", () => {
    expect(normalizeRoomCode(" ab c-12x ")).toBe("ABC12X");
  });

  it("keeps at most 6 characters", () => {
    expect(normalizeRoomCode("ABCDEFGH")).toBe("ABCDEF");
  });

  it("only accepts a code once it has all 6 characters", () => {
    expect(isCompleteRoomCode("ABC12")).toBe(false);
    expect(isCompleteRoomCode("abc12x")).toBe(true);
  });
});
