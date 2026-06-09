import { Body, Controller, Get, Param, Post, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { lowCodePageSchema } from "@flowmind/shared";
import { mockStore } from "../../common/mock-store";
import { LowCodeAssetsService, type UploadedImageAsset } from "./low-code-assets.service";

@Controller("low-code")
export class LowCodeController {
  constructor(private readonly assetsService: LowCodeAssetsService) {}

  @Get("pages")
  pages() {
    return mockStore.lowCodePages;
  }

  @Post("pages")
  save(@Body() body: unknown) {
    const page = lowCodePageSchema.parse(body);
    const index = mockStore.lowCodePages.findIndex((item) => item.id === page.id);
    if (index >= 0) {
      mockStore.lowCodePages[index] = page;
    } else {
      mockStore.lowCodePages.unshift(page);
    }
    return page;
  }

  @Post("pages/:id/publish")
  publish(@Param("id") id: string) {
    const page = mockStore.lowCodePages.find((item) => item.id === id);
    if (!page) return { error: "PAGE_NOT_FOUND" };
    page.status = "published";
    page.version += 1;
    return page;
  }

  @Post("assets/images")
  @UseInterceptors(FileInterceptor("file"))
  uploadImage(@UploadedFile() file?: UploadedImageAsset) {
    return this.assetsService.uploadImage(file);
  }
}
