import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { lowCodeImageAssetSchema, type LowCodeImageAsset } from "@flowmind/shared";
import { createHmac, randomBytes } from "node:crypto";

export type UploadedAsset = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"] as const;

@Injectable()
export class OssAssetsService {
  constructor(private readonly configService: ConfigService) {}

  async uploadBackgroundImage(file: UploadedAsset | undefined): Promise<{ url: string }> {
    const asset = await this.uploadAsset(file, undefined, "background");

    return { url: asset.url };
  }

  async uploadImageAsset(file: UploadedAsset | undefined): Promise<LowCodeImageAsset> {
    return this.uploadAsset(file, "assets", "image");
  }

  private async uploadAsset(file: UploadedAsset | undefined, subfolder: string | undefined, fallbackName: string): Promise<LowCodeImageAsset> {
    this.validateImage(file, fallbackName);
    const config = this.getConfig();
    const prefix = subfolder ? `${config.prefix}/${subfolder}` : config.prefix;
    const objectKey = this.createObjectKey(prefix, file.originalname, fallbackName);
    const requestUrl = this.createRequestUrl(config, objectKey);
    const date = new Date().toUTCString();
    const headers = {
      Authorization: this.createAuthorization(config, "PUT", objectKey, file.mimetype, date),
      "Content-Length": String(file.size),
      "Content-Type": file.mimetype,
      Date: date
    };

    const response = await fetch(requestUrl, { method: "PUT", headers, body: file.buffer as unknown as BodyInit });
    if (!response.ok) {
      throw new ServiceUnavailableException(`OSS upload failed: ${response.status}`);
    }

    return lowCodeImageAssetSchema.parse({
      url: `${config.publicBaseUrl.replace(/\/+$/, "")}/${objectKey}`,
      key: objectKey,
      name: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size
    });
  }

  private validateImage(file: UploadedAsset | undefined, fallbackName: string): asserts file is UploadedAsset {
    const maxBytes = Number(this.configService.get<string>("LOW_CODE_ASSET_MAX_BYTES") ?? 5 * 1024 * 1024);
    if (!file) throw new BadRequestException(`Please choose a ${fallbackName} file to upload.`);
    if (!IMAGE_MIME_TYPES.includes(file.mimetype as (typeof IMAGE_MIME_TYPES)[number])) {
      throw new BadRequestException("Only JPG, PNG, WebP, GIF, and SVG images are supported.");
    }
    if (file.size > maxBytes) throw new BadRequestException(`Image files cannot exceed ${Math.round(maxBytes / 1024 / 1024)}MB.`);
  }

  private getConfig() {
    const accessKeyId = this.configService.get<string>("ALIYUN_OSS_ACCESS_KEY_ID");
    const accessKeySecret = this.configService.get<string>("ALIYUN_OSS_ACCESS_KEY_SECRET");
    const bucket = this.configService.get<string>("ALIYUN_OSS_BUCKET");
    const endpoint = this.normalizeEndpoint(this.configService.get<string>("ALIYUN_OSS_ENDPOINT"));
    const publicBaseUrl = this.configService.get<string>("ALIYUN_OSS_PUBLIC_BASE_URL") ?? (bucket && endpoint ? `https://${bucket}.${endpoint}` : undefined);
    const prefix = (this.configService.get<string>("ALIYUN_OSS_PREFIX") ?? "low-code/backgrounds").replace(/^\/+|\/+$/g, "");

    if (!accessKeyId || !accessKeySecret || !bucket || !endpoint || !publicBaseUrl) {
      throw new ServiceUnavailableException(
        "OSS config is incomplete. Please set ALIYUN_OSS_ACCESS_KEY_ID, ALIYUN_OSS_ACCESS_KEY_SECRET, ALIYUN_OSS_BUCKET, and ALIYUN_OSS_ENDPOINT."
      );
    }

    return { accessKeyId, accessKeySecret, bucket, endpoint, prefix, publicBaseUrl };
  }

  private normalizeEndpoint(value: string | undefined) {
    return value?.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }

  private createObjectKey(prefix: string, originalName: string, fallbackName: string) {
    const safeName = this.safeName(originalName, fallbackName);
    const extension = safeName.split(".").pop();
    const baseName = safeName.replace(/\.[^.]+$/, "") || fallbackName;
    const suffix = extension && extension !== baseName ? `.${extension}` : "";
    return `${prefix}/${Date.now()}-${randomBytes(4).toString("hex")}-${baseName}${suffix}`;
  }

  private safeName(name: string, fallbackName = "image") {
    return name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || fallbackName;
  }

  private createRequestUrl(config: { bucket: string; endpoint: string }, objectKey: string) {
    return `https://${config.bucket}.${config.endpoint}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
  }

  private createAuthorization(config: { accessKeyId: string; accessKeySecret: string; bucket: string }, method: "PUT", objectKey: string, contentType: string, date: string) {
    const canonicalResource = `/${config.bucket}/${objectKey}`;
    const stringToSign = `${method}\n\n${contentType}\n${date}\n${canonicalResource}`;
    const signature = createHmac("sha1", config.accessKeySecret).update(stringToSign).digest("base64");
    return `OSS ${config.accessKeyId}:${signature}`;
  }
}
