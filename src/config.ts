import { fileURLToPath } from "node:url";

export interface CloudConfig {
  mock: boolean;
  address: string;
  tls: boolean;
  token?: string;
  username?: string;
  password?: string;
  totp?: string;
  cloudName?: string;
  cloudAccountId?: string;
  protoPath: string;
}

export interface AppConfig {
  port: number;
  host: string;
  parentPath: string;
  linkFilePatterns: RegExp[];
  targetExtensions: string[];
  offlineBatchSize: number;
  offlineWaitMs: number;
  cloud: CloudConfig;
}

const DEFAULT_PROTO_PATH = fileURLToPath(
  new URL("../proto/clouddrive.proto", import.meta.url),
);

function env(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

function bool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
}

function compilePatterns(source: string | undefined): RegExp[] {
  const raw = source ?? "\\.(txt|url|list|md)$";
  const patterns: RegExp[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed) patterns.push(new RegExp(trimmed, "i"));
  }
  return patterns.length > 0 ? patterns : [/\.(txt|url|list|md)$/i];
}

function compileExtensions(source: string | undefined): string[] {
  const raw = source ?? "mp4";
  return raw
    .split(",")
    .map((part) => part.trim().replace(/^\./, "").toLowerCase())
    .filter((part) => part.length > 0);
}

let envLoaded = false;

function loadDotEnv(): void {
  if (envLoaded) return;
  envLoaded = true;
  try {
    process.loadEnvFile();
  } catch {
    // No .env file present; rely on the actual environment.
  }
}

export function loadConfig(): AppConfig {
  loadDotEnv();
  return {
    port: Number(env("PORT") ?? 8787),
    host: env("HOST") ?? "0.0.0.0",
    parentPath: env("CD_PARENT_PATH") ?? "/115",
    linkFilePatterns: compilePatterns(env("LINK_FILE_REGEX")),
    targetExtensions: compileExtensions(env("TARGET_EXTENSIONS")),
    offlineBatchSize: Number(env("CLOUDDRIVE_OFFLINE_BATCH") ?? 1),
    offlineWaitMs: Number(env("OFFLINE_WAIT_MS") ?? 0),
    cloud: {
      mock: bool(env("CLOUDDRIVE_MOCK"), false),
      address: env("CLOUDDRIVE_GRPC_ADDR") ?? "127.0.0.1:19798",
      tls: bool(env("CLOUDDRIVE_GRPC_TLS"), false),
      token: env("CLOUDDRIVE_TOKEN"),
      username: env("CLOUDDRIVE_USERNAME"),
      password: env("CLOUDDRIVE_PASSWORD"),
      totp: env("CLOUDDRIVE_TOTP"),
      cloudName: env("CLOUDDRIVE_CLOUD_NAME"),
      cloudAccountId: env("CLOUDDRIVE_CLOUD_ACCOUNT"),
      protoPath: env("CLOUDDRIVE_PROTO_PATH") ?? DEFAULT_PROTO_PATH,
    },
  };
}
