export type TextPart = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

const LINK = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING = /[.,!?;:)\]}'"]+$/;

/** Split chat text into plain text and clickable web links (http, https or www. only). */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(LINK)) {
    const start = match.index ?? 0;
    let raw = match[0];
    const trail = raw.match(TRAILING)?.[0] ?? "";
    if (trail) raw = raw.slice(0, -trail.length);
    if (!raw) continue;
    if (start > last) parts.push({ kind: "text", text: text.slice(last, start) });
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    parts.push({ kind: "link", text: raw, href });
    last = start + raw.length;
  }
  if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
  return parts;
}
