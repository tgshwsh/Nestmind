"use client";

import { useState, useTransition } from "react";

import { KeyRound, Mail, Users } from "lucide-react";

import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function LoginPage() {
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
  const [inviteCode, setInviteCode] = useState("");
  const [showInvite, setShowInvite] = useState(false);

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
        options: { emailRedirectTo: redirectTo },
      });
      if (error) { setError(error.message); return; }
      setSent(true);
    });
  }

  async function onAnonLogin() {
    setError(null);
    const next = getNext();
    const code = inviteCode.trim().toUpperCase();

    startAnonTransition(async () => {
      try {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) { setError(error.message); return; }

        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) { setError("无法获取登录令牌，请重试"); return; }

        const body: Record<string, string> = {};
        if (code) body.invite_code = code;

        const res = await fetch("/api/bootstrap", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
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
        window.location.replace(next);
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

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">或</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {/* Anonymous login section */}
        <div className="space-y-3 rounded-2xl border border-border/70 bg-card p-4">
          <div className="flex items-start gap-3">
            <KeyRound className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">匿名登录（开发用）</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                无需邮箱，直接登录。每台设备默认创建独立家庭数据。
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowInvite((v) => !v)}
            className="flex w-full items-center gap-2 text-xs text-primary hover:underline"
          >
            <Users className="size-3.5" />
            {showInvite ? "取消加入已有家庭" : "加入已有家庭（输入邀请码共享数据）"}
          </button>

          {showInvite && (
            <div>
              <label className="text-xs font-medium text-muted-foreground">
                邀请码（6位字母数字）
              </label>
              <input
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="例如：ABC123"
                maxLength={6}
                className={cn(
                  "mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 font-mono text-sm tracking-widest",
                  "outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
                )}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                在已登录的设备上打开"里程碑"页面可查看邀请码。
              </p>
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            className="h-10 w-full rounded-xl"
            disabled={isAnonPending}
            onClick={onAnonLogin}
          >
            {isAnonPending
              ? "登录中…"
              : inviteCode.trim()
              ? "匿名登录并加入该家庭"
              : "匿名登录"}
          </Button>
        </div>

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
