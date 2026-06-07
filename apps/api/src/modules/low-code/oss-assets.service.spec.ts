import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { OssAssetsService } from "./oss-assets.service";

function serviceWithConfig(values: Record<string, string | undefined>) {
  return new OssAssetsService({
    get(key: string) {
      return values[key];
    }
  } as ConfigService);
}

describe("OssAssetsService", () => {
  it("rejects missing, non-image, and oversized background uploads", async () => {
    const service = serviceWithConfig({ LOW_CODE_ASSET_MAX_BYTES: "10" });

    await expect(service.uploadBackgroundImage(undefined)).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.uploadBackgroundImage({ originalname: "notes.txt", mimetype: "text/plain", size: 5, buffer: Buffer.from("hello") })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.uploadBackgroundImage({ originalname: "hero.png", mimetype: "image/png", size: 11, buffer: Buffer.alloc(11) })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("uploads image files to OSS and returns the public URL", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true })) as unknown as typeof fetch;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchMock;
    try {
      const service = serviceWithConfig({
        ALIYUN_OSS_ACCESS_KEY_ID: "ak",
        ALIYUN_OSS_ACCESS_KEY_SECRET: "sk",
        ALIYUN_OSS_BUCKET: "flowmind-assets",
        ALIYUN_OSS_ENDPOINT: "oss-cn-hangzhou.aliyuncs.com",
        ALIYUN_OSS_PUBLIC_BASE_URL: "https://cdn.example.com/assets",
        ALIYUN_OSS_PREFIX: "low-code/backgrounds"
      });

      const result = await service.uploadBackgroundImage({
        originalname: "hero image.png",
        mimetype: "image/png",
        size: 4,
        buffer: Buffer.from([1, 2, 3, 4])
      });

      expect(result.url).toMatch(/^https:\/\/cdn\.example\.com\/assets\/low-code\/backgrounds\/\d+-[a-f0-9]+-hero-image\.png$/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(requestUrl).toMatch(/^https:\/\/flowmind-assets\.oss-cn-hangzhou\.aliyuncs\.com\/low-code\/backgrounds\//);
      expect(requestInit.method).toBe("PUT");
      expect((requestInit.headers as Record<string, string>).Authorization).toMatch(/^OSS ak:/);
      expect(requestInit.body).toEqual(Buffer.from([1, 2, 3, 4]));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("reports a clear error when OSS config is incomplete", async () => {
    const service = serviceWithConfig({ ALIYUN_OSS_BUCKET: "flowmind-assets" });

    await expect(
      service.uploadBackgroundImage({ originalname: "hero.png", mimetype: "image/png", size: 4, buffer: Buffer.from([1]) })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
