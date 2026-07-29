import { Controller, Get, Query } from "@nestjs/common";
import { prisma } from "@sandeul/database";
import { Roles } from "../common/decorators.js";

@Roles("CEO")
@Controller("audit-logs")
export class AuditController {
  @Get()
  async list(@Query("projectId") projectId?: string, @Query("cursor") cursor?: string) {
    const logs = await prisma.auditLog.findMany({
      ...(projectId ? { where: { projectId } } : {}),
      orderBy: { createdAt: "desc" },
      take: 101,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    const hasNext = logs.length > 100;
    const items = hasNext ? logs.slice(0, 100) : logs;
    return {
      items,
      nextCursor: hasNext ? items.at(-1)?.id : null,
    };
  }
}
