import { BadRequestException, Body, Controller, Get, Param, Post } from "@nestjs/common";
import { createProjectSchema, transitionProjectSchema } from "@sandeul/contracts";
import { CurrentAuth, CurrentRequest, Roles } from "../common/decorators.js";
import type { FactoryRequest, RequestAuth } from "../common/request-context.js";
import { ProjectsService } from "./projects.service.js";

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  list() {
    return this.projects.list();
  }

  @Get(":projectId")
  get(@Param("projectId") projectId: string) {
    return this.projects.get(projectId);
  }

  @Get(":projectId/history")
  history(@Param("projectId") projectId: string) {
    return this.projects.history(projectId);
  }

  @Roles("CEO", "PM")
  @Post()
  create(
    @Body() body: unknown,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    const parsed = createProjectSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.projects.create(parsed.data, actor, request);
  }

  @Roles("CEO", "PM")
  @Post(":projectId/transitions")
  transition(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    const parsed = transitionProjectSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.projects.transition(projectId, parsed.data, actor, request);
  }
}
