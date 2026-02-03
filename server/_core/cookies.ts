import type { CookieOptions, Request } from "express";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function isIpAddress(host: string) {
  // Basic IPv4 check and IPv6 presence detection.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  return host.includes(":");
}

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some((proto) => proto.trim().toLowerCase() === "https");
}

function isLocalhost(req: Request) {
  const hostname = req.hostname || req.headers.host?.split(":")[0] || "";
  return LOCAL_HOSTS.has(hostname);
}

export function getSessionCookieOptions(
  req: Request,
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  const isSecure = isSecureRequest(req);
  const isLocal = isLocalhost(req);

  // For localhost development: use sameSite: "lax" and secure: false
  // This allows cookies to work on HTTP localhost
  if (isLocal && !isSecure) {
    return {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: false,
    };
  }

  // For production: use sameSite: "none" with secure: true
  return {
    httpOnly: true,
    path: "/",
    sameSite: "none",
    secure: true,
  };
}
