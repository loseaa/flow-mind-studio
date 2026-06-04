import { Controller, Get } from "@nestjs/common";
import { mockStore } from "../../common/mock-store";

@Controller("data-models")
export class DataModelsController {
  @Get()
  list() {
    return mockStore.dataModels;
  }
}
