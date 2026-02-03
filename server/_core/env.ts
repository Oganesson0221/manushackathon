export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  oAuthServerUrl: process.env.OAUTH_SERVER_URL ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",

  // Legacy Forge API (for backwards compatibility)
  forgeApiUrl: (process.env.BUILT_IN_FORGE_API_URL ?? "").trim(),
  forgeApiKey: (process.env.BUILT_IN_FORGE_API_KEY ?? "").trim(),

  // Free AI Provider Options
  // Groq - Free Llama & Whisper API (https://console.groq.com)
  groqApiKey: (process.env.GROQ_API_KEY ?? "").trim(),

  // Together AI - Free tier available (https://together.ai)
  togetherApiKey: (process.env.TOGETHER_API_KEY ?? "").trim(),

  // AI Provider selection: 'groq' | 'together' | 'forge' | 'fallback'
  aiProvider: (process.env.AI_PROVIDER ?? "fallback").trim(),

  // Get the active LLM API key based on provider
  get llmApiKey(): string {
    switch (this.aiProvider) {
      case "groq":
        return this.groqApiKey;
      case "together":
        return this.togetherApiKey;
      case "forge":
        return this.forgeApiKey;
      default:
        return this.groqApiKey || this.togetherApiKey || this.forgeApiKey || "";
    }
  },

  // Check if any AI provider is configured
  get hasAiProvider(): boolean {
    return Boolean(this.groqApiKey || this.togetherApiKey || this.forgeApiKey);
  },
};
