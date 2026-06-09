import { BadRequestException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { LowCodeAssetsService } from "./low-code-assets.service";

describe("LowCodeAssetsService", () => {
  it("uploads image assets to the configured OSS bucket", async () => {
    const uploads: Array<{ key: string; mimeType: string; body: Buffer }> = [];
    const service = new LowCodeAssetsService(config(), async (input) => {
      uploads.push(input);
    });

    const result = await service.uploadImage({
      originalname: "customer overview.png",
      mimetype: "image/png",
      size: 6,
      buffer: Buffer.from("image!")
    });

    expect(uploads).toHaveLength(1);
    expect(uploads[0]?.key).toMatch(/^low-code\/backgrounds\/assets\/[a-z0-9-]+-customer-overview\.png$/);
    expect(uploads[0]?.mimeType).toBe("image/png");
    expect(result.url).toMatch(/^https:\/\/flowmindstudio\.oss-cn-beijing\.aliyuncs\.com\/low-code\/backgrounds\/assets\/[a-z0-9-]+-customer-overview\.png$/);
    expect(result.name).toBe("customer overview.png");
    expect(result.sizeBytes).toBe(6);
  });

  it("rejects non-image uploads", async () => {
    const service = new LowCodeAssetsService(config(), async () => {});

    await expect(service.uploadImage({
      originalname: "notes.txt",
      mimetype: "text/plain",
      size: 5,
      buffer: Buffer.from("hello")
    })).rejects.toBeInstanceOf(BadRequestException);
  });
});

function config(): ConfigService {
  const values: Record<string, string> = {
    ALIYUN_OSS_ACCESS_KEY_ID: "test-id",
    ALIYUN_OSS_ACCESS_KEY_SECRET: "test-secret",
    ALIYUN_OSS_BUCKET: "flowmindstudio",
    ALIYUN_OSS_ENDPOINT: "oss-cn-beijing.aliyuncs.com",
    ALIYUN_OSS_PUBLIC_BASE_URL: "https://flowmindstudio.oss-cn-beijing.aliyuncs.com",
    ALIYUN_OSS_PREFIX: "low-code/backgrounds",
    LOW_CODE_ASSET_MAX_BYTES: "5242880"
  };
  return {
    get: (key: string) => values[key]
  } as ConfigService;
}
