import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?:
      | "audio/mpeg"
      | "audio/wav"
      | "application/pdf"
      | "audio/mp4"
      | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ToolChoicePrimitive = "none" | "auto" | "required";
export type ToolChoiceByName = { name: string };
export type ToolChoiceExplicit = {
  type: "function";
  function: {
    name: string;
  };
};

export type ToolChoice =
  | ToolChoicePrimitive
  | ToolChoiceByName
  | ToolChoiceExplicit;

export type InvokeParams = {
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  tool_choice?: ToolChoice;
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

const ensureArray = (
  value: MessageContent | MessageContent[],
): MessageContent[] => (Array.isArray(value) ? value : [value]);

const normalizeContentPart = (
  part: MessageContent,
): TextContent | ImageContent | FileContent => {
  if (typeof part === "string") {
    return { type: "text", text: part };
  }

  if (part.type === "text") {
    return part;
  }

  if (part.type === "image_url") {
    return part;
  }

  if (part.type === "file_url") {
    return part;
  }

  throw new Error("Unsupported message content part");
};

const normalizeMessage = (message: Message) => {
  const { role, name, tool_call_id } = message;

  if (role === "tool" || role === "function") {
    const content = ensureArray(message.content)
      .map((part) => (typeof part === "string" ? part : JSON.stringify(part)))
      .join("\n");

    return {
      role,
      name,
      tool_call_id,
      content,
    };
  }

  const contentParts = ensureArray(message.content).map(normalizeContentPart);

  // If there's only text content, collapse to a single string for compatibility
  if (contentParts.length === 1 && contentParts[0].type === "text") {
    return {
      role,
      name,
      content: contentParts[0].text,
    };
  }

  return {
    role,
    name,
    content: contentParts,
  };
};

const normalizeToolChoice = (
  toolChoice: ToolChoice | undefined,
  tools: Tool[] | undefined,
): "none" | "auto" | ToolChoiceExplicit | undefined => {
  if (!toolChoice) return undefined;

  if (toolChoice === "none" || toolChoice === "auto") {
    return toolChoice;
  }

  if (toolChoice === "required") {
    if (!tools || tools.length === 0) {
      throw new Error(
        "tool_choice 'required' was provided but no tools were configured",
      );
    }

    if (tools.length > 1) {
      throw new Error(
        "tool_choice 'required' needs a single tool or specify the tool name explicitly",
      );
    }

    return {
      type: "function",
      function: { name: tools[0].function.name },
    };
  }

  if ("name" in toolChoice) {
    return {
      type: "function",
      function: { name: toolChoice.name },
    };
  }

  return toolChoice;
};

// ============================================
// AI PROVIDER CONFIGURATION
// ============================================

type AIProviderConfig = {
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  supportsJsonMode: boolean;
};

function getAIProviderConfig(): AIProviderConfig | null {
  const provider = ENV.aiProvider;

  // Groq - Free Llama API (https://console.groq.com)
  if (provider === "groq" || (provider === "fallback" && ENV.groqApiKey)) {
    if (ENV.groqApiKey) {
      return {
        name: "groq",
        baseUrl: "https://api.groq.com/openai/v1/chat/completions",
        model: "llama-3.3-70b-versatile", // Free, fast, supports JSON mode
        apiKey: ENV.groqApiKey,
        supportsJsonMode: true,
      };
    }
  }

  // Together AI - Free tier (https://together.ai)
  if (
    provider === "together" ||
    (provider === "fallback" && ENV.togetherApiKey)
  ) {
    if (ENV.togetherApiKey) {
      return {
        name: "together",
        baseUrl: "https://api.together.xyz/v1/chat/completions",
        model: "meta-llama/Llama-3.3-70B-Instruct-Turbo", // Free tier available
        apiKey: ENV.togetherApiKey,
        supportsJsonMode: true,
      };
    }
  }

  // Forge API (legacy/production)
  if (provider === "forge" || (provider === "fallback" && ENV.forgeApiKey)) {
    if (ENV.forgeApiKey) {
      return {
        name: "forge",
        baseUrl: ENV.forgeApiUrl
          ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
          : "https://forge.manus.im/v1/chat/completions",
        model: "gemini-2.5-flash",
        apiKey: ENV.forgeApiKey,
        supportsJsonMode: true,
      };
    }
  }

  return null;
}

const resolveApiUrl = () => {
  const config = getAIProviderConfig();
  if (config) return config.baseUrl;
  return ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/chat/completions`
    : "https://forge.manus.im/v1/chat/completions";
};

const assertApiKey = () => {
  if (!ENV.hasAiProvider) {
    throw new Error(
      "No AI API key configured (GROQ_API_KEY, TOGETHER_API_KEY, or BUILT_IN_FORGE_API_KEY)",
    );
  }
};

const normalizeResponseFormat = ({
  responseFormat,
  response_format,
  outputSchema,
  output_schema,
}: {
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
}):
  | { type: "json_schema"; json_schema: JsonSchema }
  | { type: "text" }
  | { type: "json_object" }
  | undefined => {
  const explicitFormat = responseFormat || response_format;
  if (explicitFormat) {
    if (
      explicitFormat.type === "json_schema" &&
      !explicitFormat.json_schema?.schema
    ) {
      throw new Error(
        "responseFormat json_schema requires a defined schema object",
      );
    }
    return explicitFormat;
  }

  const schema = outputSchema || output_schema;
  if (!schema) return undefined;

  if (!schema.name || !schema.schema) {
    throw new Error("outputSchema requires both name and schema");
  }

  return {
    type: "json_schema",
    json_schema: {
      name: schema.name,
      schema: schema.schema,
      ...(typeof schema.strict === "boolean" ? { strict: schema.strict } : {}),
    },
  };
};

// ============================================
// FALLBACK DATA FOR LOCAL DEVELOPMENT
// ============================================

const FALLBACK_MOTIONS: Record<
  string,
  Record<
    string,
    Array<{
      motion: string;
      backgroundContext: string;
      keyStakeholders: string[];
    }>
  >
> = {
  politics: {
    novice: [
      {
        motion: "This House would lower the voting age to 16",
        backgroundContext:
          "Many democracies are debating whether to extend voting rights to younger citizens. Proponents argue that 16-year-olds are mature enough to make political decisions and would increase civic engagement.",
        keyStakeholders: [
          "Young people aged 16-17",
          "Political parties",
          "Electoral commissions",
          "Parents and educators",
          "Current voters",
        ],
      },
      {
        motion: "This House would make voting mandatory",
        backgroundContext:
          "Several countries like Australia and Belgium have compulsory voting laws. Supporters claim it increases democratic legitimacy while opponents argue it infringes on personal freedom.",
        keyStakeholders: [
          "Citizens",
          "Political parties",
          "Electoral authorities",
          "Marginalized communities",
          "Courts",
        ],
      },
    ],
    intermediate: [
      {
        motion: "This House would abolish the electoral college system",
        backgroundContext:
          "The electoral college has been criticized for potentially allowing candidates to win without the popular vote. Reformers seek direct democracy while traditionalists value state representation.",
        keyStakeholders: [
          "Voters in swing states",
          "Small state residents",
          "Political campaigns",
          "State legislatures",
          "Constitutional scholars",
        ],
      },
    ],
    advanced: [
      {
        motion:
          "This House believes that liberal democracies should prioritize security over civil liberties during times of crisis",
        backgroundContext:
          "The tension between national security and individual freedoms has intensified with terrorism threats and global pandemics. Governments must balance protection with preserving democratic values.",
        keyStakeholders: [
          "Intelligence agencies",
          "Civil liberties organizations",
          "Minority communities",
          "Judiciary",
          "Media organizations",
        ],
      },
    ],
  },
  technology: {
    novice: [
      {
        motion: "This House would ban social media for children under 16",
        backgroundContext:
          "Concerns about mental health, cyberbullying, and screen addiction have prompted debates about restricting minors' access to social media platforms.",
        keyStakeholders: [
          "Children and teenagers",
          "Parents",
          "Social media companies",
          "Schools",
          "Mental health professionals",
        ],
      },
    ],
    intermediate: [
      {
        motion: "This House would require all AI systems to be explainable",
        backgroundContext:
          "As AI increasingly makes decisions affecting people's lives, calls for transparency and accountability have grown. Explainable AI could build trust but may limit innovation.",
        keyStakeholders: [
          "AI developers",
          "Consumers",
          "Regulators",
          "Healthcare providers",
          "Financial institutions",
        ],
      },
    ],
    advanced: [
      {
        motion:
          "This House believes that artificial general intelligence development should be paused until global governance frameworks are established",
        backgroundContext:
          "Rapid AI advancement has outpaced regulatory frameworks. Some experts warn of existential risks while others argue pausing would cede ground to less responsible actors.",
        keyStakeholders: [
          "AI researchers",
          "Tech companies",
          "Governments",
          "International organizations",
          "Future generations",
        ],
      },
    ],
  },
  ethics: {
    novice: [
      {
        motion:
          "This House would legalize assisted dying for terminally ill patients",
        backgroundContext:
          "Debates around end-of-life autonomy involve balancing individual choice with concerns about vulnerable patients and medical ethics.",
        keyStakeholders: [
          "Terminally ill patients",
          "Healthcare workers",
          "Families",
          "Religious organizations",
          "Disability advocates",
        ],
      },
    ],
    intermediate: [
      {
        motion:
          "This House would ban the use of animals in scientific research",
        backgroundContext:
          "Animal testing has contributed to major medical advances but raises ethical concerns about animal welfare. Alternatives are developing but may not fully replace animal models.",
        keyStakeholders: [
          "Research scientists",
          "Pharmaceutical companies",
          "Animal rights groups",
          "Patients awaiting treatments",
          "Regulatory agencies",
        ],
      },
    ],
    advanced: [
      {
        motion:
          "This House believes that genetic enhancement of future generations is morally permissible",
        backgroundContext:
          "Gene editing technologies like CRISPR could eliminate hereditary diseases but raise concerns about designer babies, inequality, and what it means to be human.",
        keyStakeholders: [
          "Future children",
          "Prospective parents",
          "Geneticists",
          "Disability communities",
          "Bioethicists",
        ],
      },
    ],
  },
  economics: {
    novice: [
      {
        motion: "This House would implement a universal basic income",
        backgroundContext:
          "UBI proposals have gained traction as automation threatens jobs. Supporters see it as a safety net while critics worry about costs and work incentives.",
        keyStakeholders: [
          "Low-income workers",
          "Employers",
          "Taxpayers",
          "Government welfare agencies",
          "Economists",
        ],
      },
    ],
    intermediate: [
      {
        motion: "This House would implement a wealth tax on billionaires",
        backgroundContext:
          "Growing wealth inequality has sparked calls for taxing accumulated wealth rather than just income. Implementation and capital flight concerns remain contentious.",
        keyStakeholders: [
          "Ultra-wealthy individuals",
          "Middle-class taxpayers",
          "Government services recipients",
          "Investment managers",
          "Tax authorities",
        ],
      },
    ],
    advanced: [
      {
        motion:
          "This House believes that developing nations should prioritize economic growth over environmental protection",
        backgroundContext:
          "Developing countries face pressure to reduce emissions while still lifting populations out of poverty. The debate involves historical responsibility and climate justice.",
        keyStakeholders: [
          "Citizens of developing nations",
          "Developed countries",
          "Multinational corporations",
          "Environmental groups",
          "Future generations",
        ],
      },
    ],
  },
  social: {
    novice: [
      {
        motion: "This House would ban homework in primary schools",
        backgroundContext:
          "Research on homework effectiveness is mixed. Critics argue it adds stress and reduces family time, while supporters believe it reinforces learning.",
        keyStakeholders: [
          "Primary school students",
          "Parents",
          "Teachers",
          "Educational researchers",
          "After-school programs",
        ],
      },
    ],
    intermediate: [
      {
        motion: "This House would implement gender quotas in corporate boards",
        backgroundContext:
          "Gender imbalance in leadership positions persists across industries. Quotas could accelerate change but raise concerns about meritocracy and tokenism.",
        keyStakeholders: [
          "Women in business",
          "Corporate shareholders",
          "Male executives",
          "HR departments",
          "Diversity advocates",
        ],
      },
    ],
    advanced: [
      {
        motion:
          "This House believes that cultural appropriation should be legally regulated",
        backgroundContext:
          "The line between cultural appreciation and appropriation is hotly contested. Legal intervention raises free speech concerns and questions about who defines cultural ownership.",
        keyStakeholders: [
          "Indigenous communities",
          "Artists and creators",
          "Fashion industry",
          "Cultural institutions",
          "Legal scholars",
        ],
      },
    ],
  },
  environment: {
    novice: [
      {
        motion: "This House would ban single-use plastics",
        backgroundContext:
          "Plastic pollution threatens marine life and ecosystems. While alternatives exist, they may be more expensive or have their own environmental impacts.",
        keyStakeholders: [
          "Consumers",
          "Packaging manufacturers",
          "Marine ecosystems",
          "Waste management companies",
          "Small businesses",
        ],
      },
    ],
    intermediate: [
      {
        motion: "This House would make ecocide an international crime",
        backgroundContext:
          "Proposals to criminalize environmental destruction at the ICC level aim to hold corporations and governments accountable for severe ecological damage.",
        keyStakeholders: [
          "Indigenous communities",
          "Multinational corporations",
          "Environmental activists",
          "International courts",
          "Developing nations",
        ],
      },
    ],
    advanced: [
      {
        motion:
          "This House believes that geoengineering is a necessary response to climate change",
        backgroundContext:
          "Solar radiation management and carbon capture technologies could cool the planet but carry unknown risks and may reduce pressure to cut emissions.",
        keyStakeholders: [
          "Climate scientists",
          "Developing nations",
          "Fossil fuel industry",
          "Future generations",
          "International governing bodies",
        ],
      },
    ],
  },
  education: {
    novice: [
      {
        motion: "This House would abolish standardized testing in schools",
        backgroundContext:
          "Standardized tests are criticized for narrowing curriculum and causing stress, but proponents argue they ensure accountability and identify struggling students.",
        keyStakeholders: [
          "Students",
          "Teachers",
          "Parents",
          "Universities",
          "Test preparation companies",
        ],
      },
    ],
    intermediate: [
      {
        motion:
          "This House would make university education free for all citizens",
        backgroundContext:
          "Rising student debt burdens graduates while limiting access to higher education. Free tuition could be funded by taxes but raises questions about resource allocation.",
        keyStakeholders: [
          "Students",
          "Universities",
          "Taxpayers",
          "Employers",
          "Trade schools",
        ],
      },
    ],
    advanced: [
      {
        motion:
          "This House believes that educational institutions should prioritize practical skills over theoretical knowledge",
        backgroundContext:
          "The relevance of traditional academic curricula is questioned as workforce needs evolve. Balancing job readiness with critical thinking development remains challenging.",
        keyStakeholders: [
          "Students",
          "Employers",
          "Academics",
          "Vocational trainers",
          "Policymakers",
        ],
      },
    ],
  },
  health: {
    novice: [
      {
        motion: "This House would ban junk food advertising to children",
        backgroundContext:
          "Childhood obesity rates are rising globally. Advertising restrictions could reduce unhealthy consumption but raise concerns about commercial speech and parental responsibility.",
        keyStakeholders: [
          "Children",
          "Parents",
          "Food manufacturers",
          "Advertisers",
          "Public health officials",
        ],
      },
    ],
    intermediate: [
      {
        motion: "This House would mandate vaccination for all children",
        backgroundContext:
          "Vaccine hesitancy threatens herd immunity against preventable diseases. Mandates could improve public health but conflict with parental rights and bodily autonomy.",
        keyStakeholders: [
          "Children",
          "Parents",
          "Healthcare workers",
          "Immunocompromised individuals",
          "Public health agencies",
        ],
      },
    ],
    advanced: [
      {
        motion:
          "This House believes that organ donation should be opt-out rather than opt-in",
        backgroundContext:
          "Organ shortages cause thousands of preventable deaths annually. Presumed consent could increase donations but raises concerns about bodily autonomy and informed consent.",
        keyStakeholders: [
          "Patients awaiting transplants",
          "Potential donors' families",
          "Medical professionals",
          "Religious communities",
          "Bioethicists",
        ],
      },
    ],
  },
};

const FALLBACK_ANALYSIS = {
  arguments: [
    {
      team: "government",
      nodeType: "argument",
      content:
        "The motion would lead to significant positive outcomes for society.",
      transcriptSegment:
        "[Analysis generated without AI - please configure OPENAI_API_KEY for detailed analysis]",
      qualityScore: 7,
      qualityExplanation:
        "This is a placeholder analysis. Configure an API key for real-time AI analysis.",
      wasAnswered: false,
      parentContent: null,
    },
    {
      team: "opposition",
      nodeType: "argument",
      content: "The motion would have unintended negative consequences.",
      transcriptSegment:
        "[Analysis generated without AI - please configure OPENAI_API_KEY for detailed analysis]",
      qualityScore: 7,
      qualityExplanation:
        "This is a placeholder analysis. Configure an API key for real-time AI analysis.",
      wasAnswered: false,
      parentContent: null,
    },
  ],
};

const FALLBACK_FEEDBACK = {
  overallAnalysis:
    "This debate covered important points on both sides. For detailed AI-powered analysis, please configure an API key in your environment variables.",
  suggestedWinner: "government" as const,
  winningReason:
    "Both teams presented strong arguments. This is a placeholder result - configure OPENAI_API_KEY for real AI judging.",
  teamFeedback: [
    {
      team: "government" as const,
      strongestArguments: [
        "Clear presentation of the case",
        "Good use of examples",
      ],
      missedResponses: [
        "Could have addressed opposition's main rebuttal more directly",
      ],
      improvements: [
        "Work on time management",
        "Strengthen logical connections between arguments",
      ],
    },
    {
      team: "opposition" as const,
      strongestArguments: [
        "Strong rebuttals",
        "Good engagement with government's case",
      ],
      missedResponses: ["Some government arguments went unchallenged"],
      improvements: [
        "Develop more constructive arguments",
        "Improve signposting",
      ],
    },
  ],
  individualFeedback: [
    {
      speakerRole: "prime_minister",
      strongestArguments: ["Set up the case clearly"],
      missedResponses: ["N/A - Opening speaker"],
      improvements: ["Consider more impactful framing"],
    },
    {
      speakerRole: "leader_of_opposition",
      strongestArguments: ["Good clash with government"],
      missedResponses: ["Could engage more with specific examples"],
      improvements: ["Develop counter-model earlier"],
    },
  ],
};

function getRandomFallbackMotion(
  topicArea: string,
  difficulty: string,
): {
  motion: string;
  backgroundContext: string;
  keyStakeholders: string[];
} {
  const topicMotions = FALLBACK_MOTIONS[topicArea] || FALLBACK_MOTIONS.politics;
  const difficultyMotions = topicMotions[difficulty] || topicMotions.novice;
  const randomIndex = Math.floor(Math.random() * difficultyMotions.length);
  return difficultyMotions[randomIndex];
}

function createFallbackResponse(jsonContent: object): InvokeResult {
  return {
    id: `fallback-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: "fallback-local",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: JSON.stringify(jsonContent),
        },
        finish_reason: "stop",
      },
    ],
  };
}

function hasApiKey(): boolean {
  return ENV.hasAiProvider;
}

// Extract topic area and difficulty from messages for fallback motion generation
function extractMotionParams(
  messages: Message[],
): { topicArea: string; difficulty: string } | null {
  for (const msg of messages) {
    const content = typeof msg.content === "string" ? msg.content : "";

    // Look for patterns like "novice level debate motion about politics"
    const topicMatch = content.match(
      /about\s+(politics|ethics|technology|economics|social|environment|education|health)/i,
    );
    const difficultyMatch = content.match(/(novice|intermediate|advanced)/i);

    if (topicMatch || difficultyMatch) {
      return {
        topicArea: topicMatch?.[1]?.toLowerCase() || "politics",
        difficulty: difficultyMatch?.[1]?.toLowerCase() || "novice",
      };
    }
  }
  return null;
}

// Determine what type of request this is based on message content
function detectRequestType(
  messages: Message[],
): "motion" | "analysis" | "feedback" | "unknown" {
  const systemContent = messages.find((m) => m.role === "system")?.content;
  const contentStr = typeof systemContent === "string" ? systemContent : "";

  if (
    contentStr.includes("debate motion") ||
    contentStr.includes("Generate a")
  ) {
    return "motion";
  }
  if (
    contentStr.includes("Analyze the debate") ||
    contentStr.includes("argument analysis")
  ) {
    return "analysis";
  }
  if (contentStr.includes("debate coach") || contentStr.includes("feedback")) {
    return "feedback";
  }
  return "unknown";
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  // If no API key, use fallback responses
  if (!hasApiKey()) {
    console.log("[LLM] No API key configured, using fallback data");

    const requestType = detectRequestType(params.messages);

    switch (requestType) {
      case "motion": {
        const motionParams = extractMotionParams(params.messages);
        const fallbackMotion = getRandomFallbackMotion(
          motionParams?.topicArea || "politics",
          motionParams?.difficulty || "novice",
        );
        return createFallbackResponse(fallbackMotion);
      }
      case "analysis":
        return createFallbackResponse(FALLBACK_ANALYSIS);
      case "feedback":
        return createFallbackResponse(FALLBACK_FEEDBACK);
      default:
        return createFallbackResponse({
          message:
            "AI features require an API key. Please configure BUILT_IN_FORGE_API_KEY in your .env file.",
          fallback: true,
        });
    }
  }

  const {
    messages,
    tools,
    toolChoice,
    tool_choice,
    outputSchema,
    output_schema,
    responseFormat,
    response_format,
  } = params;

  // Get the AI provider configuration
  const providerConfig = getAIProviderConfig();
  if (!providerConfig) {
    console.log("[LLM] No provider configured, using fallback");
    return createFallbackResponse({ message: "No AI provider configured" });
  }

  console.log(
    `[LLM] Using ${providerConfig.name} with model ${providerConfig.model}`,
  );

  const payload: Record<string, unknown> = {
    model: providerConfig.model,
    messages: messages.map(normalizeMessage),
  };

  if (tools && tools.length > 0) {
    payload.tools = tools;
  }

  const normalizedToolChoice = normalizeToolChoice(
    toolChoice || tool_choice,
    tools,
  );
  if (normalizedToolChoice) {
    payload.tool_choice = normalizedToolChoice;
  }

  // Set max tokens based on provider
  if (providerConfig.name === "groq") {
    payload.max_tokens = 8192; // Groq limit
  } else if (providerConfig.name === "together") {
    payload.max_tokens = 4096; // Together limit
  } else {
    payload.max_tokens = 32768;
    payload.thinking = {
      budget_tokens: 128,
    };
  }

  const normalizedResponseFormat = normalizeResponseFormat({
    responseFormat,
    response_format,
    outputSchema,
    output_schema,
  });

  // Handle JSON mode for different providers
  if (normalizedResponseFormat) {
    if (providerConfig.name === "groq" || providerConfig.name === "together") {
      // Groq and Together support json_object but not json_schema
      // For these providers, we'll use json_object mode and trust the model
      if (normalizedResponseFormat.type === "json_schema") {
        payload.response_format = { type: "json_object" };
      } else {
        payload.response_format = normalizedResponseFormat;
      }
    } else {
      payload.response_format = normalizedResponseFormat;
    }
  }

  const response = await fetch(providerConfig.baseUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${providerConfig.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM invoke failed (${providerConfig.name}): ${response.status} ${response.statusText} – ${errorText}`,
    );
  }

  return (await response.json()) as InvokeResult;
}
