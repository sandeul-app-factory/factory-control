import argon2 from "argon2";
import { prisma } from "../index.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} 환경변수가 필요합니다.`);
  }
  return value;
}

function validatePassword(password: string): void {
  if (
    password.length < 14 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/[0-9]/.test(password) ||
    !/[^A-Za-z0-9]/.test(password)
  ) {
    throw new Error("비밀번호는 14자 이상이며 대/소문자, 숫자, 특수문자를 포함해야 합니다.");
  }
}

async function main(): Promise<void> {
  const loginId = required("ADMIN_LOGIN_ID");
  const email = required("ADMIN_EMAIL").toLowerCase();
  const password = required("ADMIN_PASSWORD");
  validatePassword(password);

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 1,
  });

  const user = await prisma.user.upsert({
    where: { loginId },
    update: {
      email,
      passwordHash,
      passwordChangedAt: new Date(),
      role: "CEO",
      status: "ACTIVE",
      failedLoginCount: 0,
      lockedUntil: null,
      version: { increment: 1 },
    },
    create: { loginId, email, passwordHash, role: "CEO" },
    select: { id: true, loginId: true, email: true, role: true },
  });

  process.stdout.write(`관리자 계정이 준비되었습니다: ${user.loginId} (${user.email})\n`);
}

async function run(): Promise<void> {
  try {
    await main();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "관리자 생성에 실패했습니다.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

void run();
