import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { CreateBucketCommand, S3Client, S3ServiceException } from '@aws-sdk/client-s3';
import { applyTestEnv } from './test-env';

const ALREADY_EXISTS = new Set(['BucketAlreadyOwnedByYou', 'BucketAlreadyExists']);

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`E2E testlar uchun ${name} kerak`);
  return value;
};

async function ensureTestBuckets(): Promise<void> {
  const client = new S3Client({
    endpoint: env('S3_ENDPOINT'),
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId: env('S3_ACCESS_KEY'), secretAccessKey: env('S3_SECRET_KEY') },
  });

  try {
    for (const bucket of [env('S3_BUCKET_ORIGINALS'), env('S3_BUCKET_DERIVATIVES')]) {
      try {
        await client.send(new CreateBucketCommand({ Bucket: bucket }));
      } catch (error) {
        if (!(error instanceof S3ServiceException && ALREADY_EXISTS.has(error.name))) throw error;
      }
    }
  } finally {
    client.destroy();
  }
}

/** Test bazasini (migratsiyalar bilan) va test bucket'larini tayyorlaydi. */
export default async function globalSetup(): Promise<void> {
  applyTestEnv();
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: process.env,
    stdio: 'pipe',
  });
  await ensureTestBuckets();
}
