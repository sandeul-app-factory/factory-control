import { Injectable } from "@nestjs/common";
import type { NestMiddleware } from "@nestjs/common";
import type { NextFunction, Response } from "express";
import { randomUUID } from "node:crypto";
import type { FactoryRequest } from "./request-context.js";

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(request: FactoryRequest, response: Response, next: NextFunction): void {
    const incoming = request.header("x-request-id");
    request.requestId =
      incoming && /^[A-Za-z0-9._:-]{8,100}$/.test(incoming) ? incoming : randomUUID();
    response.setHeader("x-request-id", request.requestId);
    next();
  }
}
