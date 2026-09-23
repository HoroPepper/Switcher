import AdmZip from "adm-zip";
import iconv from "iconv-lite";
import { describe, expect, it } from "vitest";
import { detectArchiveFormat, readLinkFiles } from "../src/archive";

function makeZip(files: Record<string, Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [name, data] of Object.entries(files)) zip.addFile(name, data);
  return zip.toBuffer();
}

describe("readLinkFiles (zip)", () => {
  it("only reads matching files", async () => {
    const buffer = makeZip({
      "资源说明.txt": iconv.encode("magnet:?xt=urn:btih:ABC", "gbk"),
      "cover.jpg": Buffer.from([0, 1, 2]),
    });
    const files = await readLinkFiles({
      archiveBuffer: buffer,
      patterns: [/\.(txt|url|list|md)$/i],
    });
    expect(files.map((file) => file.name)).toEqual(["资源说明.txt"]);
  });

  it("decodes GBK encoded content", async () => {
    const buffer = makeZip({
      "115.txt": iconv.encode("磁力链接：magnet:?xt=urn:btih:ABCD", "gbk"),
    });
    const files = await readLinkFiles({
      archiveBuffer: buffer,
      patterns: [/\.txt$/i],
    });
    expect(files[0]?.text).toContain("磁力链接");
    expect(files[0]?.text).toContain("magnet:?xt=urn:btih:ABCD");
  });
});

describe("detectArchiveFormat", () => {
  it("detects zip and rar by magic bytes", () => {
    expect(detectArchiveFormat(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBe("zip");
    expect(
      detectArchiveFormat(Buffer.from([0x52, 0x61, 0x72, 0x21, 0x1a, 0x07, 0x00])),
    ).toBe("rar");
    expect(detectArchiveFormat(Buffer.from([1, 2, 3, 4]))).toBe("unknown");
  });
});
