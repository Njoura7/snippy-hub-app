import type { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageDriver } from "./types.js";

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export function createR2StorageDriver(opts: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
}): StorageDriver {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${opts.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
    },
  });

  return {
    async put(key, source, putOpts) {
      // Upload (not client.send(PutObjectCommand)) so multi-GB files stream in
      // chunks with automatic multipart handling instead of buffering in memory.
      const upload = new Upload({
        client,
        params: {
          Bucket: opts.bucket,
          Key: key,
          Body: source,
          ContentType: putOpts?.contentType,
        },
      });
      await upload.done();
    },

    async getReadStream(key) {
      const result = await client.send(new GetObjectCommand({ Bucket: opts.bucket, Key: key }));
      return result.Body as Readable;
    },

    async getServableUrl(key) {
      const command = new GetObjectCommand({ Bucket: opts.bucket, Key: key });
      return getSignedUrl(client, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
    },

    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: opts.bucket, Key: key }));
    },
  };
}
