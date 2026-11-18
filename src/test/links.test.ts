import { describe, expect, it } from "vitest";

import { splitLinks } from "@/lib/links";

describe("splitLinks", () => {
  it("turns a web address into a link and keeps the rest as text", () => {
    expect(splitLinks("see https://example.com/a?b=1 now")).toEqual([
      { kind: "text", text: "see " },
      { kind: "link", text: "https://example.com/a?b=1", href: "https://example.com/a?b=1" },
      { kind: "text", text: " now" },
    ]);
  });
  it("adds https to www. links and leaves a trailing period out", () => {
    expect(splitLinks("go to www.example.com.")).toEqual([
      { kind: "text", text: "go to " },
      { kind: "link", text: "www.example.com", href: "https://www.example.com" },
      { kind: "text", text: "." },
    ]);
  });
  it("never links javascript: addresses", () => {
    expect(splitLinks("javascript:alert(1)")).toEqual([{ kind: "text", text: "javascript:alert(1)" }]);
  });
});
