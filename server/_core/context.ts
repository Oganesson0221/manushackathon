import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import * as db from "../db";

// Check if we're in local/dev mode (no auth required)
const isLocalAuthMode = process.env.AUTH_MODE === "local";

// Default dev user for local development
const DEFAULT_DEV_USER: User = {
  id: 1,
  openId: "dev_user_local",
  name: "Dev User",
  email: "dev@localhost",
  loginMethod: "local",
  role: "user",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
  bio: null,
  experienceLevel: "intermediate",
  topicalInterests: null,
  background: null,
  debatesCompleted: 0,
  profileCompleted: false,
};

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

async function ensureDevUserExists(): Promise<User> {
  // Try to get existing dev user
  let user = await db.getUserByOpenId("dev_user_local");

  if (!user) {
    // Create the dev user if it doesn't exist
    await db.upsertUser({
      openId: "dev_user_local",
      name: "Dev User",
      email: "dev@localhost",
      loginMethod: "local",
      lastSignedIn: new Date(),
    });
    user = await db.getUserByOpenId("dev_user_local");
  }

  return user || DEFAULT_DEV_USER;
}

export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<TrpcContext> {
  let user: User | null = null;

  // In local auth mode, always use a dev user (no login required)
  if (isLocalAuthMode) {
    try {
      user = await ensureDevUserExists();
    } catch (error) {
      console.error("[Auth] Failed to create dev user:", error);
      user = DEFAULT_DEV_USER;
    }

    return {
      req: opts.req,
      res: opts.res,
      user,
    };
  }

  // Production: use normal authentication
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
