import {
  Controller,
  Delete,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Res,
  Body,
} from "@nestjs/common";
import type { Response } from "express";
import { CurrentRequest, Public } from "../common/decorators.js";
import type { FactoryRequest } from "../common/request-context.js";
import { McpService } from "./mcp.service.js";

@Public()
@Controller("mcp")
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @Post()
  async post(
    @Body() body: unknown,
    @CurrentRequest() request: FactoryRequest,
    @Res() response: Response,
  ): Promise<void> {
    const result = await this.mcp.handle(body, request);
    if (result.notification) {
      response.status(HttpStatus.ACCEPTED).send();
      return;
    }
    response
      .status(HttpStatus.OK)
      .type("application/json")
      .setHeader("MCP-Protocol-Version", request.header("mcp-protocol-version") ?? "2025-11-25")
      .send(result.response);
  }

  @Get()
  get(): never {
    this.mcp.assertEnabled();
    throw new HttpException("독립 SSE stream을 제공하지 않습니다.", HttpStatus.METHOD_NOT_ALLOWED);
  }

  @Delete()
  delete(): never {
    this.mcp.assertEnabled();
    throw new HttpException(
      "MCP session을 서버에 저장하지 않습니다.",
      HttpStatus.METHOD_NOT_ALLOWED,
    );
  }
}
