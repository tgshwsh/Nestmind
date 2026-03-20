"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();

  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const search = typeof window !== "undefined" ? window.location.search : "";
      const params = new URLSearchParams(search);
      const next = params.get("next") ?? "/calendar";
      const code = params.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          setStatus("error");
          setErrorMessage(error.message);
          return;
        }
        setStatus("ok");
        router.replace(`/bootstrap?next=${encodeURIComponent(next)}`);
        return;
      }

      const hash = typeof window !== "undefined" ? window.location.hash : "";
      if (hash) {
        const params = new URLSearchParams(hash.replace(/^#/, ""));
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        if (access_token && refresh_token) {
          const { error } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (cancelled) return;
          if (error) {
            setStatus("error");
            setErrorMessage(error.message);
            return;
          }
          setStatus("ok");
          router.replace(`/bootstrap?next=${encodeURIComponent(next)}`);
          return;
        }
      }

      setStatus("error");
      setErrorMessage("缺少登录参数，请重新从邮箱点击链接");
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-dvh w-full items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        {status === "loading" && (
          <>
            <div className="text-lg font-medium">正在登录，请稍候…</div>
            <div className="text-sm text-muted-foreground">
              正在验证登录链接
            </div>
          </>
        )}
        {status === "error" && (
          <>
            <div className="text-lg font-medium text-destructive">登录失败</div>
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {errorMessage}
            </div>
            <a
              href="/login"
              className="inline-block rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              返回登录页
            </a>
          </>
        )}
      </div>
    </div>
  );
}
