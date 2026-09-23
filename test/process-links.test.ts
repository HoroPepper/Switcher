import { describe, expect, it } from "vitest";
import { MockCloudClient } from "../src/cloud/mockCloudClient";
import { processLinks } from "../src/pipeline/processArchive";

describe("processLinks", () => {
  it("dispatches pasted links without extension filtering", async () => {
    const client = new MockCloudClient();
    const result = await processLinks(client, {
      links: [
        "ed2k://|file|movie.mp4|111|E10918CD997763B89B64336D176A8B1A|/",
        "ed2k://|file|movie.part1.rar|102|32AC850194B0A3996A27338B2846658A|/",
        "magnet:?xt=urn:btih:ABCDEF1234567890&dn=other.mkv",
      ].join("\n"),
      parentPath: "/115open",
      folderName: "手动测试",
    });

    expect(result.source).toBe("links");
    expect(result.linkFiles).toEqual([]);
    expect(result.folder.path).toBe("/115open/手动测试");
    expect(result.added).toBe(3);
    expect(result.failed).toBe(0);
  });

  it("applies the optional extension filter", async () => {
    const client = new MockCloudClient();
    const result = await processLinks(client, {
      links: [
        "ed2k://|file|movie.mp4|111|E10918CD997763B89B64336D176A8B1A|/",
        "ed2k://|file|movie.part1.rar|102|32AC850194B0A3996A27338B2846658A|/",
      ].join("\n"),
      parentPath: "/115open",
      folderName: "x",
      targetExtensions: ["mp4"],
    });

    expect(result.links).toHaveLength(1);
    expect(result.added).toBe(1);
  });

  it("throws when nothing parseable is provided", async () => {
    const client = new MockCloudClient();
    await expect(
      processLinks(client, { links: "not a link", parentPath: "/115open" }),
    ).rejects.toThrow("未解析到可用的下载链接");
  });
});
