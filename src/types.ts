export type LinkKind = "magnet" | "ed2k" | "thunder" | "share115" | "http";

export interface ExtractedLink {
  raw: string;
  kind: LinkKind;
  password?: string;
}

export interface CloudFileRef {
  id?: string;
  name: string;
  path: string;
}

export type OfflineStatus = "downloading" | "finished" | "error" | "unknown";

export interface OfflineTask {
  name: string;
  url: string;
  status: OfflineStatus;
  infoHash: string;
  percentDone: number;
}

export interface DownloadOutcome {
  link: string;
  kind: LinkKind;
  ok: boolean;
  duplicate?: boolean;
  message?: string;
  status?: OfflineStatus;
  percentDone?: number;
  infoHash?: string;
}

export interface ProcessArchiveOptions {
  archivePath?: string;
  archiveBuffer?: Buffer;
  archiveName?: string;
  parentPath: string;
  folderName?: string;
  linkFilePatterns?: RegExp[];
  targetExtensions?: string[];
  offlineBatchSize?: number;
  verifyOffline?: boolean;
  offlineWaitMs?: number;
  offlinePollIntervalMs?: number;
}

export interface ProcessResult {
  source: string;
  folderName: string;
  folder: CloudFileRef;
  linkFiles: string[];
  links: ExtractedLink[];
  outcomes: DownloadOutcome[];
  added: number;
  duplicates: number;
  failed: number;
  offline: OfflineTask[];
}

export interface CloudClient {
  ensureFolder(parentPath: string, folderName: string): Promise<CloudFileRef>;
  addOfflineFiles(urls: string[], toFolder: string): Promise<void>;
  addSharedLink(
    url: string,
    password: string | undefined,
    toFolder: string,
  ): Promise<void>;
  listAllOfflineFiles(): Promise<OfflineTask[]>;
  health(): Promise<{ ok: boolean; message?: string }>;
}
