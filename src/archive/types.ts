export interface ArchiveEntryText {
  name: string;
  text: string;
}

export interface ReadLinkFilesInput {
  archivePath?: string;
  archiveBuffer?: Buffer;
  patterns: RegExp[];
  password?: string;
}

export type ArchiveFormat = "zip" | "rar" | "unknown";
