import iconv from "iconv-lite";

const REPLACEMENT = "\uFFFD";

export function decodeText(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString("utf8");
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return iconv.decode(buffer.subarray(2), "utf16le");
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return iconv.decode(buffer.subarray(2), "utf16be");
  }

  const utf8 = buffer.toString("utf8");
  if (!utf8.includes(REPLACEMENT)) {
    return utf8;
  }
  return iconv.decode(buffer, "gbk");
}
