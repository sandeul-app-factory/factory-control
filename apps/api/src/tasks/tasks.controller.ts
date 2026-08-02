import { Body, Controller, Get, MessageEvent, Param, Post, Query, Sse } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { interval, map, mergeMap, type Observable } from "rxjs";
import { CurrentAuth, CurrentRequest, Roles } from "../common/decorators.js";
import type { FactoryRequest, RequestAuth } from "../common/request-context.js";
import { TasksService } from "./tasks.service.js";

@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get("projects/:projectId/tasks")
  list(@Param("projectId") projectId: string) {
    return this.tasks.list(projectId);
  }

  @Get("tasks/:taskId")
  get(@Param("taskId") taskId: string) {
    return this.tasks.get(taskId);
  }

  @Roles("CEO", "DEVELOPER")
  @Post("projects/:projectId/tasks")
  create(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.tasks.create(projectId, body, actor, request);
  }

  @Roles("CEO")
  @Post("tasks/:taskId/start")
  start(
    @Param("taskId") taskId: string,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.tasks.start(taskId, actor, request);
  }

  @Roles("CEO", "DEVELOPER")
  @Post("tasks/:taskId/instructions")
  followUp(
    @Param("taskId") taskId: string,
    @Body("instruction") instruction: unknown,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.tasks.followUp(taskId, instruction, actor, request);
  }

  @Roles("CEO", "DEVELOPER")
  @Post("tasks/:taskId/cancel")
  cancel(
    @Param("taskId") taskId: string,
    @CurrentAuth() actor: RequestAuth,
    @CurrentRequest() request: FactoryRequest,
  ) {
    return this.tasks.cancel(taskId, actor, request);
  }

  @SkipThrottle()
  @Sse("codex-runs/:codexRunId/events")
  stream(
    @Param("codexRunId") codexRunId: string,
    @Query("after") after = "0",
  ): Observable<MessageEvent> {
    let cursor = Number.isSafeInteger(Number(after)) ? Number(after) : 0;
    return interval(1_000).pipe(
      mergeMap(() => this.tasks.events(codexRunId, cursor)),
      mergeMap((events) => events),
      map((event) => {
        cursor = Math.max(cursor, event.sequence);
        return {
          id: String(event.sequence),
          data: {
            sequence: event.sequence,
            eventType: event.eventType,
            level: event.level,
            message: event.message,
            payload: event.payload,
            createdAt: event.createdAt,
          },
        };
      }),
    );
  }
}
