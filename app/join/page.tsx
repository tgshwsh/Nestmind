"use client";

import { useEffect, useState, useTransition } from "react";

import { Mail, Users } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function JoinPage() {
  const [urlCode, setUrlCode] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get("code") ?? "";
    setUrlCode(c || null);
  }, []);

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const inviteCode = (urlCode || code.trim().toUpperCase()) || "";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const finalCode = inviteCode;
    if (!finalCode) {
      setError("请输入邀请码");
      return;
    }

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/auth/callback?next=${encodeURIComponent(
            `/bootstrap?next=/calendar&code=${encodeURIComponent(finalCode)}`
          )}`
        : "";

    startTransition(async () => {
      if (!redirectTo) return;
      const { error: err } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });

      if (err) {
        setError(err.message);
        return;
      }

      setSent(true);
    });
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md px-4 py-10">
      <div className="space-y-2">
        <div className="inline-flex size-10 items-center justify-center rounded-2xl border border-border/70 bg-card">
          <Users className="size-5 text-primary" strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">加入家庭</h1>
        <p className="text-sm text-muted-foreground">
          使用邀请码加入家人的 NestMind 家庭，共同管理宝宝的日程与成长记录。
        </p>
      </div>

      <div className="mt-8 space-y-4">
        {!urlCode ? (
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <label className="text-sm font-medium">邀请码</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="请输入 6 位邀请码"
              maxLength={6}
              className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <div className="text-sm font-medium">邀请码</div>
            <div className="mt-1 font-mono text-lg text-primary">{inviteCode}</div>
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-3">
          <div className="rounded-2xl border border-border/70 bg-card p-4">
            <label className="text-sm font-medium">你的邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="用于接收登录链接"
              required
              className="mt-2 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {sent ? (
            <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4 text-sm text-primary">
              <Mail className="mb-2 inline-block size-5" />
              <p>登录链接已发送到你的邮箱，请查收并点击链接完成加入。</p>
            </div>
          ) : (
            <Button
              type="submit"
              disabled={isPending || !email.trim()}
              className={cn("w-full rounded-2xl", isPending && "opacity-70")}
            >
              {isPending ? "发送中…" : "发送登录链接"}
            </Button>
          )}
        </form>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        <a href="/login" className="underline hover:text-foreground">
          已有账号？直接登录
        </a>
      </p>
    </div>
  );
}
