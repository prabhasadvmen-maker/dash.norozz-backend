import { S3Client, PutBucketCorsCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
dotenv.config();

const endpoint = process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const s3Client = new S3Client({
  region: 'auto',
  endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

await s3Client.send(new PutBucketCorsCommand({
  Bucket: process.env.R2_BUCKET,
  CORSConfiguration: {
    CORSRules: [
      {
        AllowedOrigins: ['https://norozz.in', 'https://www.norozz.in', 'http://localhost:5173'],
        AllowedMethods: ['GET', 'PUT', 'HEAD'],
        AllowedHeaders: ['*'],
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3600,
      },
    ],
  },
}));

console.log(`CORS applied to bucket ${process.env.R2_BUCKET}`);
