import { describe, expect, it } from "vitest";

import { passwordError } from "@/lib/password";

describe("passwordError", () => {
  it("rejects passwords shorter than 8 characters", () => {
    expect(passwordError("abc1234")).not.toBeNull();
  });
  it("rejects passwords without a number", () => {
    expect(passwordError("abcdefgh")).not.toBeNull();
  });
  it("rejects passwords without a letter", () => {
    expect(passwordError("12345678")).not.toBeNull();
  });
  it("accepts 8 characters with a letter and a number", () => {
    expect(passwordError("abcdefg1")).toBeNull();
  });
});
