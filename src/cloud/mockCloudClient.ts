import { parseOfflineLine } from "../extract/offline";
import type {
  CloudClient,
  CloudFileRef,
  OfflineTask,
} from "../types";

export interface MockCloudOptions {
  duplicatePattern?: RegExp;
}

const DUPLICATE_MESSAGE =
  "13 INTERNAL: api error Cloud 115open(344952331) api error: " +
  "code: 10008, message: 任务已存在，请勿输入重复的链接地址";

export class MockCloudClient implements CloudClient {
  readonly folders: CloudFileRef[] = [];
  readonly offline: { url: string; toFolder: string }[] = [];
  readonly shared: { url: string; password?: string; toFolder: string }[] = [];

  constructor(private readonly options: MockCloudOptions = {}) {}

  async ensureFolder(parentPath: string, folderName: string): Promise<CloudFileRef> {
    const path = `${parentPath.replace(/\/+$/, "")}/${folderName}`;
    const existing = this.folders.find((folder) => folder.path === path);
    if (existing) return existing;
    const folder: CloudFileRef = { id: `mock-${this.folders.length + 1}`, name: folderName, path };
    this.folders.push(folder);
    return folder;
  }

  async addOfflineFiles(urls: string[], toFolder: string): Promise<void> {
    for (const url of urls) {
      if (this.options.duplicatePattern?.test(url)) {
        throw new Error(DUPLICATE_MESSAGE);
      }
      this.offline.push({ url, toFolder });
    }
  }

  async addSharedLink(
    url: string,
    password: string | undefined,
    toFolder: string,
  ): Promise<void> {
    this.shared.push({ url, password, toFolder });
  }

  async listAllOfflineFiles(): Promise<OfflineTask[]> {
    return this.offline.map((item) => ({
      name: parseOfflineLine(item.url)?.name ?? item.url,
      url: item.url,
      status: "finished",
      infoHash: "",
      percentDone: 100,
    }));
  }

  async health(): Promise<{ ok: boolean; message?: string }> {
    return { ok: true, message: "mock" };
  }
}
