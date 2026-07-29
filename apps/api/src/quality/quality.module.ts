import { Module } from "@nestjs/common";
import { ProjectsModule } from "../projects/projects.module.js";
import { QualityController } from "./quality.controller.js";
import { QualityService } from "./quality.service.js";

@Module({
  imports: [ProjectsModule],
  controllers: [QualityController],
  providers: [QualityService],
})
export class QualityModule {}
