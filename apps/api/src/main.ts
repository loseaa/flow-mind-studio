import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { DesignAgentService } from "./modules/low-code/design-agent.service";
import { attachLowCodeAgentWebSocket } from "./modules/low-code/low-code-agent.ws";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: true,
    credentials: true
  });
  app.setGlobalPrefix("api");
  attachLowCodeAgentWebSocket(app.getHttpServer(), app.get(DesignAgentService, { strict: false }));
  const port = Number(process.env.API_PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();
