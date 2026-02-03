/**
 * Development Authentication Routes
 * 
 * This module provides a simple login system for local development
 * that bypasses the need for an external OAuth provider.
 * 
 * IMPORTANT: This should ONLY be used in development mode!
 */
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

/**
 * Register development authentication routes
 * These routes are only available in development mode
 */
export function registerDevAuthRoutes(app: Express) {
  // Serve the dev login page
  app.get("/dev-login", (req: Request, res: Response) => {
    res.send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Development Login - DebateArena</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: system-ui, -apple-system, sans-serif;
            background: #000;
            color: #fff;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container {
            background: #fff;
            color: #000;
            padding: 3rem;
            border: 4px solid #000;
            max-width: 400px;
            width: 100%;
          }
          h1 {
            font-size: 1.5rem;
            font-weight: 900;
            text-transform: uppercase;
            letter-spacing: -0.05em;
            margin-bottom: 0.5rem;
          }
          .subtitle {
            color: #666;
            margin-bottom: 2rem;
            font-size: 0.875rem;
          }
          .warning {
            background: #fef3c7;
            border: 2px solid #f59e0b;
            padding: 1rem;
            margin-bottom: 1.5rem;
            font-size: 0.875rem;
          }
          label {
            display: block;
            font-weight: 700;
            text-transform: uppercase;
            font-size: 0.75rem;
            letter-spacing: 0.05em;
            margin-bottom: 0.5rem;
          }
          input {
            width: 100%;
            padding: 0.75rem;
            border: 3px solid #000;
            font-size: 1rem;
            margin-bottom: 1rem;
          }
          input:focus {
            outline: none;
            border-color: #3b82f6;
          }
          button {
            width: 100%;
            padding: 1rem;
            background: #000;
            color: #fff;
            border: 3px solid #000;
            font-size: 1rem;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            cursor: pointer;
            transition: all 0.2s;
          }
          button:hover {
            background: #fff;
            color: #000;
          }
          .error {
            background: #fee2e2;
            border: 2px solid #ef4444;
            padding: 1rem;
            margin-bottom: 1rem;
            color: #dc2626;
            display: none;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>[DEV LOGIN]</h1>
          <p class="subtitle">Development authentication for local testing</p>
          
          <div class="warning">
            ⚠️ This login is for development only. It creates a local user session without external OAuth.
          </div>
          
          <div class="error" id="error"></div>
          
          <form id="loginForm">
            <label for="name">Display Name</label>
            <input type="text" id="name" name="name" placeholder="Enter your name" required minlength="1" maxlength="100">
            
            <label for="email">Email (optional)</label>
            <input type="email" id="email" name="email" placeholder="your@email.com">
            
            <button type="submit">Sign In →</button>
          </form>
        </div>
        
        <script>
          document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const errorEl = document.getElementById('error');
            
            if (!name) {
              errorEl.textContent = 'Name is required';
              errorEl.style.display = 'block';
              return;
            }
            
            try {
              const res = await fetch('/api/dev-auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email: email || null })
              });
              
              if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Login failed');
              }
              
              window.location.href = '/';
            } catch (err) {
              errorEl.textContent = err.message;
              errorEl.style.display = 'block';
            }
          });
        </script>
      </body>
      </html>
    `);
  });

  // Handle dev login form submission
  app.post("/api/dev-auth/login", async (req: Request, res: Response) => {
    try {
      const { name, email } = req.body;

      if (!name || typeof name !== "string" || name.trim().length === 0) {
        res.status(400).json({ error: "Name is required" });
        return;
      }

      // Generate a unique openId for this dev user based on their name
      const openId = `dev-user-${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now().toString(36)}`;

      // Create or update the user in the database
      await db.upsertUser({
        openId,
        name: name.trim(),
        email: email || null,
        loginMethod: "dev-login",
        lastSignedIn: new Date(),
      });

      // Create a session token
      const sessionToken = await sdk.createSessionToken(openId, {
        name: name.trim(),
        expiresInMs: ONE_YEAR_MS,
      });

      // Set the session cookie
      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });

      res.json({ success: true, message: "Logged in successfully" });
    } catch (error) {
      console.error("[DevAuth] Login failed:", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  console.log("[DevAuth] Development authentication routes registered");
  console.log("[DevAuth] Visit http://localhost:3000/dev-login to sign in");
}
