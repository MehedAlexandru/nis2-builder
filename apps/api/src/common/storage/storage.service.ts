import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import type { AppEnv } from '../../config/env';

export interface StorageConfig {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  forcePathStyle: boolean;
}

export interface StoredObject {
  body: Readable;
  contentType: string | null;
  contentLength: number | null;
}

export interface ObjectStorage {
  isConfigured(): boolean;
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  getObject(key: string): Promise<StoredObject>;
  deleteObject(key: string): Promise<void>;
}

/** S3-compatible object storage used by exports, logos and attachments. */
export class S3Storage implements ObjectStorage {
  private readonly bucket: string;
  private readonly client: S3Client | null;

  constructor(config: StorageConfig) {
    this.bucket = config.bucket;
    const clientConfig: S3ClientConfig = {
      region: config.region,
      forcePathStyle: config.forcePathStyle,
    };
    if (config.endpoint) clientConfig.endpoint = config.endpoint;
    if (config.accessKeyId && config.secretAccessKey) {
      clientConfig.credentials = {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      };
    }
    this.client = config.accessKeyId && config.secretAccessKey ? new S3Client(clientConfig) : null;
  }

  isConfigured(): boolean {
    return this.client !== null;
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    if (!this.client) throw new Error('Object storage is not configured');
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'private, max-age=0, no-store',
      }),
    );
  }

  async getObject(key: string): Promise<StoredObject> {
    if (!this.client) throw new Error('Object storage is not configured');
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body || typeof (response.Body as Readable).pipe !== 'function') {
      throw new Error('Object storage returned an unreadable body');
    }
    return {
      body: response.Body as Readable,
      contentType: response.ContentType ?? null,
      contentLength: response.ContentLength ?? null,
    };
  }

  async deleteObject(key: string): Promise<void> {
    if (!this.client) throw new Error('Object storage is not configured');
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

@Injectable()
export class StorageService extends S3Storage {
  constructor(config: ConfigService<AppEnv, true>) {
    super({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      bucket: config.get('S3_BUCKET', { infer: true }),
      accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
      secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
    });
  }
}
