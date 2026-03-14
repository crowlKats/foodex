import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const client = new S3Client({
  region: Deno.env.get("S3_REGION") ?? "auto",
  endpoint: Deno.env.get("S3_ENDPOINT"),
  credentials: {
    accessKeyId: Deno.env.get("S3_ACCESS_KEY_ID") ?? "",
    secretAccessKey: Deno.env.get("S3_SECRET_ACCESS_KEY") ?? "",
  },
  forcePathStyle: true,
});

const BUCKET = Deno.env.get("S3_BUCKET") ?? "foodex";

export function getServeUrl(key: string): string {
  return `/api/media/file/${encodeURIComponent(key)}`;
}

export async function uploadFile(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<string> {
  await client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return getServeUrl(key);
}

export async function getFile(
  key: string,
): Promise<{ body: ReadableStream; contentType: string } | null> {
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    );
    if (!res.Body) return null;
    return {
      body: res.Body.transformToWebStream(),
      contentType: res.ContentType ?? "application/octet-stream",
    };
  } catch {
    return null;
  }
}

export async function deleteFile(key: string): Promise<void> {
  await client.send(
    new DeleteObjectCommand({ Bucket: BUCKET, Key: key }),
  );
}
