import { Body, Controller, Get, Post } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { mockStore } from "../../common/mock-store";

@Controller("auth")
export class AuthController {
  constructor(private readonly jwtService: JwtService) {}

  @Post("login")
  login(@Body() body: { email?: string }) {
    const user = mockStore.users.find((item) => item.email === body.email) ?? mockStore.users[0];
    const membership = mockStore.memberships.find((item) => item.userId === user.id)!;
    return {
      accessToken: this.jwtService.sign({
        sub: user.id,
        organizationId: membership.organizationId,
        role: membership.role
      }),
      user,
      organization: mockStore.organizations.find((item) => item.id === membership.organizationId),
      role: membership.role
    };
  }

  @Get("me")
  me() {
    const user = mockStore.users[0];
    const membership = mockStore.memberships[0];
    return {
      user,
      organization: mockStore.organizations[0],
      role: membership.role
    };
  }
}
