import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { randomUUID } from "crypto";

function getQueryParam(req: Request, key: string): string | undefined {
  const value = req.query[key];
  return typeof value === "string" ? value : undefined;
}

// Check if we're in local auth mode
const isLocalAuthMode = process.env.AUTH_MODE === "local";

export function registerOAuthRoutes(app: Express) {
  // ============================================
  // LOCAL AUTHENTICATION ROUTES (for development)
  // ============================================

  if (isLocalAuthMode) {
    console.log("[Auth] Running in LOCAL AUTH MODE - OAuth disabled");

    // Serve a simple login page
    app.get("/login", (req: Request, res: Response) => {
      res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Login - Debate Arena</title>
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              padding: 20px;
            }
            .container {
              background: white;
              padding: 40px;
              border-radius: 16px;
              box-shadow: 0 20px 60px rgba(0,0,0,0.3);
              width: 100%;
              max-width: 400px;
            }
            h1 { 
              text-align: center; 
              margin-bottom: 30px; 
              color: #333;
              font-size: 28px;
            }
            .subtitle {
              text-align: center;
              color: #666;
              margin-bottom: 30px;
              font-size: 14px;
            }
            form { display: flex; flex-direction: column; gap: 20px; }
            label { 
              font-weight: 600; 
              color: #333;
              font-size: 14px;
            }
            input { 
              width: 100%; 
              padding: 14px 16px; 
              border: 2px solid #e0e0e0; 
              border-radius: 10px; 
              font-size: 16px;
              transition: border-color 0.2s, box-shadow 0.2s;
              margin-top: 6px;
            }
            input:focus {
              outline: none;
              border-color: #667eea;
              box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
            }
            button { 
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white; 
              padding: 16px; 
              border: none; 
              border-radius: 10px; 
              cursor: pointer;
              font-size: 16px;
              font-weight: 600;
              transition: transform 0.2s, box-shadow 0.2s;
              margin-top: 10px;
            }
            button:hover { 
              transform: translateY(-2px);
              box-shadow: 0 6px 20px rgba(102, 126, 234, 0.4);
            }
            button:active {
              transform: translateY(0);
            }
            .divider {
              text-align: center;
              color: #999;
              font-size: 12px;
              margin: 10px 0;
            }
            .note {
              text-align: center;
              color: #888;
              font-size: 12px;
              margin-top: 20px;
              padding-top: 20px;
              border-top: 1px solid #eee;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>🎭 Debate Arena</h1>
            <p class="subtitle">Local Development Login</p>
            <form action="/api/auth/local/login" method="POST">
              <div>
                <label>Display Name</label>
                <input type="text" name="name" placeholder="Enter your name" required minlength="2" maxlength="50">
              </div>
              <div>
                <label>Email (optional)</label>
                <input type="email" name="email" placeholder="your@email.com">
              </div>
              <button type="submit">Sign In & Start Debating</button>
            </form>
            <p class="note">🔧 Development mode - No external OAuth required</p>
          </div>
        </body>
        </html>
      `);
    });

    // Handle local login
    app.post("/api/auth/local/login", async (req: Request, res: Response) => {
      try {
        const { name, email } = req.body;

        if (!name || typeof name !== "string" || name.trim().length < 2) {
          res
            .status(400)
            .json({ error: "Name is required (min 2 characters)" });
          return;
        }

        const trimmedName = name.trim();
        const trimmedEmail = email?.trim() || null;

        // Generate a unique openId for local users
        const openId = `local_${randomUUID()}`;

        // Create or update user in database
        await db.upsertUser({
          openId,
          name: trimmedName,
          email: trimmedEmail,
          loginMethod: "local",
          lastSignedIn: new Date(),
        });

        // Create session token
        const sessionToken = await sdk.createSessionToken(openId, {
          name: trimmedName,
          expiresInMs: ONE_YEAR_MS,
        });

        const cookieOptions = getSessionCookieOptions(req);
        res.cookie(COOKIE_NAME, sessionToken, {
          ...cookieOptions,
          maxAge: ONE_YEAR_MS,
        });

        console.log(`[Auth] Local login successful for: ${trimmedName}`);
        res.redirect(302, "/");
      } catch (error) {
        console.error("[Auth] Local login failed", error);
        res.status(500).json({ error: "Login failed" });
      }
    });

    // Quick login API (for programmatic access)
    app.post(
      "/api/auth/local/quick-login",
      async (req: Request, res: Response) => {
        try {
          const { name = "Dev User", email } = req.body;
          const openId = `local_${randomUUID()}`;

          await db.upsertUser({
            openId,
            name,
            email: email || null,
            loginMethod: "local",
            lastSignedIn: new Date(),
          });

          const sessionToken = await sdk.createSessionToken(openId, {
            name,
            expiresInMs: ONE_YEAR_MS,
          });

          const cookieOptions = getSessionCookieOptions(req);
          res.cookie(COOKIE_NAME, sessionToken, {
            ...cookieOptions,
            maxAge: ONE_YEAR_MS,
          });

          res.json({ success: true, user: { name, email } });
        } catch (error) {
          console.error("[Auth] Quick login failed", error);
          res.status(500).json({ error: "Login failed" });
        }
      },
    );
  }

  // ============================================
  // STANDARD OAUTH CALLBACK (for production)
  // ============================================

  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    // In local mode, redirect to local login
    if (isLocalAuthMode) {
      res.redirect(302, "/login");
      return;
    }

    const code = getQueryParam(req, "code");
    const state = getQueryParam(req, "state");

    if (!code || !state) {
      res.status(400).json({ error: "code and state are required" });
      return;
    }

    try {
      const tokenResponse = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(tokenResponse.accessToken);

      if (!userInfo.openId) {
        res.status(400).json({ error: "openId missing from user info" });
        return;
      }

      await db.upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.createSessionToken(userInfo.openId, {
        name: userInfo.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
