import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import type { CloudConfig } from "../config";
import type {
  CloudClient,
  CloudFileRef,
  OfflineStatus,
  OfflineTask,
} from "../types";

function joinPath(parent: string, name: string): string {
  return `${parent.replace(/\/+$/, "")}/${name}`;
}

function normalizeStatus(status: string | number | undefined): OfflineStatus {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized.includes("download") || normalized === "1") return "downloading";
  if (normalized.includes("finish") || normalized === "2") return "finished";
  if (normalized.includes("error") || normalized === "3") return "error";
  return "unknown";
}

export class CloudDriveClient implements CloudClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly client: any;
  private readonly metadata = new grpc.Metadata();
  private readonly tokenReady: Promise<void>;

  constructor(private readonly config: CloudConfig) {
    const packageDefinition = protoLoader.loadSync(config.protoPath, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const loaded = grpc.loadPackageDefinition(packageDefinition) as any;
    const Ctor = loaded.clouddrive
      .CloudDriveFileSrv as grpc.ServiceClientConstructor;
    const credentials = config.tls
      ? grpc.credentials.createSsl()
      : grpc.credentials.createInsecure();
    this.client = new Ctor(config.address, credentials);

    if (config.token) {
      this.metadata.set("authorization", `Bearer ${config.token}`);
      this.tokenReady = Promise.resolve();
    } else if (config.username && config.password) {
      this.tokenReady = this.fetchToken();
    } else {
      this.tokenReady = Promise.resolve();
    }
  }

  private async fetchToken(): Promise<void> {
    const res = await this.unary<{
      success: boolean;
      errorMessage?: string;
      token?: string;
    }>(
      "getToken",
      {
        userName: this.config.username,
        password: this.config.password,
        ...(this.config.totp ? { totpCode: this.config.totp } : {}),
      },
      false,
    );
    if (!res?.success || !res.token) {
      throw new Error(
        `CloudDrive2 login failed: ${res?.errorMessage ?? "unknown error"}`,
      );
    }
    this.metadata.set("authorization", `Bearer ${res.token}`);
  }

  private unary<T>(
    method: string,
    request: unknown,
    auth: boolean,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const args: unknown[] = [request];
      if (auth) args.push(this.metadata);
      args.push((err: grpc.ServiceError | null, res: T) =>
        err ? reject(err) : resolve(res),
      );
      this.client[method](...args);
    });
  }

  private async call<T>(method: string, request: unknown): Promise<T> {
    await this.tokenReady;
    return this.unary<T>(method, request, true);
  }

  private async stream<T>(method: string, request: unknown): Promise<T[]> {
    await this.tokenReady;
    return new Promise((resolve, reject) => {
      const rows: T[] = [];
      const call = this.client[method](request, this.metadata);
      call.on("data", (row: T) => rows.push(row));
      call.on("error", reject);
      call.on("end", () => resolve(rows));
    });
  }

  async ensureFolder(parentPath: string, folderName: string): Promise<CloudFileRef> {
    try {
      const replies = await this.stream<{ subFiles?: CloudDriveFileLike[] }>(
        "getSubFiles",
        { path: parentPath, forceRefresh: false },
      );
      const files = replies.flatMap((reply) => reply.subFiles ?? []);
      const found = files.find(
        (file) => file.name === folderName && isDirectory(file),
      );
      if (found) {
        return {
          id: found.id,
          name: found.name,
          path: found.fullPathName || joinPath(parentPath, folderName),
        };
      }
    } catch {
      // Listing failed (e.g. path not cached); fall back to creating the folder.
    }

    const res = await this.call<CreateFolderResult>("createFolder", {
      parentPath,
      folderName,
    });
    if (!res?.result?.success) {
      throw new Error(
        `CreateFolder failed: ${res?.result?.errorMessage ?? "unknown error"}`,
      );
    }
    const created = res.folderCreated;
    return {
      id: created?.id,
      name: created?.name ?? folderName,
      path: created?.fullPathName || joinPath(parentPath, folderName),
    };
  }

  async addOfflineFiles(urls: string[], toFolder: string): Promise<void> {
    const res = await this.call<{ success: boolean; errorMessage?: string }>(
      "addOfflineFiles",
      { urls: urls.join("\n"), toFolder },
    );
    if (res && res.success === false) {
      throw new Error(
        `AddOfflineFiles failed: ${res.errorMessage ?? "unknown error"}`,
      );
    }
  }

  async addSharedLink(
    url: string,
    password: string | undefined,
    toFolder: string,
  ): Promise<void> {
    const request: { sharedLinkUrl: string; toFolder: string; sharedPassword?: string } = {
      sharedLinkUrl: url,
      toFolder,
    };
    if (password) request.sharedPassword = password;
    await this.call("addSharedLink", request);
  }

  private account?: { name: string; id: string };

  private async resolveAccount(): Promise<{ name: string; id: string }> {
    if (this.account) return this.account;
    if (this.config.cloudName && this.config.cloudAccountId) {
      this.account = {
        name: this.config.cloudName,
        id: this.config.cloudAccountId,
      };
      return this.account;
    }

    const list = await this.call<{ apis?: CloudApiLike[] }>(
      "getAllCloudApis",
      {},
    );
    const apis = list?.apis ?? [];
    const picked = this.config.cloudName
      ? apis.find((api) => api.name === this.config.cloudName)
      : apis[0];
    if (!picked) {
      throw new Error("CloudDrive2 has no cloud account available");
    }
    this.account = {
      name: picked.name,
      id: this.config.cloudAccountId ?? picked.userName,
    };
    return this.account;
  }

  async listAllOfflineFiles(): Promise<OfflineTask[]> {
    const account = await this.resolveAccount();
    const tasks: OfflineTask[] = [];

    for (let page = 1; page <= 100; page += 1) {
      const res = await this.call<{
        pageCount?: number | string;
        offlineFiles?: OfflineFileLike[];
      }>("listAllOfflineFiles", {
        cloudName: account.name,
        cloudAccountId: account.id,
        page,
      });

      const files = res?.offlineFiles ?? [];
      for (const file of files) {
        tasks.push({
          name: file.name,
          url: file.url,
          status: normalizeStatus(file.status),
          infoHash: file.infoHash,
          percentDone: Number(file.percentDone ?? 0),
        });
      }

      const pageCount = Number(res?.pageCount ?? 1);
      if (files.length === 0 || page >= pageCount) break;
    }

    return tasks;
  }

  async health(): Promise<{ ok: boolean; message?: string }> {
    try {
      const info = await this.unary<{ IsLogin?: boolean; SystemReady?: boolean }>(
        "getSystemInfo",
        {},
        false,
      );
      return {
        ok: true,
        message: `login=${info?.IsLogin ?? false} ready=${info?.SystemReady ?? false}`,
      };
    } catch (error) {
      return { ok: false, message: String(error) };
    }
  }
}

interface CloudDriveFileLike {
  id?: string;
  name: string;
  fullPathName?: string;
  isDirectory?: boolean;
  fileType?: string | number;
}

interface CreateFolderResult {
  folderCreated?: CloudDriveFileLike;
  result?: { success: boolean; errorMessage?: string };
}

interface CloudApiLike {
  name: string;
  userName: string;
}

interface OfflineFileLike {
  name: string;
  url: string;
  status: string | number;
  infoHash: string;
  percentDone?: number | string;
}

function isDirectory(file: CloudDriveFileLike): boolean {
  return (
    file.isDirectory === true ||
    file.fileType === "Directory" ||
    file.fileType === 0
  );
}
