"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const search =
          typeof window !== "undefined" ? window.location.search : "";
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
          const target = `/bootstrap?next=${encodeURIComponent(next)}`;
          await new Promise((r) => setTimeout(r, 100));
          if (cancelled) return;
          window.location.href = target;
          return;
        }

        const hash = typeof window !== "undefined" ? window.location.hash : "";
        if (hash) {
          const hashParams = new URLSearchParams(hash.replace(/^#/, ""));
          const access_token = hashParams.get("access_token");
          const refresh_token = hashParams.get("refresh_token");
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
            const target = `/bootstrap?next=${encodeURIComponent(next)}`;
            await new Promise((r) => setTimeout(r, 100));
            if (cancelled) return;
            window.location.href = target;
            return;
          }
        }

        setStatus("error");
        setErrorMessage("缺少登录参数，请重新从邮箱点击链接");
      } catch (e) {
        setStatus("error");
        setErrorMessage(e instanceof Error ? e.message : "登录失败");
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

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
        {status === "ok" && (
          <>
            <div className="text-lg font-medium">登录成功</div>
            <div className="text-sm text-muted-foreground">正在跳转…</div>
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
