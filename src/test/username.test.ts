import { describe, expect, it } from "vitest";

import {
  emailForUsername,
  normalizeUsername,
  usernameError,
} from "@/lib/username";

describe("username sign-in rules", () => {
  it("normalizes a typed name to a lowercase, email-safe username", () => {
    expect(normalizeUsername(" Connor Lee ")).toBe("connorlee");
    expect(normalizeUsername("Connor.Lee-9")).toBe("connor.lee-9");
    expect(normalizeUsername("Zoë!")).toBe("zo");
  });

  it("accepts a 2 to 31 character username starting with a letter or number", () => {
    expect(usernameError("connor")).toBeNull();
    expect(usernameError("ab")).toBeNull();
    expect(usernameError("a".repeat(31))).toBeNull();
  });

  it("rejects usernames that are empty, too short, too long, or badly formed", () => {
    expect(usernameError("")).toBe("Enter a username.");
    expect(usernameError("a")).toBe(
      "Use 2-31 characters: letters, numbers, dot, dash or underscore, starting with a letter or number.",
    );
    expect(usernameError("a".repeat(32))).toBe(
      "Use 2-31 characters: letters, numbers, dot, dash or underscore, starting with a letter or number.",
    );
    expect(usernameError(".connor")).toBe(
      "Use 2-31 characters: letters, numbers, dot, dash or underscore, starting with a letter or number.",
    );
  });

  it("derives the same synthetic address for the same username", () => {
    expect(emailForUsername("connor")).toBe("connor@app.local");
    expect(emailForUsername(normalizeUsername("Connor"))).toBe("connor@app.local");
  });
});
