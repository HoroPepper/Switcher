import fs from "node:fs/promises";
import { createExtractorFromData } from "node-unrar-js";
import { decodeText } from "../text";
import type { ArchiveEntryText, ReadLinkFilesInput } from "./types";

export async function readRarLinkFiles(
  input: ReadLinkFilesInput,
): Promise<ArchiveEntryText[]> {
  const data =
    input.archiveBuffer ??
    (input.archivePath ? await fs.readFile(input.archivePath) : undefined);
  if (!data) throw new Error("archivePath or archiveBuffer is required");

  const arrayBuffer = data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;

  const extractor = await createExtractorFromData({
    data: arrayBuffer,
    password: input.password,
  });

  const wanted = (header: { name: string; flags: { directory: boolean } }) =>
    !header.flags.directory &&
    input.patterns.some((pattern) => pattern.test(header.name));

  const arc = extractor.extract({ files: wanted, password: input.password });

  const results: ArchiveEntryText[] = [];
  for (const file of arc.files) {
    if (!file.extraction) continue;
    results.push({
      name: file.fileHeader.name,
      text: decodeText(Buffer.from(file.extraction)),
    });
  }
  return results;
}
