import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { lowCodePageSchema } from "@flowmind/shared";
import { mockStore } from "../../common/mock-store";

@Controller("low-code")
export class LowCodeController {
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
}
