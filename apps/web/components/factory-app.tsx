"use client";

import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "../lib/api";
import type { AuthState } from "../lib/api";
import { LoginScreen } from "./login-screen";

function FoundationReady({ auth }: { auth: AuthState }) {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <section className="max-w-2xl rounded-2xl border border-zinc-800 bg-zinc-900/80 p-8">
        <p className="text-sm font-medium text-emerald-300">CEO CONTROL CENTER</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">기반 서비스가 준비되었습니다</h1>
        <p className="mt-4 leading-7 text-zinc-400">
          {auth.user.loginId} 계정으로 안전하게 로그인했습니다. 프로젝트, PRD, 개발 작업과
          Release Gate 화면이 이 Control Center에 연결됩니다.
        </p>
      </section>
    </main>
  );
}

export function FactoryApp() {
  const [authenticated, setAuthenticated] = useState<AuthState | null>(null);
  const me = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => apiRequest<AuthState>("/auth/me"),
    retry: false,
  });
  const auth = authenticated ?? me.data;

  if (me.isPending && !auth) {
    return (
      <main className="grid min-h-screen place-items-center" aria-label="로그인 상태 확인 중">
        <LoaderCircle className="animate-spin text-emerald-400" aria-hidden="true" />
      </main>
    );
  }
  if (!auth) return <LoginScreen onLogin={setAuthenticated} />;
  return <FoundationReady auth={auth} />;
}
