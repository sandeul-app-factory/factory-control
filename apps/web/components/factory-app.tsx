"use client";

import { useQuery } from "@tanstack/react-query";
import { LoaderCircle } from "lucide-react";
import { useState } from "react";
import { apiRequest } from "../lib/api";
import type { AuthState } from "../lib/api";
import { LoginScreen } from "./login-screen";
import { ControlCenter } from "./control-center";

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
  return (
    <ControlCenter
      auth={auth}
      onSignedOut={() => {
        setAuthenticated(null);
        void me.refetch();
      }}
    />
  );
}
