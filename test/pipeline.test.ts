import AdmZip from "adm-zip";
import { describe, expect, it } from "vitest";
import { MockCloudClient } from "../src/cloud/mockCloudClient";
import { processArchive } from "../src/pipeline/processArchive";

function makeZip(files: Record<string, string>): Buffer {
  const zip = new AdmZip();
  for (const [name, data] of Object.entries(files)) {
    zip.addFile(name, Buffer.from(data, "utf8"));
  }
  return zip.toBuffer();
}

describe("processArchive", () => {
  it("keeps only 115 cloud links whose file name ends with a target extension", async () => {
    const client = new MockCloudClient();
    const buffer = makeZip({
      "115.txt": [
        "ed2k://|file|13dsvr02009.part1_8K.mp4|11191647969|E10918CD997763B89B64336D176A8B1A|/",
        "ed2k://|file|13dsvr02009.part1.rar|10200547328|32AC850194B0A3996A27338B2846658A|/",
        "http://example.com/a.torrent",
      ].join("\n"),
    });

    const result = await processArchive(client, {
      archiveBuffer: buffer,
      archiveName: "13dsvr02009.zip",
      parentPath: "/115",
      targetExtensions: ["mp4"],
      offlineBatchSize: 1,
    });

    expect(result.folderName).toBe("13dsvr02009");
    expect(client.folders[0]?.path).toBe("/115/13dsvr02009");
    expect(result.links).toHaveLength(1);
    expect(result.links[0]?.raw).toContain(".mp4");
    expect(result.added).toBe(1);
    expect(result.duplicates).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.outcomes[0]?.status).toBe("finished");
  });

  it("treats an already-existing offline task as a duplicate success", async () => {
    const client = new MockCloudClient({ duplicatePattern: /movie\.mp4/ });
    const buffer = makeZip({
      "115.txt":
        "ed2k://|file|movie.mp4|111|E10918CD997763B89B64336D176A8B1A|/",
    });

    const result = await processArchive(client, {
      archiveBuffer: buffer,
      archiveName: "m.zip",
      parentPath: "/115",
      targetExtensions: ["mp4"],
    });

    expect(result.added).toBe(0);
    expect(result.duplicates).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.outcomes[0]?.duplicate).toBe(true);
    expect(result.outcomes[0]?.ok).toBe(true);
  });

  it("throws when no line matches the target extension", async () => {
    const client = new MockCloudClient();
    const buffer = makeZip({
      "115.txt": "ed2k://|file|file.part1.rar|10200547328|32AC850194B0A3996A27338B2846658A|/",
    });
    await expect(
      processArchive(client, {
        archiveBuffer: buffer,
        archiveName: "x.zip",
        parentPath: "/115",
        targetExtensions: ["mp4"],
      }),
    ).rejects.toThrow("未解析到 115 云下载链接");
  });
});
