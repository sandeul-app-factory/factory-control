import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../index.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} 환경변수가 필요합니다.`);
  return value;
}

async function main(): Promise<void> {
  const name = required("MCP_CREDENTIAL_NAME");
  const ownerLoginId = required("ADMIN_LOGIN_ID");
  const pepper = required("MCP_TOKEN_PEPPER");
  const scopes = required("MCP_CREDENTIAL_SCOPES")
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  const rateLimit = Number(process.env.MCP_CREDENTIAL_RATE_LIMIT ?? 30);
  if (!scopes.length || !Number.isInteger(rateLimit) || rateLimit < 1 || rateLimit > 1000) {
    throw new Error("MCP scope 또는 rate limit이 올바르지 않습니다.");
  }
  const owner = await prisma.user.findUnique({ where: { loginId: ownerLoginId } });
  if (!owner || owner.status !== "ACTIVE" || owner.deletedAt) {
    throw new Error("활성 관리자 계정을 찾을 수 없습니다.");
  }
  const exists = await prisma.mcpCredential.findUnique({ where: { name } });
  if (exists) throw new Error("같은 이름의 MCP credential이 이미 있습니다.");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(`${pepper}:${token}`).digest("hex");
  const expiresAtRaw = process.env.MCP_CREDENTIAL_EXPIRES_AT?.trim();
  const expiresAt = expiresAtRaw ? new Date(expiresAtRaw) : null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt <= new Date())) {
    throw new Error("MCP_CREDENTIAL_EXPIRES_AT은 미래 ISO-8601 시각이어야 합니다.");
  }
  await prisma.mcpCredential.create({
    data: {
      name,
      tokenHash,
      scopes,
      rateLimit,
      expiresAt,
      createdBy: owner.id,
    },
  });
  process.stdout.write(
    [
      `MCP credential이 생성되었습니다: ${name}`,
      "다음 token은 다시 표시되지 않습니다. 안전한 Secret 저장소에 보관하세요.",
      token,
    ].join("\n") + "\n",
  );
}

async function run(): Promise<void> {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "MCP credential 생성 실패"}\n`,
    );
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void run();
