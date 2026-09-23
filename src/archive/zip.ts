import AdmZip from "adm-zip";
import { decodeText } from "../text";
import type { ArchiveEntryText, ReadLinkFilesInput } from "./types";

export function readZipLinkFiles(input: ReadLinkFilesInput): ArchiveEntryText[] {
  const zip = input.archiveBuffer
    ? new AdmZip(input.archiveBuffer)
    : input.archivePath
      ? new AdmZip(input.archivePath)
      : null;
  if (!zip) throw new Error("archivePath or archiveBuffer is required");

  const results: ArchiveEntryText[] = [];
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    if (!input.patterns.some((pattern) => pattern.test(entry.entryName))) {
      continue;
    }
    results.push({ name: entry.entryName, text: decodeText(entry.getData()) });
  }
  return results;
}
