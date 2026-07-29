import type { Request } from "express";
import type { Role } from "@sandeul/contracts";

export interface RequestAuth {
  userId: string;
  loginId: string;
  email: string;
  role: Role;
  sessionId: string;
  csrfToken: string;
}

export interface FactoryRequest extends Request {
  auth?: RequestAuth;
  requestId: string;
  rawBody?: Buffer;
}
