import { BadRequestException, Body, Controller, Get, Param, Post, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { lowCodePageSchema } from "@flowmind/shared";
import { mockStore } from "../../common/mock-store";
import { DesignAgentService, type DesignAgentMessageRequest } from "./design-agent.service";
import { OssAssetsService, type UploadedAsset } from "./oss-assets.service";

@Controller("low-code")
export class LowCodeController {
  constructor(
    private readonly ossAssetsService: OssAssetsService,
    private readonly designAgentService: DesignAgentService
  ) {}

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


  @Post("agent/messages")
  sendAgentMessage(@Body() body: DesignAgentMessageRequest) {
    return this.designAgentService.sendMessage(body);
  }
  @Get("design-agent/assets/:runId/:fileName")
  generatedAgentAsset(
    @Param("runId") runId: string,
    @Param("fileName") fileName: string,
    @Res() response: Response
  ) {
    try {
      return response.sendFile(this.designAgentService.resolveGeneratedAssetPath(runId, fileName));
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : "Invalid generated asset path.");
    }
  }

  @Post("assets/images")
  @UseInterceptors(FileInterceptor("file"))
  uploadImage(@UploadedFile() file?: UploadedAsset) {
    return this.ossAssetsService.uploadImageAsset(file);
  }

  @Post("assets/background-image")
  @UseInterceptors(FileInterceptor("file"))
  uploadBackgroundImage(@UploadedFile() file?: UploadedAsset) {
    return this.ossAssetsService.uploadBackgroundImage(file);
  }
}
