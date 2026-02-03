export { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";

// Check if we're in local auth mode
const isLocalAuthMode = import.meta.env.VITE_AUTH_MODE === "local";

// Generate login URL at runtime so redirect URI reflects the current origin.
export const getLoginUrl = () => {
  // For local development, use the simple local login page
  if (isLocalAuthMode || import.meta.env.DEV || import.meta.env.MODE === "development") {
    return "/login";
  }

  // For production, use OAuth
  const oauthPortalUrl = import.meta.env.VITE_OAUTH_PORTAL_URL;
  const appId = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${oauthPortalUrl}/app-auth`);
  url.searchParams.set("appId", appId);
  url.searchParams.set("redirectUri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("type", "signIn");

  return url.toString();
};
