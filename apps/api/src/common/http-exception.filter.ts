import { ArgumentsHost, Catch, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import type { FactoryRequest } from "./request-context.js";

@Catch()
export class FactoryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(FactoryExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<FactoryRequest>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const raw = exception instanceof HttpException ? exception.getResponse() : null;
    const message =
      typeof raw === "string"
        ? raw
        : raw && typeof raw === "object" && "message" in raw
          ? (raw as { message: string | string[] }).message
          : status === 500
            ? "서버 처리 중 오류가 발생했습니다."
            : "요청을 처리할 수 없습니다.";

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} requestId=${request.requestId}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({
      statusCode: status,
      error: HttpStatus[status] ?? "Error",
      message,
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
    });
  }
}
