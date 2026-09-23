import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { Readable, PassThrough, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

export class CompleteSqlDump extends Transform {
  bytes = 0;
  tail = Buffer.alloc(0);

  _transform(chunk, _encoding, done) {
    this.bytes += chunk.length;
    this.tail = Buffer.concat([this.tail, chunk]).subarray(-32);
    this.push(chunk);
    done();
  }

  _flush(done) {
    if (
      this.bytes < 100 ||
      !this.tail.toString("utf8").trimEnd().endsWith("COMMIT;")
    ) {
      done(new Error("SQL dump did not end with COMMIT"));
      return;
    }
    done();
  }
}

export function backupKey(now = new Date(), id = randomUUID()) {
  const iso = now.toISOString();
  return `libsql/${iso.slice(0, 4)}/${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.replaceAll(":", "-")}-${id}.sql.gz.age`;
}

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function backupConfig(env) {
  const host = required(env, "LIBSQL_HOST");
  if (!/^[a-z0-9-]+\.railway\.internal$/.test(host)) {
    if (env.BACKUP_ALLOW_LOCAL !== "true" || host !== "127.0.0.1") {
      throw new Error("LIBSQL_HOST must be a Railway private host");
    }
  }
  const accountId = required(env, "R2_ACCOUNT_ID");
  if (!/^[a-f0-9]{32}$/.test(accountId)) {
    throw new Error("R2_ACCOUNT_ID is invalid");
  }
  const recipient = required(env, "AGE_RECIPIENT");
  if (!/^age1[023456789acdefghjklmnpqrstuvwxyz]+$/.test(recipient)) {
    throw new Error("AGE_RECIPIENT is invalid");
  }
  return {
    url: `http://${host}:8080/dump?preserve_row_ids=true`,
    accountId,
    bucket: required(env, "R2_BUCKET"),
    accessKeyId: required(env, "R2_ACCESS_KEY_ID"),
    secretAccessKey: required(env, "R2_SECRET_ACCESS_KEY"),
    recipient,
  };
}

export async function runBackup(env = process.env) {
  const config = backupConfig(env);
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  const controller = new AbortController();
  let cancel = () => controller.abort();
  const timeout = setTimeout(
    () => cancel(new Error("Backup exceeded 15 minutes")),
    15 * 60_000,
  );
  timeout.unref();
  try {
    const response = await fetch(config.url, {
      signal: controller.signal,
      redirect: "error",
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(`libSQL dump failed with HTTP ${response.status}`);
    }

    const age = spawn("age", ["-r", config.recipient], {
      stdio: ["pipe", "pipe", "ignore"],
    });
    const complete = new CompleteSqlDump();
    const encrypted = new PassThrough({ highWaterMark: 8 * 1024 * 1024 });
    const key = backupKey();
    const upload = new Upload({
      client,
      params: {
        Bucket: config.bucket,
        Key: key,
        Body: encrypted,
        ContentType: "application/octet-stream",
      },
      partSize: 8 * 1024 * 1024,
      queueSize: 2,
      leavePartsOnError: false,
    });
    const ageExit = new Promise((resolve, reject) => {
      age.once("error", reject);
      age.once("close", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`age exited with code ${code}`)),
      );
    });
    cancel = (error) => {
      controller.abort();
      age.kill();
      encrypted.destroy(error);
    };
    const watch = (promise) =>
      promise.catch((error) => {
        cancel(error);
        throw error;
      });
    const outcomes = await Promise.allSettled([
      watch(
        pipeline(
          Readable.fromWeb(response.body),
          complete,
          createGzip(),
          age.stdin,
        ),
      ),
      watch(pipeline(age.stdout, encrypted)),
      watch(ageExit),
      watch(upload.done()),
    ]);
    const failed = outcomes.find((result) => result.status === "rejected");
    if (failed) throw failed.reason;

    const object = await client.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    if (!object.ContentLength) throw new Error("Uploaded backup is empty");
    console.log(`Backup stored: ${key} (${complete.bytes} SQL bytes)`);
    return { key, sqlBytes: complete.bytes, storedBytes: object.ContentLength };
  } finally {
    clearTimeout(timeout);
    controller.abort();
    client.destroy();
  }
}
