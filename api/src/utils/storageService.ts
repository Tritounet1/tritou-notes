import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "./s3Client";

export const uploadFile = async (
  buffer: Buffer,
  key: string,
  contentType: string,
) => {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
};

export const getFile = async (key: string) => {
  return await s3Client.send(
    new GetObjectCommand({
      Bucket: process.env.S3_BUCKET!,
      Key: key,
    }),
  );
};

export const getPublicUrl = (key: string) =>
  `${process.env.S3_ENDPOINT}/${process.env.S3_BUCKET}/${key}`;
