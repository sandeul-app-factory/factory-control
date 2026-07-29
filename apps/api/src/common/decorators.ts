import { createParamDecorator, SetMetadata } from "@nestjs/common";
import type { ExecutionContext } from "@nestjs/common";
import type { Role } from "@sandeul/contracts";
import type { FactoryRequest, RequestAuth } from "./request-context.js";

export const IS_PUBLIC_KEY = "factory:isPublic";
export const ROLES_KEY = "factory:roles";

export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: Role[]): MethodDecorator & ClassDecorator =>
  SetMetadata(ROLES_KEY, roles);

export const CurrentAuth = createParamDecorator(
  (_data: unknown, context: ExecutionContext): RequestAuth => {
    const request = context.switchToHttp().getRequest<FactoryRequest>();
    if (!request.auth) {
      throw new Error("인증 context가 없습니다.");
    }
    return request.auth;
  },
);

export const CurrentRequest = createParamDecorator(
  (_data: unknown, context: ExecutionContext): FactoryRequest =>
    context.switchToHttp().getRequest<FactoryRequest>(),
);
