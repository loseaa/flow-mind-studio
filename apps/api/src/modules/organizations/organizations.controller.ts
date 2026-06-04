import { Controller, Get } from "@nestjs/common";
import { mockStore } from "../../common/mock-store";

@Controller("organizations")
export class OrganizationsController {
  @Get("current")
  current() {
    return {
      organization: mockStore.organizations[0],
      members: mockStore.memberships.map((membership) => ({
        ...membership,
        user: mockStore.users.find((user) => user.id === membership.userId)
      }))
    };
  }
}
