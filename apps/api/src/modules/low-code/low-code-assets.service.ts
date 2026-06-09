import { BadRequestException, Inject, Injectable, Optional, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { lowCodeImageAssetSchema, type LowCodeImageAsset } from "@flowmind/shared";
import { createHmac, randomUUID } from "node:crypto";

const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"]);

export type UploadedImageAsset = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

export type OssPutObjectInput = {
  key: string;
  mimeType: string;
  body: Buffer;
};

type OssConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpoint: string;
  publicBaseUrl: string;
};

type OssPutObject = (input: OssPutObjectInput, config: OssConfig) => Promise<void>;
export const LOW_CODE_OSS_PUT_OBJECT = Symbol("LOW_CODE_OSS_PUT_OBJECT");

@Injectable()
export class LowCodeAssetsService {
  constructor(
    private readonly configService: ConfigService,
    @Optional() @Inject(LOW_CODE_OSS_PUT_OBJECT) private readonly putObject: OssPutObject = putObjectToOss
  ) {}

  async uploadImage(file: UploadedImageAsset | undefined): Promise<LowCodeImageAsset> {
    this.validateImage(file);
    const config = this.ossConfig();
    const key = this.assetKey(file.originalname);

    await this.putObject({ key, mimeType: file.mimetype, body: file.buffer }, config);

    return lowCodeImageAssetSchema.parse({
      url: `${config.publicBaseUrl}/${encodeObjectKey(key)}`,
      key,
      name: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size
    });
  }

  private validateImage(file: UploadedImageAsset | undefined): asserts file is UploadedImageAsset {
    if (!file) throw new BadRequestException("请选择需要上传的图片。");
    if (!SUPPORTED_IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException("仅支持 JPG、PNG、WebP、GIF 和 SVG 图片。");
    }
    const maxBytes = Number(this.configService.get<string>("LOW_CODE_ASSET_MAX_BYTES") ?? 5 * 1024 * 1024);
    if (file.size > maxBytes) throw new BadRequestException(`图片不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB。`);
  }

  private assetKey(originalName: string) {
    const prefix = trimSlashes(this.configService.get<string>("ALIYUN_OSS_PREFIX") ?? "low-code/backgrounds");
    return `${prefix}/assets/${randomUUID()}-${sanitizeFileName(originalName)}`;
  }

  private ossConfig(): OssConfig {
    const accessKeyId = requiredConfig(this.configService, "ALIYUN_OSS_ACCESS_KEY_ID");
    const accessKeySecret = requiredConfig(this.configService, "ALIYUN_OSS_ACCESS_KEY_SECRET");
    const bucket = requiredConfig(this.configService, "ALIYUN_OSS_BUCKET");
    const endpoint = normalizeEndpoint(requiredConfig(this.configService, "ALIYUN_OSS_ENDPOINT"));
    const publicBaseUrl = trimRightSlash(requiredConfig(this.configService, "ALIYUN_OSS_PUBLIC_BASE_URL"));
    return { accessKeyId, accessKeySecret, bucket, endpoint, publicBaseUrl };
  }
}

async function putObjectToOss(input: OssPutObjectInput, config: OssConfig) {
  const date = new Date().toUTCString();
  const resource = `/${config.bucket}/${input.key}`;
  const signature = createHmac("sha1", config.accessKeySecret)
    .update(`PUT\n\n${input.mimeType}\n${date}\n${resource}`)
    .digest("base64");
  const response = await fetch(`https://${config.bucket}.${config.endpoint}/${encodeObjectKey(input.key)}`, {
    method: "PUT",
    headers: {
      Authorization: `OSS ${config.accessKeyId}:${signature}`,
      "Content-Disposition": "inline",
      "Content-Type": input.mimeType,
      Date: date
    },
    body: new Blob([new Uint8Array(input.body)], { type: input.mimeType })
  });

  if (!response.ok) {
    throw new ServiceUnavailableException(`OSS 上传失败：${response.status}`);
  }
}

function requiredConfig(configService: ConfigService, key: string) {
  const value = configService.get<string>(key);
  if (!value) throw new ServiceUnavailableException(`缺少 OSS 配置：${key}`);
  return value;
}

function sanitizeFileName(fileName: string) {
  const normalized = fileName.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "image.png";
}

function normalizeEndpoint(endpoint: string) {
  return trimRightSlash(endpoint.replace(/^https?:\/\//, ""));
}

function trimSlashes(value: string) {
  return value.replace(/^\/+|\/+$/g, "");
}

function trimRightSlash(value: string) {
  return value.replace(/\/+$/g, "");
}

function encodeObjectKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}
