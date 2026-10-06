import createMiddleware from "next-intl/middleware";
import { NextRequest, NextResponse } from "next/server";
import { routing } from "./i18n/routing";

const handleI18n = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const internalLocale = request.headers.get("x-next-intl-locale");
  const isInternalFrenchRewrite =
    internalLocale === "fr" &&
    (pathname === "/fr" || pathname.startsWith("/fr/"));

  // Next.js 16 runs the proxy again on the internal rewrite `/` → `/fr`.
  // next-intl would then redirect the default locale back to `/` and loop.
  if (isInternalFrenchRewrite) {
    return NextResponse.next();
  }

  return handleI18n(request);
}

export const config = {
  matcher: "/((?!api|trpc|_next|_vercel|.*\\..*).*)",
};
