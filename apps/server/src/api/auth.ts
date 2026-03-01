import type { FastifyReply, FastifyRequest } from "fastify";
import { ERROR_CODES } from "@agent-review/shared";
import { AppError } from "../util/errors.js";

export function shouldRequireAuth(path: string): boolean {
  if (path.startsWith("/api/health")) {
    return false;
  }

  return path.startsWith("/api/") || path === "/mcp";
}

export async function enforceBasicAuth(
  request: FastifyRequest,
  reply: FastifyReply,
  adminPassword?: string
): Promise<void> {
  if (!adminPassword) {
    return;
  }

  const path = request.url.split("?")[0] ?? request.url;
  if (!shouldRequireAuth(path)) {
    return;
  }

  const authorization = request.headers.authorization;
  if (!authorization) {
    reply.header("WWW-Authenticate", 'Basic realm="review-gateway"');
    throw new AppError(ERROR_CODES.UNAUTHORIZED, "Missing Authorization header", 401);
  }

  const credentials = parseBasicAuth(authorization);
  if (!credentials || credentials.username !== "admin" || credentials.password !== adminPassword) {
    reply.header("WWW-Authenticate", 'Basic realm="review-gateway"');
    throw new AppError(ERROR_CODES.UNAUTHORIZED, "Invalid credentials", 401);
  }
}

function parseBasicAuth(header: string): { username: string; password: string } | null {
  const [scheme, encoded] = header.split(" ");
  if (!scheme || !encoded || scheme.toLowerCase() !== "basic") {
    return null;
  }

  try {
    const decoded = Buffer.from(encoded, "base64").toString("utf8");
    const index = decoded.indexOf(":");
    if (index < 0) {
      return null;
    }

    return {
      username: decoded.slice(0, index),
      password: decoded.slice(index + 1)
    };
  } catch {
    return null;
  }
}
