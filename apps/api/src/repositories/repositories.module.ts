import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module.js";
import { ProjectsModule } from "../projects/projects.module.js";
import { RepositoriesController } from "./repositories.controller.js";
import { RepositoriesService } from "./repositories.service.js";

@Module({
  imports: [AuditModule, ProjectsModule],
  controllers: [RepositoriesController],
  providers: [RepositoriesService],
  exports: [RepositoriesService],
})
export class RepositoriesModule {}
