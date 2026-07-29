import { Module } from "@nestjs/common";
import { ArtifactsModule } from "../artifacts/artifacts.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { PrdController } from "./prd.controller.js";
import { PrdService } from "./prd.service.js";

@Module({
  imports: [ArtifactsModule, ProjectsModule],
  controllers: [PrdController],
  providers: [PrdService],
  exports: [PrdService],
})
export class PrdModule {}
