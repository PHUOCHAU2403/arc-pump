import { NextResponse, type NextRequest } from "next/server";

// Serve the agent dashboard on the agent.* subdomain (e.g. agent.arcpump.com)
// by transparently rewriting it to the /agent route. The apex domain is
// unaffected — it keeps serving the main app.
export function proxy(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase();
  const url = req.nextUrl;

  if (host.startsWith("agent.") && !url.pathname.startsWith("/agent")) {
    url.pathname = url.pathname === "/" ? "/agent" : `/agent${url.pathname}`;
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and files with an extension.
  matcher: ["/((?!_next/|favicon.ico|.*\\..*).*)"],
};
