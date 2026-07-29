import { Controller, Get } from "@nestjs/common";
import { prisma } from "@sandeul/database";
import { Public } from "./common/decorators.js";

@Controller("health")
export class HealthController {
  @Public()
  @Get()
  async health() {
    await prisma.$queryRaw`SELECT 1`;
    return {
      status: "ok",
      service: "sandeul-factory-api",
      timestamp: new Date().toISOString(),
    };
  }
}
