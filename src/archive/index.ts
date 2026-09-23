import fs from "node:fs";
import { readRarLinkFiles } from "./rar";
import { readZipLinkFiles } from "./zip";
import type {
  ArchiveEntryText,
  ArchiveFormat,
  ReadLinkFilesInput,
} from "./types";

export type { ArchiveEntryText, ReadLinkFilesInput } from "./types";

export function detectArchiveFormat(data: Buffer): ArchiveFormat {
  if (
    data.length >= 6 &&
    data[0] === 0x52 && // R
    data[1] === 0x61 && // a
    data[2] === 0x72 && // r
    data[3] === 0x21 && // !
    data[4] === 0x1a &&
    data[5] === 0x07
  ) {
    return "rar";
  }
  if (
    data.length >= 4 &&
    data[0] === 0x50 && // P
    data[1] === 0x4b && // K
    (data[2] === 0x03 || data[2] === 0x05 || data[2] === 0x07)
  ) {
    return "zip";
  }
  return "unknown";
}

export async function readLinkFiles(
  input: ReadLinkFilesInput,
): Promise<ArchiveEntryText[]> {
  const data =
    input.archiveBuffer ??
    (input.archivePath ? fs.readFileSync(input.archivePath) : undefined);
  if (!data) throw new Error("archivePath or archiveBuffer is required");

  const format = detectArchiveFormat(data);
  const byExtension = input.archivePath?.toLowerCase().endsWith(".rar")
    ? "rar"
    : "zip";
  const effective = format === "unknown" ? byExtension : format;

  if (effective === "rar") {
    return readRarLinkFiles({ ...input, archiveBuffer: data });
  }
  return readZipLinkFiles({ ...input, archiveBuffer: data });
}
