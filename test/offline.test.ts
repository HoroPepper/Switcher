import { describe, expect, it } from "vitest";
import { extractOfflineTargets, parseOfflineLine } from "../src/extract/offline";

describe("parseOfflineLine", () => {
  it("parses an ed2k link and its file name", () => {
    const parsed = parseOfflineLine(
      "ed2k://|file|4K688.com@13dsvr02009.part1_8K.mp4|11191647969|E10918CD997763B89B64336D176A8B1A|/",
    );
    expect(parsed?.kind).toBe("ed2k");
    expect(parsed?.name).toBe("4K688.com@13dsvr02009.part1_8K.mp4");
  });

  it("parses a magnet link's dn as file name", () => {
    const parsed = parseOfflineLine(
      "magnet:?xt=urn:btih:ABCDEF1234567890&dn=Some%20Movie.mp4",
    );
    expect(parsed?.kind).toBe("magnet");
    expect(parsed?.name).toBe("Some Movie.mp4");
  });

  it("ignores non-offline lines", () => {
    expect(parseOfflineLine("解壓密碼：https://www.xhd.tw")).toBeUndefined();
  });
});

describe("extractOfflineTargets", () => {
  it("keeps only links whose file name has a target extension", () => {
    const text = [
      "ed2k://|file|movie.part1_8K.mp4|111|E10918CD997763B89B64336D176A8B1A|/",
      "ed2k://|file|movie.part1.rar|102|32AC850194B0A3996A27338B2846658A|/",
      "magnet:?xt=urn:btih:ABCDEF1234567890&dn=other.mp4",
      "ed2k://|file|movie.part1_8K.mp4|111|E10918CD997763B89B64336D176A8B1A|/",
    ].join("\n");

    const targets = extractOfflineTargets(text, { extensions: ["mp4"] });
    expect(targets).toHaveLength(2);
    expect(targets.every((t) => t.kind === "ed2k" || t.kind === "magnet")).toBe(
      true,
    );
  });

  it("returns everything when no extension filter is given", () => {
    const text = [
      "ed2k://|file|movie.mp4|111|E10918CD997763B89B64336D176A8B1A|/",
      "ed2k://|file|movie.rar|102|32AC850194B0A3996A27338B2846658A|/",
    ].join("\n");
    expect(extractOfflineTargets(text, { extensions: [] })).toHaveLength(2);
  });
});
