import type { ExtractedLink, LinkKind } from "../types";

const LINK_PATTERN =
  /magnet:\?[^\s"'<>）】》」]+|ed2k:\/\/\|file\|[^\s"'<>）】》」]+|thunder:\/\/[A-Za-z0-9+/=_-]+|https?:\/\/(?:www\.)?(?:115\.com|115cdn\.com|anxia\.com)\/s\/[A-Za-z0-9_-]+(?:\?[^\s"'<>）】》」]*)?|https?:\/\/[^\s"'<>）】》」]+/gi;

const MAGNET = /^magnet:\?/i;
const ED2K = /^ed2k:\/\//i;
const THUNDER = /^thunder:\/\//i;
const SHARE_115 = /^https?:\/\/(?:www\.)?(?:115\.com|115cdn\.com|anxia\.com)\/s\//i;

function trimLink(raw: string): string {
  return raw.replace(/[.,;:'")\]}>，。、；：！？）】》」』]+$/u, "");
}

function classify(raw: string): LinkKind {
  if (MAGNET.test(raw)) return "magnet";
  if (ED2K.test(raw)) return "ed2k";
  if (THUNDER.test(raw)) return "thunder";
  if (SHARE_115.test(raw)) return "share115";
  return "http";
}

function passwordFromUrl(raw: string): string | undefined {
  try {
    const url = new URL(raw);
    for (const key of ["password", "pwd", "passcode"]) {
      const value = url.searchParams.get(key);
      if (value) return value;
    }
  } catch {
    // not a parseable URL, fall through
  }
  return undefined;
}

function passwordNearText(text: string, link: string): string | undefined {
  const index = text.indexOf(link);
  if (index < 0) return undefined;
  const start = text.lastIndexOf("\n", index) + 1;
  const end = text.indexOf("\n", index + link.length);
  const line = text.slice(start, end < 0 ? undefined : end);
  const match = line.match(
    /(?:提取码|访问码|密码|pwd|password)\s*[:：=]?\s*([A-Za-z0-9]{4})/i,
  );
  return match?.[1];
}

export function extractLinks(text: string): ExtractedLink[] {
  const found = new Map<string, ExtractedLink>();

  for (const match of text.matchAll(LINK_PATTERN)) {
    const raw = trimLink(match[0]);
    if (!raw || found.has(raw)) continue;

    const kind = classify(raw);
    const link: ExtractedLink = { raw, kind };
    if (kind === "share115") {
      link.password = passwordFromUrl(raw) ?? passwordNearText(text, match[0]);
    }
    found.set(raw, link);
  }

  return [...found.values()];
}
