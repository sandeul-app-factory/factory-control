import { MiddlewareConsumer, Module, NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { CsrfGuard, RolesGuard, SessionAuthGuard } from "./common/guards.js";
import { RequestIdMiddleware } from "./common/request-id.middleware.js";
import { HealthController } from "./health.controller.js";
import { ArtifactsModule } from "./artifacts/artifacts.module.js";
import { DecisionsModule } from "./decisions/decisions.module.js";
import { PrdModule } from "./prd/prd.module.js";
import { ProjectsModule } from "./projects/projects.module.js";
import { RepositoriesModule } from "./repositories/repositories.module.js";
import { TasksModule } from "./tasks/tasks.module.js";

@Module({
  imports: [
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 120 }]),
    AuditModule,
    AuthModule,
    ProjectsModule,
    ArtifactsModule,
    PrdModule,
    DecisionsModule,
    RepositoriesModule,
    TasksModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: SessionAuthGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes("*splat");
  }
}
