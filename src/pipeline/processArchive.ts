import path from "node:path";
import { readLinkFiles } from "../archive";
import { extractLinks } from "../extract/links";
import {
  extractOfflineTargets,
  matchesExtension,
  parseOfflineLine,
} from "../extract/offline";
import type {
  CloudClient,
  CloudFileRef,
  DownloadOutcome,
  ExtractedLink,
  OfflineTask,
  ProcessArchiveOptions,
  ProcessResult,
} from "../types";

const DEFAULT_PATTERNS = [/\.(txt|url|list|md)$/i];
const DUPLICATE_PATTERN = /任务已存在|重复的链接|duplicate|10008/i;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDuplicateError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return DUPLICATE_PATTERN.test(message);
}

function linkInfoHash(link: string): string | undefined {
  const ed2k = link.match(/^ed2k:\/\/\|file\|[^|]+\|\d+\|([0-9A-Fa-f]{32})\|/);
  if (ed2k?.[1]) return ed2k[1].toUpperCase();
  const btih = link.match(/xt=urn:btih:([0-9A-Za-z]+)/i);
  if (btih?.[1]) return btih[1].toUpperCase();
  return undefined;
}

function deriveFolderName(source: string): string {
  const base = path.basename(source);
  const withoutExt = base.replace(/\.[^.]+$/, "");
  const cleaned = withoutExt.replace(/[/\\:*?"<>|]+/g, "_").trim();
  return cleaned.length > 0 ? cleaned : "未命名资源";
}

function toOutcome(link: ExtractedLink, error: unknown): DownloadOutcome {
  if (isDuplicateError(error)) {
    return {
      link: link.raw,
      kind: link.kind,
      ok: true,
      duplicate: true,
      message: "任务已存在（已忽略）",
    };
  }
  return { link: link.raw, kind: link.kind, ok: false, message: String(error) };
}

async function applyLinks(
  client: CloudClient,
  links: ExtractedLink[],
  toFolder: string,
  batchSize: number,
): Promise<DownloadOutcome[]> {
  const outcomes: DownloadOutcome[] = [];

  for (const link of links.filter((item) => item.kind === "share115")) {
    try {
      await client.addSharedLink(link.raw, link.password, toFolder);
      outcomes.push({ link: link.raw, kind: link.kind, ok: true });
    } catch (error) {
      outcomes.push(toOutcome(link, error));
    }
  }

  const offlineLinks = links.filter((item) => item.kind !== "share115");
  const size = Math.max(1, batchSize);
  for (let i = 0; i < offlineLinks.length; i += size) {
    const chunk = offlineLinks.slice(i, i + size);
    try {
      await client.addOfflineFiles(
        chunk.map((item) => item.raw),
        toFolder,
      );
      for (const link of chunk) {
        outcomes.push({ link: link.raw, kind: link.kind, ok: true });
      }
    } catch {
      for (const link of chunk) {
        try {
          await client.addOfflineFiles([link.raw], toFolder);
          outcomes.push({ link: link.raw, kind: link.kind, ok: true });
        } catch (error) {
          outcomes.push(toOutcome(link, error));
        }
      }
    }
  }

  return outcomes;
}

function enrichOutcomes(
  outcomes: DownloadOutcome[],
  tasks: OfflineTask[],
): OfflineTask[] {
  const byUrl = new Map(tasks.map((task) => [task.url, task]));
  const byHash = new Map<string, OfflineTask>();
  for (const task of tasks) {
    if (task.infoHash) byHash.set(task.infoHash.toUpperCase(), task);
  }

  const matched: OfflineTask[] = [];
  for (const outcome of outcomes) {
    if (!outcome.ok) continue;
    const hash = linkInfoHash(outcome.link);
    const task =
      byUrl.get(outcome.link) ?? (hash ? byHash.get(hash) : undefined);
    if (!task) continue;
    outcome.status = task.status;
    outcome.percentDone = task.percentDone;
    outcome.infoHash = task.infoHash || hash;
    matched.push(task);
  }
  return matched;
}

function isPending(outcome: DownloadOutcome): boolean {
  return outcome.ok && !outcome.duplicate && outcome.status === "downloading";
}

async function verifyOfflineStatus(
  client: CloudClient,
  outcomes: DownloadOutcome[],
  options: {
    offlineWaitMs?: number;
    offlinePollIntervalMs?: number;
  },
): Promise<OfflineTask[]> {
  const waitMs = Math.max(0, options.offlineWaitMs ?? 0);
  const interval = Math.max(1000, options.offlinePollIntervalMs ?? 5000);
  const deadline = Date.now() + waitMs;

  let matched: OfflineTask[] = [];
  for (;;) {
    matched = enrichOutcomes(outcomes, await client.listAllOfflineFiles());
    if (waitMs === 0 || !outcomes.some(isPending) || Date.now() >= deadline) {
      break;
    }
    await sleep(interval);
  }
  return matched;
}

interface DispatchOptions {
  parentPath: string;
  folderName: string;
  offlineBatchSize?: number;
  verifyOffline?: boolean;
  offlineWaitMs?: number;
  offlinePollIntervalMs?: number;
}

type DispatchResult = Omit<ProcessResult, "source" | "linkFiles">;

async function dispatchLinks(
  client: CloudClient,
  links: ExtractedLink[],
  options: DispatchOptions,
): Promise<DispatchResult> {
  const folder: CloudFileRef = await client.ensureFolder(
    options.parentPath,
    options.folderName,
  );

  const outcomes = await applyLinks(
    client,
    links,
    folder.path,
    options.offlineBatchSize ?? 1,
  );

  let offline: OfflineTask[] = [];
  if (options.verifyOffline !== false) {
    try {
      offline = await verifyOfflineStatus(client, outcomes, options);
    } catch {
      offline = [];
    }
  }

  const added = outcomes.filter((o) => o.ok && !o.duplicate).length;
  const duplicates = outcomes.filter((o) => o.ok && o.duplicate).length;
  const failed = outcomes.filter((o) => !o.ok).length;

  return {
    folderName: options.folderName,
    folder,
    links,
    outcomes,
    added,
    duplicates,
    failed,
    offline,
  };
}

export async function processArchive(
  client: CloudClient,
  options: ProcessArchiveOptions,
): Promise<ProcessResult> {
  const source = options.archiveName ?? options.archivePath ?? "buffer";
  const patterns = options.linkFilePatterns ?? DEFAULT_PATTERNS;

  const linkFiles = await readLinkFiles({
    archivePath: options.archivePath,
    archiveBuffer: options.archiveBuffer,
    patterns,
  });
  if (linkFiles.length === 0) {
    throw new Error("未在压缩包中找到链接文件");
  }

  const extensions = options.targetExtensions ?? ["mp4"];
  const targets = linkFiles.flatMap((file) =>
    extractOfflineTargets(file.text, { extensions }),
  );

  const found = new Map<string, ExtractedLink>();
  for (const link of targets) {
    if (!found.has(link.raw)) found.set(link.raw, link);
  }
  const links = [...found.values()];
  if (links.length === 0) {
    throw new Error(
      `链接文件中未解析到 115 云下载链接（后缀 ${extensions.join("/") || "不限"}）`,
    );
  }

  const folderName = options.folderName ?? deriveFolderName(source);
  const dispatched = await dispatchLinks(client, links, {
    parentPath: options.parentPath,
    folderName,
    offlineBatchSize: options.offlineBatchSize,
    verifyOffline: options.verifyOffline,
    offlineWaitMs: options.offlineWaitMs,
    offlinePollIntervalMs: options.offlinePollIntervalMs,
  });

  return {
    source,
    linkFiles: linkFiles.map((file) => file.name),
    ...dispatched,
  };
}

export interface ProcessLinksOptions {
  links: string | string[];
  parentPath: string;
  folderName?: string;
  targetExtensions?: string[];
  offlineBatchSize?: number;
  verifyOffline?: boolean;
  offlineWaitMs?: number;
  offlinePollIntervalMs?: number;
}

export async function processLinks(
  client: CloudClient,
  options: ProcessLinksOptions,
): Promise<ProcessResult> {
  const text = Array.isArray(options.links)
    ? options.links.join("\n")
    : options.links;

  let links = extractLinks(text);
  const extensions = options.targetExtensions ?? [];
  if (extensions.length > 0) {
    links = links.filter((link) => {
      if (link.kind !== "ed2k" && link.kind !== "magnet") return true;
      const parsed = parseOfflineLine(link.raw);
      return parsed ? matchesExtension(parsed.name, extensions) : true;
    });
  }
  if (links.length === 0) {
    throw new Error("未解析到可用的下载链接");
  }

  const folderName = options.folderName?.trim() || "手动下载";
  const dispatched = await dispatchLinks(client, links, {
    parentPath: options.parentPath,
    folderName,
    offlineBatchSize: options.offlineBatchSize,
    verifyOffline: options.verifyOffline,
    offlineWaitMs: options.offlineWaitMs,
    offlinePollIntervalMs: options.offlinePollIntervalMs,
  });

  return { source: "links", linkFiles: [], ...dispatched };
}
