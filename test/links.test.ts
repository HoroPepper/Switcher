import { describe, expect, it } from "vitest";
import { extractLinks } from "../src/extract/links";

describe("extractLinks", () => {
  it("recognises magnet, ed2k, thunder, 115 share and http links", () => {
    const text = [
      "magnet:?xt=urn:btih:ABCDEF1234567890&dn=Some.File",
      "ed2k://|file|Some.File.mkv|123456|0123456789ABCDEF0123456789ABCDEF|/",
      "thunder://QUFodHRwOi8vZXhhbXBsZS5jb20vZmlsZS56aXA=",
      "https://115.com/s/sw1234abcd?password=xyz9",
      "http://example.com/direct/file.torrent",
    ].join("\n");

    const links = extractLinks(text);
    expect(links.find((link) => link.kind === "magnet")).toBeTruthy();
    expect(links.find((link) => link.kind === "ed2k")).toBeTruthy();
    expect(links.find((link) => link.kind === "thunder")).toBeTruthy();
    expect(links.find((link) => link.kind === "http")).toBeTruthy();

    const share = links.find((link) => link.kind === "share115");
    expect(share?.raw).toBe("https://115.com/s/sw1234abcd?password=xyz9");
    expect(share?.password).toBe("xyz9");
  });

  it("dedupes and trims trailing punctuation", () => {
    const links = extractLinks("magnet:?xt=urn:btih:ABC, magnet:?xt=urn:btih:ABC。");
    expect(links).toHaveLength(1);
    expect(links[0]?.raw).toBe("magnet:?xt=urn:btih:ABC");
  });

  it("reads the share password from nearby text", () => {
    const share = extractLinks(
      "115分享：https://115.com/s/sw1234abcd 提取码：ab12",
    ).find((link) => link.kind === "share115");
    expect(share?.password).toBe("ab12");
  });
});
