import { createCloudClient } from "./cloud";
import { loadConfig } from "./config";
import { processArchive } from "./pipeline/processArchive";

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg || !arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = args[i + 1];
    if (value && !value.startsWith("--")) {
      flags[key] = value;
      i += 1;
    }
  }
  return flags;
}

async function main(): Promise<void> {
  const [archivePath, ...rest] = process.argv.slice(2);
  if (!archivePath) {
    console.error(
      "用法: npm run cli -- <压缩包路径> [--folder 名称] [--parent /115]",
    );
    process.exit(1);
  }

  const flags = parseFlags(rest);
  const config = loadConfig();
  const client = createCloudClient(config.cloud);

  const result = await processArchive(client, {
    archivePath,
    archiveName: archivePath,
    parentPath: flags.parent ?? config.parentPath,
    folderName: flags.folder,
    linkFilePatterns: config.linkFilePatterns,
    targetExtensions: config.targetExtensions,
    offlineBatchSize: config.offlineBatchSize,
    offlineWaitMs: config.offlineWaitMs,
  });

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
