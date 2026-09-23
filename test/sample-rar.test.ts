import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MockCloudClient } from "../src/cloud/mockCloudClient";
import { processArchive } from "../src/pipeline/processArchive";

const rarPath = fileURLToPath(
  new URL("../data/13dsvr02009.rar", import.meta.url),
);
const hasRar = existsSync(rarPath);

describe("processArchive (real sample rar)", () => {
  it.skipIf(!hasRar)(
    "extracts only the 115 video-format ed2k links",
    async () => {
      const client = new MockCloudClient();
      const result = await processArchive(client, {
        archivePath: rarPath,
        archiveName: "13dsvr02009.rar",
        parentPath: "/115",
        targetExtensions: ["mp4"],
        offlineBatchSize: 1,
      });

      expect(result.linkFiles.some((name) => name.endsWith(".txt"))).toBe(true);
      expect(result.links).toHaveLength(2);
      expect(result.links.every((link) => link.kind === "ed2k")).toBe(true);
      expect(result.links.every((link) => link.raw.includes(".mp4"))).toBe(true);
      expect(client.offline).toHaveLength(2);
      expect(result.added).toBe(2);
      expect(result.failed).toBe(0);
    },
  );
});
