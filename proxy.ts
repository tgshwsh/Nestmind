import { NextResponse, type NextRequest } from "next/server";

import { createServerClient } from "@supabase/ssr";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // 刷新 session（保持登录状态）
  await supabase.auth.getUser();

  // 暂时关闭：未登录也可访问日历/记事/我的（等邮件登录配好后再打开）
  // const { pathname } = request.nextUrl;
  // const isTabs = pathname === "/calendar" || pathname.startsWith("/calendar/")
  //   || pathname === "/notes" || pathname.startsWith("/notes/")
  //   || pathname === "/me" || pathname.startsWith("/me/");
  // if (isTabs && !user) {
  //   const redirectUrl = request.nextUrl.clone();
  //   redirectUrl.pathname = "/login";
  //   redirectUrl.searchParams.set("next", pathname);
  //   return NextResponse.redirect(redirectUrl);
  // }

  return response;
}

export const config = {
  matcher: ["/calendar/:path*", "/notes/:path*", "/me/:path*"],
};
