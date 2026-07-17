import { NextRequest, NextResponse } from "next/server";

/*
 * Family-token gate (eng plan D7): every page and API route lives under
 * /f/<FAMILY_TOKEN>. A wrong token 404s here, before any handler runs —
 * there is no unguarded /api/* namespace at all.
 */
export function middleware(request: NextRequest) {
  const [, f, token] = request.nextUrl.pathname.split("/");
  if (f === "f" && token !== process.env.FAMILY_TOKEN) {
    return new NextResponse(null, { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/f/:path*",
};
