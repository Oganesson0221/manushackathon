import { COOKIE_NAME } from "@shared/const";
import { z } from "zod";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";
import * as db from "./db";
import {
  generateRoomCode,
  ASIAN_PARLIAMENTARY_FORMAT,
  TOPIC_AREAS,
  DIFFICULTY_LEVELS,
  EXPERIENCE_LEVELS,
  type TopicArea,
  type DifficultyLevel,
} from "@shared/debate";
import { TRPCError } from "@trpc/server";

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // User profile management
  profile: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      return ctx.user;
    }),

    update: protectedProcedure
      .input(
        z.object({
          name: z.string().min(1).max(100).optional(),
          bio: z.string().max(500).optional(),
          experienceLevel: z
            .enum(["novice", "intermediate", "advanced", "expert"])
            .optional(),
          topicalInterests: z.array(z.string()).max(5).optional(),
          background: z.string().max(1000).optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        await db.updateUserProfile(ctx.user.id, input);
        return { success: true };
      }),

    getDebateHistory: protectedProcedure.query(async ({ ctx }) => {
      return await db.getUserDebateHistory(ctx.user.id);
    }),
  }),

  // Debate room management
  room: router({
    create: protectedProcedure
      .input(
        z.object({
          format: z
            .enum(["asian_parliamentary"])
            .default("asian_parliamentary"),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        console.log(
          "[Room] Creating room for user:",
          ctx.user.id,
          ctx.user.name,
        );
        try {
          const roomCode = generateRoomCode();
          console.log("[Room] Generated code:", roomCode);
          const roomId = await db.createDebateRoom({
            roomCode,
            creatorId: ctx.user.id,
            format: input.format,
            status: "waiting",
            currentPhase: "setup",
          });
          console.log("[Room] Created room:", roomId, roomCode);
          return { roomId, roomCode };
        } catch (error) {
          console.error("[Room] Error creating room:", error);
          throw error;
        }
      }),

    join: protectedProcedure
      .input(
        z.object({
          roomCode: z.string().length(6),
          team: z.enum(["government", "opposition"]),
          speakerRole: z.enum([
            "prime_minister",
            "deputy_prime_minister",
            "government_whip",
            "leader_of_opposition",
            "deputy_leader_of_opposition",
            "opposition_whip",
          ]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const room = await db.getDebateRoomByCode(input.roomCode);
        if (!room) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
        }
        if (room.status !== "waiting") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Room is not accepting participants",
          });
        }

        // Check if user is already in the room
        const existing = await db.getParticipantWithUser(room.id, ctx.user.id);
        if (existing) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You are already in this room",
          });
        }

        // Check if role is taken
        const participants = await db.getRoomParticipants(room.id);
        const roleTaken = participants.some(
          (p) => p.speakerRole === input.speakerRole,
        );
        if (roleTaken) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "This speaker role is already taken",
          });
        }

        // Validate team-role match
        const govRoles = [
          "prime_minister",
          "deputy_prime_minister",
          "government_whip",
        ];
        const oppRoles = [
          "leader_of_opposition",
          "deputy_leader_of_opposition",
          "opposition_whip",
        ];
        if (
          input.team === "government" &&
          !govRoles.includes(input.speakerRole)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid role for Government team",
          });
        }
        if (
          input.team === "opposition" &&
          !oppRoles.includes(input.speakerRole)
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Invalid role for Opposition team",
          });
        }

        await db.addParticipant({
          roomId: room.id,
          userId: ctx.user.id,
          team: input.team,
          speakerRole: input.speakerRole,
          isReady: false,
        });

        return { success: true, roomId: room.id };
      }),

    leave: protectedProcedure
      .input(z.object({ roomId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await db.removeParticipant(input.roomId, ctx.user.id);
        return { success: true };
      }),

    get: protectedProcedure
      .input(z.object({ roomCode: z.string() }))
      .query(async ({ input }) => {
        const room = await db.getDebateRoomByCode(input.roomCode);
        if (!room) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
        }

        const participants = await db.getRoomParticipants(room.id);
        const motion = room.motionId
          ? await db.getMotionById(room.motionId)
          : null;

        // Get user details for each participant
        const participantsWithUsers = await Promise.all(
          participants.map(async (p) => {
            const user = await db.getUserById(p.userId);
            return { ...p, user };
          }),
        );

        return { room, participants: participantsWithUsers, motion };
      }),

    getById: protectedProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        const room = await db.getDebateRoomById(input.roomId);
        if (!room) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
        }

        const participants = await db.getRoomParticipants(room.id);
        const motion = room.motionId
          ? await db.getMotionById(room.motionId)
          : null;

        const participantsWithUsers = await Promise.all(
          participants.map(async (p) => {
            const user = await db.getUserById(p.userId);
            return { ...p, user };
          }),
        );

        return { room, participants: participantsWithUsers, motion };
      }),

    setReady: protectedProcedure
      .input(z.object({ roomId: z.number(), isReady: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const participant = await db.getParticipantWithUser(
          input.roomId,
          ctx.user.id,
        );
        if (!participant) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "You are not in this room",
          });
        }
        await db.updateParticipantReady(participant.id, input.isReady);
        return { success: true };
      }),

    listActive: protectedProcedure.query(async () => {
      return await db.getActiveRooms();
    }),

    start: protectedProcedure
      .input(z.object({ roomId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const room = await db.getDebateRoomById(input.roomId);
        if (!room) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
        }
        if (room.creatorId !== ctx.user.id) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only the room creator can start the debate",
          });
        }
        if (!room.motionId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A motion must be set before starting",
          });
        }

        const participants = await db.getRoomParticipants(room.id);
        if (participants.length < 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "At least one participant must join before starting",
          });
        }

        const allReady = participants.every((p) => p.isReady);
        if (!allReady) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "All participants must be ready",
          });
        }

        // Find the first speaker who has actually joined
        const participantRoles = new Set(
          participants.map((p) => p.speakerRole),
        );
        const fullSpeakingOrder = ASIAN_PARLIAMENTARY_FORMAT.speakingOrder;
        let firstSpeakerIndex = 0;

        for (let i = 0; i < fullSpeakingOrder.length; i++) {
          const speaker = fullSpeakingOrder[i];
          const role = speaker.role;
          // For reply speeches, check if the original speaker is present
          if (role === "opposition_reply") {
            if (participantRoles.has("leader_of_opposition")) {
              firstSpeakerIndex = i;
              break;
            }
            continue;
          }
          if (role === "government_reply") {
            if (participantRoles.has("prime_minister")) {
              firstSpeakerIndex = i;
              break;
            }
            continue;
          }
          // Regular speaker roles
          if (
            participantRoles.has(
              role as (typeof participants)[number]["speakerRole"],
            )
          ) {
            firstSpeakerIndex = i;
            break;
          }
        }

        await db.updateDebateRoom(input.roomId, {
          status: "in_progress",
          currentPhase: "debate",
          currentSpeakerIndex: firstSpeakerIndex,
          startedAt: new Date(),
        });

        return { success: true };
      }),

    advanceSpeaker: protectedProcedure
      .input(z.object({ roomId: z.number() }))
      .mutation(async ({ input }) => {
        const room = await db.getDebateRoomById(input.roomId);
        if (!room) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
        }

        // Get participants to determine which speakers are present
        const participants = await db.getRoomParticipants(room.id);
        const participantRoles = new Set(
          participants.map((p) => p.speakerRole),
        );

        // Build dynamic speaking order based on who joined
        const fullSpeakingOrder = ASIAN_PARLIAMENTARY_FORMAT.speakingOrder;
        const activeSpeakingOrder = fullSpeakingOrder.filter((speaker) => {
          // For reply speeches, check if the original speaker is present
          if (speaker.role === "opposition_reply") {
            return participantRoles.has("leader_of_opposition");
          }
          if (speaker.role === "government_reply") {
            return participantRoles.has("prime_minister");
          }
          return participantRoles.has(speaker.role);
        });

        // Find current position in active order and move to next
        const currentSpeaker = fullSpeakingOrder[room.currentSpeakerIndex || 0];
        const currentActiveIndex = activeSpeakingOrder.findIndex(
          (s) => s.role === currentSpeaker?.role,
        );
        const nextActiveIndex = currentActiveIndex + 1;

        if (nextActiveIndex >= activeSpeakingOrder.length) {
          // Debate is complete
          await db.updateDebateRoom(input.roomId, {
            currentPhase: "feedback",
            status: "completed",
            endedAt: new Date(),
          });
          return { completed: true, nextSpeakerIndex: null };
        }

        // Find the index in the full speaking order for the next active speaker
        const nextSpeaker = activeSpeakingOrder[nextActiveIndex];
        const nextFullIndex = fullSpeakingOrder.findIndex(
          (s) => s.role === nextSpeaker.role,
        );

        await db.updateDebateRoom(input.roomId, {
          currentSpeakerIndex: nextFullIndex,
        });
        return { completed: false, nextSpeakerIndex: nextFullIndex };
      }),
  }),

  // Motion generation and management
  motion: router({
    generate: protectedProcedure
      .input(
        z.object({
          topicArea: z.enum([
            "politics",
            "ethics",
            "technology",
            "economics",
            "social",
            "environment",
            "education",
            "health",
          ]),
          difficulty: z.enum(["novice", "intermediate", "advanced"]),
          roomId: z.number(),
        }),
      )
      .mutation(async ({ input }) => {
        const topicLabel =
          TOPIC_AREAS.find((t) => t.id === input.topicArea)?.label ||
          input.topicArea;
        const diffLabel =
          DIFFICULTY_LEVELS.find((d) => d.id === input.difficulty)?.label ||
          input.difficulty;

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an expert debate coach who creates debate motions for competitive debating in Asian Parliamentary format. Generate motions that are:
- Clear and debatable with strong arguments on both sides
- Appropriate for the specified difficulty level
- Relevant to current issues in the topic area
- Formatted as "This House..." statements

Respond with a JSON object containing:
- motion: The debate motion starting with "This House..."
- backgroundContext: A brief 2-3 sentence explanation of the issue
- keyStakeholders: An array of 3-5 key stakeholders affected by this motion`,
            },
            {
              role: "user",
              content: `Generate a ${diffLabel} level debate motion about ${topicLabel}.`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "debate_motion",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  motion: { type: "string", description: "The debate motion" },
                  backgroundContext: {
                    type: "string",
                    description: "Brief context about the issue",
                  },
                  keyStakeholders: {
                    type: "array",
                    items: { type: "string" },
                    description: "Key stakeholders affected",
                  },
                },
                required: ["motion", "backgroundContext", "keyStakeholders"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        if (!content || typeof content !== "string") {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to generate motion",
          });
        }

        const motionData = JSON.parse(content);

        const motionId = await db.createMotion({
          motion: motionData.motion,
          topicArea: input.topicArea,
          difficulty: input.difficulty,
          backgroundContext: motionData.backgroundContext,
          keyStakeholders: motionData.keyStakeholders,
          isAiGenerated: true,
        });

        // Link motion to room
        await db.updateDebateRoom(input.roomId, { motionId });

        return {
          motionId,
          motion: motionData.motion,
          backgroundContext: motionData.backgroundContext,
          keyStakeholders: motionData.keyStakeholders,
        };
      }),

    get: protectedProcedure
      .input(z.object({ motionId: z.number() }))
      .query(async ({ input }) => {
        return await db.getMotionById(input.motionId);
      }),
  }),

  // Speech and transcription management
  speech: router({
    create: protectedProcedure
      .input(
        z.object({
          roomId: z.number(),
          speakerRole: z.string(),
          speechType: z.enum(["substantive", "reply"]),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const participant = await db.getParticipantWithUser(
          input.roomId,
          ctx.user.id,
        );
        if (!participant) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "You are not in this room",
          });
        }

        const speechId = await db.createSpeech({
          roomId: input.roomId,
          participantId: participant.id,
          speakerRole: input.speakerRole,
          speechType: input.speechType,
          startedAt: new Date(),
        });

        return { speechId };
      }),

    updateTranscript: protectedProcedure
      .input(
        z.object({
          speechId: z.number(),
          transcript: z.string(),
          audioUrl: z.string().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        await db.updateSpeech(input.speechId, {
          transcript: input.transcript,
          audioUrl: input.audioUrl,
        });
        return { success: true };
      }),

    end: protectedProcedure
      .input(
        z.object({
          speechId: z.number(),
          duration: z.number(),
        }),
      )
      .mutation(async ({ input }) => {
        await db.updateSpeech(input.speechId, {
          endedAt: new Date(),
          duration: input.duration,
        });
        return { success: true };
      }),

    getAll: protectedProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        return await db.getRoomSpeeches(input.roomId);
      }),

    transcribe: protectedProcedure
      .input(
        z.object({
          audioData: z.string(), // Base64 encoded audio
          speechId: z.number(),
          timestamp: z.number().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        // Import the direct buffer transcription helper
        const { transcribeBuffer } = await import("./_core/transcribeBuffer");

        // Decode base64 audio
        const audioBuffer = Buffer.from(input.audioData, "base64");

        // Check minimum audio size (at least 1KB for valid audio)
        if (audioBuffer.length < 1000) {
          console.log(
            "[Transcription] Audio too small:",
            audioBuffer.length,
            "bytes",
          );
          return {
            transcript: "",
            segments: [],
          };
        }

        console.log(
          "[Transcription] Processing audio directly:",
          audioBuffer.length,
          "bytes",
        );

        // Transcribe directly from buffer (bypasses S3 URL access issues)
        const result = await transcribeBuffer({
          audioBuffer,
          mimeType: "audio/webm",
          language: "en",
          prompt: "Transcribe this debate speech clearly and accurately.",
        });

        // Check if it's an error response
        if ("error" in result) {
          console.error("[Transcription] Error:", result.error, result.details);
          return {
            transcript: "",
            segments: [],
          };
        }

        // Get speech to find room ID and speaker info
        const speech = await db.getSpeechById(input.speechId);
        if (!speech) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Speech not found",
          });
        }

        // Append to existing transcript
        const existingTranscript = speech.transcript || "";
        const newTranscript = existingTranscript
          ? `${existingTranscript} ${result.text}`
          : result.text;

        await db.updateSpeech(input.speechId, {
          transcript: newTranscript,
        });

        // Save transcript segment to DB for real-time sync
        const latestSeq = await db.getLatestTranscriptSequence(speech.roomId);
        await db.createTranscriptSegment({
          roomId: speech.roomId,
          speechId: input.speechId,
          speakerRole: speech.speakerRole,
          speakerName: null, // Will be filled by client
          text: result.text,
          timestamp: input.timestamp || 0,
          sequenceNumber: latestSeq + 1,
        });

        return {
          transcript: result.text,
          segments: result.segments,
          sequenceNumber: latestSeq + 1,
        };
      }),
  }),

  // Live transcript polling for real-time sync
  transcript: router({
    // Get all transcript segments for a room (for initial load / rehydration)
    getAll: protectedProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        const segments = await db.getRoomTranscriptSegments(input.roomId);
        return { segments };
      }),

    // Poll for new segments since a given sequence number
    poll: protectedProcedure
      .input(
        z.object({
          roomId: z.number(),
          afterSequence: z.number(),
        }),
      )
      .query(async ({ input }) => {
        const segments = await db.getRoomTranscriptSegments(
          input.roomId,
          input.afterSequence,
        );
        return { segments };
      }),

    // Get the latest sequence number (for checking if there are updates)
    getLatestSequence: protectedProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        const sequence = await db.getLatestTranscriptSequence(input.roomId);
        return { sequence };
      }),
  }),

  // POI management
  poi: router({
    offer: protectedProcedure
      .input(
        z.object({
          roomId: z.number(),
          speechId: z.number(),
          timestamp: z.number(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const participant = await db.getParticipantWithUser(
          input.roomId,
          ctx.user.id,
        );
        if (!participant) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "You are not in this room",
          });
        }

        const poiId = await db.createPOI({
          roomId: input.roomId,
          speechId: input.speechId,
          offeredById: participant.id,
          timestamp: input.timestamp,
          accepted: false,
        });

        return { poiId };
      }),

    respond: protectedProcedure
      .input(
        z.object({
          poiId: z.number(),
          accepted: z.boolean(),
          content: z.string().optional(),
        }),
      )
      .mutation(async ({ input }) => {
        await db.updatePOI(input.poiId, {
          accepted: input.accepted,
          content: input.content,
        });
        return { success: true };
      }),
  }),

  // Argument analysis and mindmap
  analysis: router({
    generateMindmap: protectedProcedure
      .input(z.object({ roomId: z.number() }))
      .mutation(async ({ input }) => {
        const speeches = await db.getRoomSpeeches(input.roomId);
        const room = await db.getDebateRoomById(input.roomId);
        const motion = room?.motionId
          ? await db.getMotionById(room.motionId)
          : null;

        if (speeches.length === 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "No speeches to analyze",
          });
        }

        const transcripts = speeches
          .filter((s) => s.transcript)
          .map((s) => `[${s.speakerRole}]: ${s.transcript}`)
          .join("\n\n");

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an expert debate analyst. Analyze the debate transcript and extract key arguments, rebuttals, and their relationships.

For each argument or rebuttal, provide:
- team: "government" or "opposition"
- nodeType: "argument", "rebuttal", "extension", or "summary"
- content: A concise summary of the point (1-2 sentences)
- transcriptSegment: The relevant quote from the transcript
- qualityScore: 1-10 rating of argument quality
- qualityExplanation: Brief explanation of the score
- wasAnswered: Whether this point was addressed by the opposing team
- parentContent: If this is a rebuttal, the content of the argument it responds to (null otherwise)

Return a JSON object with an "arguments" array containing these nodes.`,
            },
            {
              role: "user",
              content: `Motion: ${motion?.motion || "Unknown"}\n\nTranscript:\n${transcripts}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "argument_analysis",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  arguments: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        team: {
                          type: "string",
                          enum: ["government", "opposition"],
                        },
                        nodeType: {
                          type: "string",
                          enum: [
                            "argument",
                            "rebuttal",
                            "extension",
                            "summary",
                          ],
                        },
                        content: { type: "string" },
                        transcriptSegment: { type: "string" },
                        qualityScore: { type: "integer" },
                        qualityExplanation: { type: "string" },
                        wasAnswered: { type: "boolean" },
                        parentContent: { type: ["string", "null"] },
                      },
                      required: [
                        "team",
                        "nodeType",
                        "content",
                        "transcriptSegment",
                        "qualityScore",
                        "qualityExplanation",
                        "wasAnswered",
                        "parentContent",
                      ],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["arguments"],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        if (!content || typeof content !== "string") {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to analyze debate",
          });
        }

        const analysisData = JSON.parse(content);

        // Store argument nodes
        const nodeIds: number[] = [];
        const nodeMap = new Map<string, number>();

        for (const arg of analysisData.arguments) {
          const parentId = arg.parentContent
            ? nodeMap.get(arg.parentContent)
            : null;

          const nodeId = await db.createArgumentNode({
            roomId: input.roomId,
            team: arg.team,
            nodeType: arg.nodeType,
            content: arg.content,
            transcriptSegment: arg.transcriptSegment,
            qualityScore: arg.qualityScore,
            qualityExplanation: arg.qualityExplanation,
            wasAnswered: arg.wasAnswered,
            parentId: parentId || undefined,
          });

          nodeIds.push(nodeId);
          nodeMap.set(arg.content, nodeId);
        }

        return { success: true, nodeCount: nodeIds.length };
      }),

    getArgumentNodes: protectedProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        return await db.getRoomArgumentNodes(input.roomId);
      }),
  }),

  // Post-debate feedback
  feedback: router({
    generate: protectedProcedure
      .input(z.object({ roomId: z.number() }))
      .mutation(async ({ input }) => {
        const speeches = await db.getRoomSpeeches(input.roomId);
        const room = await db.getDebateRoomById(input.roomId);
        const motion = room?.motionId
          ? await db.getMotionById(room.motionId)
          : null;
        const participants = await db.getRoomParticipants(input.roomId);
        const argumentNodes = await db.getRoomArgumentNodes(input.roomId);

        const transcripts = speeches
          .filter((s) => s.transcript)
          .map((s) => `[${s.speakerRole}]: ${s.transcript}`)
          .join("\n\n");

        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `You are an expert debate coach providing detailed feedback after a competitive debate. Analyze the debate and provide:

1. Overall analysis including the likely winner and why
2. Team-level feedback for both Government and Opposition
3. Individual feedback for each speaker

For each piece of feedback, identify:
- Strongest arguments made
- Missed opportunities to respond
- Specific suggestions for improvement

Return a JSON object with:
- overallAnalysis: String with debate summary
- suggestedWinner: "government" or "opposition"
- winningReason: Why this team won
- teamFeedback: Array with feedback for each team
- individualFeedback: Array with feedback for each speaker role`,
            },
            {
              role: "user",
              content: `Motion: ${motion?.motion || "Unknown"}\n\nTranscript:\n${transcripts}\n\nArgument Analysis:\n${JSON.stringify(argumentNodes.slice(0, 20))}`,
            },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "debate_feedback",
              strict: true,
              schema: {
                type: "object",
                properties: {
                  overallAnalysis: { type: "string" },
                  suggestedWinner: {
                    type: "string",
                    enum: ["government", "opposition"],
                  },
                  winningReason: { type: "string" },
                  teamFeedback: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        team: {
                          type: "string",
                          enum: ["government", "opposition"],
                        },
                        strongestArguments: {
                          type: "array",
                          items: { type: "string" },
                        },
                        missedResponses: {
                          type: "array",
                          items: { type: "string" },
                        },
                        improvements: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                      required: [
                        "team",
                        "strongestArguments",
                        "missedResponses",
                        "improvements",
                      ],
                      additionalProperties: false,
                    },
                  },
                  individualFeedback: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        speakerRole: { type: "string" },
                        strongestArguments: {
                          type: "array",
                          items: { type: "string" },
                        },
                        missedResponses: {
                          type: "array",
                          items: { type: "string" },
                        },
                        improvements: {
                          type: "array",
                          items: { type: "string" },
                        },
                      },
                      required: [
                        "speakerRole",
                        "strongestArguments",
                        "missedResponses",
                        "improvements",
                      ],
                      additionalProperties: false,
                    },
                  },
                },
                required: [
                  "overallAnalysis",
                  "suggestedWinner",
                  "winningReason",
                  "teamFeedback",
                  "individualFeedback",
                ],
                additionalProperties: false,
              },
            },
          },
        });

        const content = response.choices[0]?.message?.content;
        if (!content || typeof content !== "string") {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to generate feedback",
          });
        }

        const feedbackData = JSON.parse(content);

        // Store overall feedback
        await db.createFeedback({
          roomId: input.roomId,
          feedbackType: "overall",
          overallAnalysis: feedbackData.overallAnalysis,
          suggestedWinner: feedbackData.suggestedWinner,
          winningReason: feedbackData.winningReason,
        });

        // Store team feedback
        for (const teamFb of feedbackData.teamFeedback) {
          await db.createFeedback({
            roomId: input.roomId,
            feedbackType: "team",
            team: teamFb.team,
            strongestArguments: teamFb.strongestArguments,
            missedResponses: teamFb.missedResponses,
            improvements: teamFb.improvements,
          });
        }

        // Store individual feedback
        for (const indFb of feedbackData.individualFeedback) {
          const participant = participants.find(
            (p) => p.speakerRole === indFb.speakerRole,
          );
          if (participant) {
            await db.createFeedback({
              roomId: input.roomId,
              feedbackType: "individual",
              participantId: participant.id,
              strongestArguments: indFb.strongestArguments,
              missedResponses: indFb.missedResponses,
              improvements: indFb.improvements,
            });
          }
        }

        // Update room phase
        await db.updateDebateRoom(input.roomId, { currentPhase: "completed" });

        // Increment debate count for all participants
        for (const p of participants) {
          await db.incrementUserDebates(p.userId);
        }

        return feedbackData;
      }),

    get: protectedProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        return await db.getRoomFeedback(input.roomId);
      }),
  }),

  // Rule violations
  violation: router({
    report: protectedProcedure
      .input(
        z.object({
          roomId: z.number(),
          speechId: z.number().optional(),
          violationType: z.enum([
            "time_exceeded",
            "new_argument_in_reply",
            "poi_outside_window",
            "speaking_out_of_turn",
          ]),
          description: z.string().optional(),
          timestamp: z.number().optional(),
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const participant = await db.getParticipantWithUser(
          input.roomId,
          ctx.user.id,
        );
        if (!participant) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "You are not in this room",
          });
        }

        await db.createRuleViolation({
          roomId: input.roomId,
          speechId: input.speechId,
          participantId: participant.id,
          violationType: input.violationType,
          description: input.description,
          timestamp: input.timestamp,
        });

        return { success: true };
      }),

    getAll: protectedProcedure
      .input(z.object({ roomId: z.number() }))
      .query(async ({ input }) => {
        return await db.getRoomViolations(input.roomId);
      }),
  }),

  // Constants for frontend
  constants: router({
    getDebateFormat: publicProcedure.query(() => ASIAN_PARLIAMENTARY_FORMAT),
    getTopicAreas: publicProcedure.query(() => TOPIC_AREAS),
    getDifficultyLevels: publicProcedure.query(() => DIFFICULTY_LEVELS),
    getExperienceLevels: publicProcedure.query(() => EXPERIENCE_LEVELS),
  }),
});

export type AppRouter = typeof appRouter;
