/**
 * Direct buffer transcription helper - bypasses S3 URL issues
 * Sends audio buffer directly to Whisper API
 *
 * Supports multiple providers:
 * - Groq (FREE): Uses Whisper Large V3 - https://console.groq.com
 * - Forge API: Internal service
 */
import { ENV } from "./env";

export type TranscribeBufferOptions = {
  audioBuffer: Buffer;
  mimeType?: string;
  language?: string;
  prompt?: string;
};

export type WhisperSegment = {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
};

export type WhisperResponse = {
  task: "transcribe";
  language: string;
  duration: number;
  text: string;
  segments: WhisperSegment[];
};

export type TranscriptionError = {
  error: string;
  code:
    | "FILE_TOO_LARGE"
    | "INVALID_FORMAT"
    | "TRANSCRIPTION_FAILED"
    | "SERVICE_ERROR";
  details?: string;
};

// Transcription provider configuration
type TranscriptionProvider = {
  name: string;
  baseUrl: string;
  model: string;
  apiKey: string;
};

function getTranscriptionProvider(): TranscriptionProvider | null {
  // Groq - FREE Whisper API (https://console.groq.com)
  if (ENV.groqApiKey) {
    console.log("[TranscribeBuffer] Using Groq Whisper Large V3 (FREE)");
    return {
      name: "groq",
      baseUrl: "https://api.groq.com/openai/v1/audio/transcriptions",
      model: "whisper-large-v3", // Free, fast
      apiKey: ENV.groqApiKey,
    };
  }

  // Forge API (legacy)
  if (ENV.forgeApiKey && ENV.forgeApiUrl) {
    console.log("[TranscribeBuffer] Using Forge API");
    return {
      name: "forge",
      baseUrl: `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/audio/transcriptions`,
      model: "whisper-1",
      apiKey: ENV.forgeApiKey,
    };
  }

  return null;
}

/**
 * Transcribe audio buffer directly to text using Whisper API
 * This bypasses S3 URL access issues by sending the buffer directly
 */
export async function transcribeBuffer(
  options: TranscribeBufferOptions,
): Promise<WhisperResponse | TranscriptionError> {
  try {
    // Get provider
    const provider = getTranscriptionProvider();
    if (!provider) {
      return {
        error: "Transcription service not configured",
        code: "SERVICE_ERROR",
        details:
          "No transcription API key configured. Set GROQ_API_KEY for free transcription.",
      };
    }

    const { audioBuffer, mimeType = "audio/webm", language, prompt } = options;

    // Check file size (16MB limit for Groq, 25MB for others)
    const sizeMB = audioBuffer.length / (1024 * 1024);
    const maxSize = provider.name === "groq" ? 25 : 16;
    if (sizeMB > maxSize) {
      return {
        error: "Audio file exceeds maximum size limit",
        code: "FILE_TOO_LARGE",
        details: `File size is ${sizeMB.toFixed(2)}MB, maximum allowed is ${maxSize}MB`,
      };
    }

    // Minimum size check (need at least some audio data)
    if (audioBuffer.length < 1000) {
      return {
        error: "Audio file too small",
        code: "INVALID_FORMAT",
        details: `File size is ${audioBuffer.length} bytes, minimum is 1KB`,
      };
    }

    console.log(
      `[TranscribeBuffer] Processing ${audioBuffer.length} bytes of ${mimeType} with ${provider.name}`,
    );

    // Create FormData with audio buffer
    const formData = new FormData();

    // Get file extension from mime type
    const extMap: Record<string, string> = {
      "audio/webm": "webm",
      "audio/webm;codecs=opus": "webm",
      "audio/mp3": "mp3",
      "audio/mpeg": "mp3",
      "audio/wav": "wav",
      "audio/ogg": "ogg",
      "audio/mp4": "m4a",
    };
    const ext = extMap[mimeType] || "webm";
    const filename = `audio.${ext}`;

    // Create blob from buffer
    const audioBlob = new Blob([new Uint8Array(audioBuffer)], {
      type: mimeType,
    });
    formData.append("file", audioBlob, filename);
    formData.append("model", provider.model);
    formData.append("response_format", "verbose_json");

    // Add prompt
    const transcriptionPrompt =
      prompt ||
      (language
        ? `Transcribe this debate speech clearly. The speaker is using ${language}.`
        : "Transcribe this debate speech clearly and accurately.");
    formData.append("prompt", transcriptionPrompt);

    // Add language if specified
    if (language) {
      formData.append("language", language);
    }

    console.log(`[TranscribeBuffer] Calling ${provider.name} Whisper API...`);

    // Call Whisper API
    const response = await fetch(provider.baseUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${provider.apiKey}`,
        "Accept-Encoding": "identity",
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(
        `[TranscribeBuffer] ${provider.name} API error: ${response.status} ${errorText}`,
      );
      return {
        error: "Transcription service request failed",
        code: "TRANSCRIPTION_FAILED",
        details: `${response.status} ${response.statusText}${errorText ? `: ${errorText}` : ""}`,
      };
    }

    const result = (await response.json()) as WhisperResponse;

    // Validate response
    if (!result.text || typeof result.text !== "string") {
      return {
        error: "Invalid transcription response",
        code: "SERVICE_ERROR",
        details: "Whisper API returned invalid response format",
      };
    }

    console.log(
      `[TranscribeBuffer] Success with ${provider.name}! Text: "${result.text.substring(0, 100)}${result.text.length > 100 ? "..." : ""}"`,
    );
    return result;
  } catch (error) {
    console.error(`[TranscribeBuffer] Error:`, error);
    return {
      error: "Transcription failed",
      code: "SERVICE_ERROR",
      details: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
