import * as grpc from "@grpc/grpc-js";
import * as protoLoader from "@grpc/proto-loader";
import { fileURLToPath } from "node:url";

try {
  process.loadEnvFile();
} catch {
  // no .env, use the real environment
}

const protoPath = fileURLToPath(
  new URL("../proto/clouddrive.proto", import.meta.url),
);
const address = process.env.CLOUDDRIVE_GRPC_ADDR ?? "127.0.0.1:19798";
const token = process.env.CLOUDDRIVE_TOKEN;

const packageDefinition = protoLoader.loadSync(protoPath, {
  keepCase: false,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const loaded = grpc.loadPackageDefinition(packageDefinition) as any;
const Ctor = loaded.clouddrive.CloudDriveFileSrv as grpc.ServiceClientConstructor;
const client = new Ctor(address, grpc.credentials.createInsecure()) as never;

const metadata = new grpc.Metadata();
if (token) metadata.set("authorization", `Bearer ${token}`);

function unary<T>(method: string, request: unknown, auth: boolean): Promise<T> {
  return new Promise((resolve, reject) => {
    const args: unknown[] = [request];
    if (auth) args.push(metadata);
    args.push((err: grpc.ServiceError | null, res: T) =>
      err ? reject(err) : resolve(res),
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any)[method](...args);
  });
}

function stream<T>(method: string, request: unknown): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const rows: T[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const call = (client as any)[method](request, metadata);
    call.on("data", (row: T) => rows.push(row));
    call.on("error", reject);
    call.on("end", () => resolve(rows));
  });
}

interface CloudApi {
  name: string;
  userName: string;
  nickName: string;
  path?: string;
}

async function main(): Promise<void> {
  console.log(
    "getSystemInfo:",
    JSON.stringify(await unary("getSystemInfo", {}, false)),
  );

  const list = await unary<{ apis?: CloudApi[] }>("getAllCloudApis", {}, true);
  const apis = list.apis ?? [];
  console.log("\ncloud accounts:");
  for (const api of apis) {
    console.log(
      `  - ${api.name} | user=${api.userName} | path=${api.path ?? "(none)"}`,
    );
  }

  const listPaths = (process.env.PROBE_LIST ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (listPaths.length > 0) {
    for (const target of listPaths) {
      try {
        const rows = await stream<{ subFiles?: Array<{ name: string; isDirectory?: boolean; fullPathName?: string }> }>(
          "getSubFiles",
          { path: target, forceRefresh: true },
        );
        const entries = rows.flatMap((row) => row.subFiles ?? []);
        console.log(`\nlist ${target}: ${entries.length} entries`);
        for (const entry of entries) {
          console.log(
            `   ${entry.isDirectory ? "[D]" : "[F]"} ${entry.name}  (${entry.fullPathName})`,
          );
        }
      } catch (error) {
        console.error(`list ${target} failed: ${String(error)}`);
      }
    }
    return;
  }

  const parent = process.env.PROBE_PARENT;
  if (!parent) {
    console.log(
      "\nset PROBE_PARENT=/115/<dir> (and optionally PROBE_LINK=ed2k://...) to run the full flow",
    );
    return;
  }

  const folderName = process.env.PROBE_FOLDER ?? "__switcher_probe__";
  const toFolder = `${parent.replace(/\/+$/, "")}/${folderName}`;

  try {
    const replies = await stream<{ subFiles?: unknown[] }>("getSubFiles", {
      path: parent,
      forceRefresh: true,
    });
    console.log(
      `\nlist ${parent}: ${replies.flatMap((reply) => reply.subFiles ?? []).length} entries`,
    );
  } catch (error) {
    console.error("getSubFiles failed:", String(error));
  }

  try {
    const created = await unary(
      "createFolder",
      { parentPath: parent, folderName },
      true,
    );
    console.log("createFolder:", JSON.stringify(created));
  } catch (error) {
    console.error("createFolder failed:", String(error));
  }

  const link = process.env.PROBE_LINK;
  if (link) {
    try {
      const res = await unary("addOfflineFiles", { urls: link, toFolder }, true);
      console.log("addOfflineFiles:", JSON.stringify(res));
    } catch (error) {
      console.error("addOfflineFiles failed:", String(error));
    }
  }

  try {
    const offline = await unary(
      "listOfflineFilesByPath",
      { path: parent },
      true,
    );
    console.log("listOfflineFilesByPath:", JSON.stringify(offline));
  } catch (error) {
    console.error("listOfflineFilesByPath failed:", String(error));
  }

  if (process.env.PROBE_CLEANUP === "1") {
    try {
      const res = await unary("deleteFile", { path: toFolder }, true);
      console.log("deleteFile:", JSON.stringify(res));
    } catch (error) {
      console.error("deleteFile failed:", String(error));
    }
  }
}

main().catch((error) => {
  const err = error as grpc.ServiceError;
  console.error(`FAILED: ${err.message} (code ${err.code ?? "?"})`);
  process.exit(1);
});
