"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let redirected = false;

    function doRedirect() {
      if (redirected) return;
      redirected = true;
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next") ?? "/calendar";
      const code = params.get("code");
      // Preserve invite code if present in original next param
      const target = `/bootstrap?next=${encodeURIComponent(next)}${code ? "" : ""}`;
      setStatus("ok");
      setTimeout(() => {
        window.location.replace(target);
      }, 150);
    }

    // 1. Listen for SIGNED_IN — works for both hash-flow (auto-processed by SDK)
    //    and PKCE code-exchange flow.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
          doRedirect();
        }
      }
    );

    // 2. Check if already signed in (Supabase may have auto-processed the hash
    //    before this component mounted).
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        doRedirect();
        return;
      }

      // 3. Manually exchange PKCE code if present in URL.
      const code = new URLSearchParams(window.location.search).get("code");
      if (code) {
        supabase.auth
          .exchangeCodeForSession(code)
          .then(({ error }) => {
            if (error) {
              setStatus("error");
              setErrorMessage(error.message);
            }
            // onAuthStateChange SIGNED_IN will fire and call doRedirect
          });
        return;
      }

      // 4. Hash-based tokens (legacy implicit flow) — try setSession manually
      //    in case the SDK didn't auto-process them.
      const hash = window.location.hash;
      if (hash) {
        const hp = new URLSearchParams(hash.replace(/^#/, ""));
        const access_token = hp.get("access_token");
        const refresh_token = hp.get("refresh_token");
        if (access_token && refresh_token) {
          supabase.auth
            .setSession({ access_token, refresh_token })
            .then(({ error }) => {
              if (error) {
                setStatus("error");
                setErrorMessage(error.message);
              }
            });
          return;
        }
      }

      // 5. Nothing found — show error after a short wait in case SDK is still
      //    processing asynchronously.
      setTimeout(() => {
        if (!redirected) {
          setStatus("error");
          setErrorMessage("缺少登录参数，请重新从邮箱点击链接");
        }
      }, 3000);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <div className="flex min-h-dvh w-full items-center justify-center px-4">
      <div className="w-full max-w-md space-y-4 text-center">
        {status === "loading" && (
          <>
            <div className="text-lg font-medium">正在登录，请稍候…</div>
            <div className="text-sm text-muted-foreground">正在验证登录链接</div>
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
