"use client";

import { useState, useTransition } from "react";

import { KeyRound, Mail } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  // Avoid useSearchParams() so production prerender won't fail.
  const getNext = () => {
    if (typeof window === "undefined") return "/calendar";
    const params = new URLSearchParams(window.location.search);
    return params.get("next") ?? "/calendar";
  };

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isAnonPending, startAnonTransition] = useTransition();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const next = getNext();

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`
        : "";

    startTransition(async () => {
      if (!redirectTo) return;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      setSent(true);
    });
  }

  async function onAnonLogin() {
    setError(null);
    const next = getNext();
    startAnonTransition(async () => {
      try {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) {
          setError(error.message);
          return;
        }
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) {
          setError("无法获取登录令牌，请重试");
          return;
        }
        // bootstrap family/user then go next
        const res = await fetch("/api/bootstrap", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const text = await res.text();
          try {
            const json = JSON.parse(text) as { error?: string };
            setError(json.error ?? "bootstrap failed");
          } catch {
            setError(text || "bootstrap failed");
          }
          return;
        }
        window.location.href = next;
      } catch (e) {
        setError(e instanceof Error ? e.message : "anonymous login failed");
      }
    });
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md px-4 py-10">
      <div className="space-y-2">
        <div className="inline-flex size-10 items-center justify-center rounded-2xl border border-border/70 bg-card">
          <Mail className="size-5 text-primary" strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">登录</h1>
        <p className="text-sm text-muted-foreground">
          使用邮箱接收登录链接（Magic Link）。
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div className="space-y-2">
          <label className="text-sm font-medium">邮箱</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="you@example.com"
            required
            className={cn(
              "h-11 w-full rounded-2xl border border-input bg-background px-3 text-sm",
              "outline-none ring-offset-background",
              "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
            )}
          />
        </div>

        <Button
          type="submit"
          className="h-11 w-full rounded-2xl"
          disabled={isPending || sent}
        >
          {sent ? "已发送，请查收邮箱" : isPending ? "发送中…" : "发送登录链接"}
        </Button>

        <Button
          type="button"
          variant="outline"
          className="h-11 w-full rounded-2xl"
          disabled={isAnonPending}
          onClick={onAnonLogin}
        >
          <KeyRound className="size-4" />
          {isAnonPending ? "登录中…" : "匿名登录（开发用）"}
        </Button>

        {error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        ) : null}

        {sent ? (
          <div className="rounded-2xl border border-border/70 bg-card p-3 text-sm text-muted-foreground">
            我们已把登录链接发送到你的邮箱。打开邮件并点击链接完成登录。
          </div>
        ) : null}
      </form>
    </div>
  );
}

