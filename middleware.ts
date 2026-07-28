import { NextRequestWithAuth, withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default async function middleware(request: NextRequestWithAuth) {
  const isAuthRoute = request.nextUrl.pathname.startsWith("/dashboard");

  try {
    if (isAuthRoute) {
      const authResponse = withAuth({
        pages: {
          signIn: "/auth/signin",
        },
      });

      if (!authResponse) {
        return authResponse;
      }
    }

    return NextResponse.next();
  } catch (error) {
    console.error("Middleware error:", error);
    return NextResponse.redirect(new URL("/auth/signin", request.url));
  }
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/profile/:path*",
    "/api/listings/:path*",
    "/api/shared-links/:path*",
    "/protected/:path*",
  ],
};
