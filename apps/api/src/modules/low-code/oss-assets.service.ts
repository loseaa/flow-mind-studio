import { BadRequestException, Injectable, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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
    this.validateImage(file);
    const config = this.getConfig();
    const objectKey = this.createObjectKey(config.prefix, file!.originalname);
    const requestUrl = this.createRequestUrl(config, objectKey);
    const date = new Date().toUTCString();
    const headers = {
      Authorization: this.createAuthorization(config, "PUT", objectKey, file!.mimetype, date),
      "Content-Length": String(file!.size),
      "Content-Type": file!.mimetype,
      Date: date
    };

    const response = await fetch(requestUrl, { method: "PUT", headers, body: file!.buffer as unknown as BodyInit });
    if (!response.ok) {
      throw new ServiceUnavailableException(`OSS 上传失败：${response.status}`);
    }

    return { url: `${config.publicBaseUrl.replace(/\/+$/, "")}/${objectKey}` };
  }

  private validateImage(file: UploadedAsset | undefined) {
    const maxBytes = Number(this.configService.get<string>("LOW_CODE_ASSET_MAX_BYTES") ?? 5 * 1024 * 1024);
    if (!file) throw new BadRequestException("请选择需要上传的背景图片。");
    if (!IMAGE_MIME_TYPES.includes(file.mimetype as (typeof IMAGE_MIME_TYPES)[number])) {
      throw new BadRequestException("仅支持 JPG、PNG、WebP、GIF 或 SVG 图片。");
    }
    if (file.size > maxBytes) throw new BadRequestException(`背景图片不能超过 ${Math.round(maxBytes / 1024 / 1024)}MB。`);
  }

  private getConfig() {
    const accessKeyId = this.configService.get<string>("ALIYUN_OSS_ACCESS_KEY_ID");
    const accessKeySecret = this.configService.get<string>("ALIYUN_OSS_ACCESS_KEY_SECRET");
    const bucket = this.configService.get<string>("ALIYUN_OSS_BUCKET");
    const endpoint = this.normalizeEndpoint(this.configService.get<string>("ALIYUN_OSS_ENDPOINT"));
    const publicBaseUrl = this.configService.get<string>("ALIYUN_OSS_PUBLIC_BASE_URL") ?? (bucket && endpoint ? `https://${bucket}.${endpoint}` : undefined);
    const prefix = (this.configService.get<string>("ALIYUN_OSS_PREFIX") ?? "low-code/backgrounds").replace(/^\/+|\/+$/g, "");

    if (!accessKeyId || !accessKeySecret || !bucket || !endpoint || !publicBaseUrl) {
      throw new ServiceUnavailableException("OSS 配置不完整，请配置 ALIYUN_OSS_ACCESS_KEY_ID、ALIYUN_OSS_ACCESS_KEY_SECRET、ALIYUN_OSS_BUCKET、ALIYUN_OSS_ENDPOINT。");
    }

    return { accessKeyId, accessKeySecret, bucket, endpoint, prefix, publicBaseUrl };
  }

  private normalizeEndpoint(value: string | undefined) {
    return value?.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }

  private createObjectKey(prefix: string, originalName: string) {
    const extension = this.safeName(originalName).split(".").pop();
    const baseName = this.safeName(originalName).replace(/\.[^.]+$/, "") || "background";
    const suffix = extension && extension !== baseName ? `.${extension}` : "";
    return `${prefix}/${Date.now()}-${randomBytes(4).toString("hex")}-${baseName}${suffix}`;
  }

  private safeName(name: string) {
    return name.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "background";
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
