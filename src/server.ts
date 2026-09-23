import fs from "node:fs";
import { fileURLToPath } from "node:url";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { createCloudClient } from "./cloud";
import { loadConfig } from "./config";
import { processArchive, processLinks } from "./pipeline/processArchive";

const PAGE = fs.readFileSync(
  fileURLToPath(new URL("./web/index.html", import.meta.url)),
  "utf8",
);

async function main(): Promise<void> {
  const config = loadConfig();
  const client = createCloudClient(config.cloud);

  const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 * 1024 });
  await app.register(multipart, {
    limits: { fileSize: 1024 * 1024 * 1024 },
  });

  app.get("/", async (_request, reply) =>
    reply.type("text/html; charset=utf-8").send(PAGE),
  );

  app.get("/health", async () => ({
    ...(await client.health()),
    parentPath: config.parentPath,
    mock: config.cloud.mock,
  }));

  app.post("/process", async (request, reply) => {
    const query = request.query as { folderName?: string; parentPath?: string };
    const part = await request.file();
    if (!part) {
      return reply.code(400).send({ error: "缺少压缩包文件" });
    }
    try {
      const result = await processArchive(client, {
        archiveBuffer: await part.toBuffer(),
        archiveName: part.filename,
        parentPath: query.parentPath ?? config.parentPath,
        folderName: query.folderName,
        linkFilePatterns: config.linkFilePatterns,
        targetExtensions: config.targetExtensions,
        offlineBatchSize: config.offlineBatchSize,
        offlineWaitMs: config.offlineWaitMs,
      });
      return result;
    } catch (error) {
      request.log.error(error);
      return reply.code(422).send({ error: (error as Error).message });
    }
  });

  app.post("/process-path", async (request, reply) => {
    const body = request.body as {
      path?: string;
      folderName?: string;
      parentPath?: string;
    };
    if (!body?.path) {
      return reply.code(400).send({ error: "body.path is required" });
    }
    try {
      return await processArchive(client, {
        archivePath: body.path,
        archiveName: body.path,
        parentPath: body.parentPath ?? config.parentPath,
        folderName: body.folderName,
        linkFilePatterns: config.linkFilePatterns,
        targetExtensions: config.targetExtensions,
        offlineBatchSize: config.offlineBatchSize,
        offlineWaitMs: config.offlineWaitMs,
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(422).send({ error: (error as Error).message });
    }
  });

  app.post("/download", async (request, reply) => {
    const body = request.body as {
      links?: string | string[];
      folderName?: string;
      parentPath?: string;
      extensions?: string | string[];
    };
    const links = body?.links;
    const empty =
      !links ||
      (Array.isArray(links) && links.length === 0) ||
      (typeof links === "string" && links.trim().length === 0);
    if (empty) {
      return reply.code(400).send({ error: "body.links is required" });
    }

    const extensions = Array.isArray(body.extensions)
      ? body.extensions
      : typeof body.extensions === "string"
        ? body.extensions.split(",").map((item) => item.trim()).filter(Boolean)
        : [];

    try {
      return await processLinks(client, {
        links,
        parentPath: body.parentPath ?? config.parentPath,
        folderName: body.folderName,
        targetExtensions: extensions,
        offlineBatchSize: config.offlineBatchSize,
        offlineWaitMs: config.offlineWaitMs,
      });
    } catch (error) {
      request.log.error(error);
      return reply.code(422).send({ error: (error as Error).message });
    }
  });

  await app.listen({ port: config.port, host: config.host });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
