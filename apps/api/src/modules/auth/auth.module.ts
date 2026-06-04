import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthController } from "./auth.controller";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? "flowmind-dev-secret",
      signOptions: { expiresIn: "7d" }
    })
  ],
  controllers: [AuthController]
})
export class AuthModule {}
