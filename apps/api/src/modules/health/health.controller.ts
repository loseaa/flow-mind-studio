import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { DatabaseService } from "../../database/database.service";

@Controller("health")
export class HealthController {
  constructor(private readonly db: DatabaseService, private readonly config: ConfigService) {}
  @Get()
  async health() {
    let postgres: "up"|"down"="down", redis: "up"|"down"="down";
    try { await this.db.query("SELECT 1"); postgres="up"; } catch {}
    const client=new Redis(this.config.get<string>("REDIS_URL")??"redis://localhost:6379",{lazyConnect:true,maxRetriesPerRequest:0,connectTimeout:1000});
    try { await client.connect(); await client.ping(); redis="up"; } catch {} finally { client.disconnect(); }
    return { status: postgres==="up"&&redis==="up"?"ok":"degraded", services:{api:"up",postgres,redis} };
  }
}
