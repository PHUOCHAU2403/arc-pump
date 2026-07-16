import { NextResponse, type NextRequest } from "next/server";

// Serve the agent dashboard on the agent.* subdomain (e.g. agent.arcpump.com)
// by transparently rewriting it to the /agent route. The apex domain is
// unaffected — it keeps serving the main app.
// Map product subdomains to their route. agent.arcpump.com -> /agent (the
// autonomous fleet), pay.arcpump.com -> /pay (the agent-payment rail).
const SUBDOMAINS: Record<string, string> = { "agent.": "/agent", "pay.": "/pay" };

export function proxy(req: NextRequest) {
  const host = (req.headers.get("host") || "").toLowerCase();
  const url = req.nextUrl;

  for (const [prefix, base] of Object.entries(SUBDOMAINS)) {
    if (host.startsWith(prefix) && !url.pathname.startsWith(base)) {
      url.pathname = url.pathname === "/" ? base : `${base}${url.pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Run on everything except Next internals and files with an extension.
  matcher: ["/((?!_next/|favicon.ico|.*\\..*).*)"],
};
