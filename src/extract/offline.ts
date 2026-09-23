import type { ExtractedLink, LinkKind } from "../types";

export interface OfflineTargetOptions {
  extensions: string[];
}

export interface ParsedOfflineLine {
  raw: string;
  kind: LinkKind;
  name: string;
}

const ED2K = /ed2k:\/\/\|file\|([^|]+)\|(\d+)\|([0-9A-Fa-f]{32})\|\/?/;
const MAGNET = /magnet:\?[^\s]+/i;

function magnetName(raw: string): string | undefined {
  const match = raw.match(/[?&]dn=([^&\s]+)/i);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export function parseOfflineLine(line: string): ParsedOfflineLine | undefined {
  const ed2k = line.match(ED2K);
  if (ed2k?.[1]) {
    return { raw: ed2k[0], kind: "ed2k", name: ed2k[1] };
  }

  const magnet = line.match(MAGNET);
  if (magnet) {
    const name = magnetName(magnet[0]);
    if (name) return { raw: magnet[0], kind: "magnet", name };
  }

  return undefined;
}

function hasExtension(name: string, extensions: string[]): boolean {
  const lower = name.toLowerCase();
  return extensions.some((extension) => {
    const normalized = extension.replace(/^\./, "").toLowerCase();
    return normalized.length > 0 && lower.endsWith(`.${normalized}`);
  });
}

export function extractOfflineTargets(
  text: string,
  options: OfflineTargetOptions,
): ExtractedLink[] {
  const results: ExtractedLink[] = [];
  const seen = new Set<string>();

  for (const line of text.split(/\r?\n/)) {
    const parsed = parseOfflineLine(line);
    if (!parsed) continue;
    if (options.extensions.length > 0 && !hasExtension(parsed.name, options.extensions)) {
      continue;
    }
    if (seen.has(parsed.raw)) continue;
    seen.add(parsed.raw);
    results.push({ raw: parsed.raw, kind: parsed.kind });
  }

  return results;
}
