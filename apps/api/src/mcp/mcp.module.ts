import { Module } from "@nestjs/common";
import { ArtifactsModule } from "../artifacts/artifacts.module.js";
import { DecisionsModule } from "../decisions/decisions.module.js";
import { PrdModule } from "../prd/prd.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { McpController } from "./mcp.controller.js";
import { McpService } from "./mcp.service.js";

@Module({
  imports: [ProjectsModule, ArtifactsModule, PrdModule, DecisionsModule],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}
