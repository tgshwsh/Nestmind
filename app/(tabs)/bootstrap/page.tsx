"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export default function BootstrapPage() {
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // Avoid useSearchParams() so production prerender won't fail.
      const params = new URLSearchParams(window.location.search);
      const next = params.get("next") ?? "/calendar";

      setLoading(true);
      setError(null);

      const res = await fetch("/api/bootstrap", { method: "POST" });
      const json = (await res.json()) as { ok?: boolean; error?: string };

      if (cancelled) return;

      if (!res.ok || !json.ok) {
        setError(json.error ?? "bootstrap failed");
        setLoading(false);
        return;
      }

      router.replace(next);
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="mx-auto min-h-dvh w-full max-w-md px-4 py-10">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">初始化中…</h1>
        <p className="text-sm text-muted-foreground">
          正在为你的账号创建家庭与用户信息。
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-border/70 bg-card p-4 text-sm">
        {loading ? "请稍等 1-2 秒…" : "初始化完成。"}
      </div>

      {error ? (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
          <Button
            className="w-full rounded-2xl"
            onClick={() => window.location.reload()}
          >
            重试
          </Button>
        </div>
      ) : null}
    </div>
  );
}

