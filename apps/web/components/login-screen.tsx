"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Card, Field } from "@sandeul/ui";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useForm } from "react-hook-form";
import { loginSchema } from "@sandeul/contracts";
import type { LoginInput } from "@sandeul/contracts";
import { apiRequest } from "../lib/api";
import type { AuthState } from "../lib/api";

export function LoginScreen({ onLogin }: { onLogin: (state: AuthState) => void }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { loginId: "", password: "" },
  });

  const submit = handleSubmit(async (values) => {
    try {
      const state = await apiRequest<AuthState>("/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      });
      onLogin(state);
    } catch (error) {
      setError("root", {
        message: error instanceof Error ? error.message : "로그인에 실패했습니다.",
      });
    }
  });

  return (
    <main className="grid min-h-screen place-items-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-7 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-xl border border-emerald-700 bg-emerald-950 text-emerald-300">
            <LockKeyhole aria-hidden="true" size={21} />
          </div>
          <div>
            <p className="text-sm font-medium text-emerald-300">SANDEUL CONTROL PLANE</p>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Factory CEO 로그인</h1>
          </div>
        </div>
        <Card className="p-6">
          <form className="grid gap-5" onSubmit={(event) => void submit(event)}>
            <Field
              label="이메일 또는 관리자 ID"
              autoComplete="username"
              error={errors.loginId?.message}
              {...register("loginId")}
            />
            <Field
              label="비밀번호"
              type="password"
              autoComplete="current-password"
              error={errors.password?.message}
              {...register("password")}
            />
            {errors.root ? (
              <div
                className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300"
                role="alert"
              >
                {errors.root.message}
              </div>
            ) : null}
            <Button className="w-full" disabled={isSubmitting} type="submit">
              {isSubmitting ? "확인 중…" : "Control Center 열기"}
            </Button>
          </form>
          <div className="mt-5 flex items-start gap-2 border-t border-zinc-800 pt-5 text-xs leading-5 text-zinc-500">
            <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-zinc-600" size={15} />
            애플리케이션 인증과 Cloudflare Access를 함께 사용할 수 있습니다. 모든 로그인 시도는 감사
            기록에 남습니다.
          </div>
        </Card>
      </div>
    </main>
  );
}
