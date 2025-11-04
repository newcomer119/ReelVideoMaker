import { env } from "~/env";
import { inngest } from "./client";
import { db } from "~/server/db";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

export const processVideo = inngest.createFunction(
  {
    id: "process-video",
    retries: 1,
    concurrency: {
      limit: 1,
      key: "event.data.userId",
    },
  },
  { event: "process-video-events" },
  async ({ event, step }) => {
    const { uploadedFileId } = event.data as {
      uploadedFileId: string;
      userId: string;
    };

    try {
      const { userId, credits, s3Key } = await step.run(
        "check-credits",
        async () => {
          const uploadedFile = await db.uploadedFile.findUniqueOrThrow({
            where: {
              id: uploadedFileId,
            },
            select: {
              user: {
                select: {
                  id: true,
                  credits: true,
                },
              },
              s3Key: true,
            },
          });

          return {
            userId: uploadedFile.user.id,
            credits: uploadedFile.user.credits,
            s3Key: uploadedFile.s3Key,
          };
        },
      );

      if (credits > 0) {
        await step.run("set-status-processing", async () => {
          await db.uploadedFile.update({
            where: {
              id: uploadedFileId,
            },
            data: {
              status: "processing",
            },
          });
        });

        const processingResponse = await step.fetch(
          env.PROCESS_VIDEO_ENDPOINT,
          {
            method: "POST",
            body: JSON.stringify({ s3_key: s3Key }),
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${env.PROCESS_VIDEO_ENDPOINT_AUTH}`,
            },
          },
        );

        if (!processingResponse.ok) {
          const errorText = await processingResponse.text();
          console.error("Backend processing failed:", {
            status: processingResponse.status,
            statusText: processingResponse.statusText,
            error: errorText,
          });
          throw new Error(`Backend processing failed: ${processingResponse.status}`);
        }

        const processingDataRaw = (await processingResponse.json()) as unknown;
        console.log("Backend response keys:", Object.keys(processingDataRaw as Record<string, unknown>));
        const rawData = processingDataRaw as Record<string, unknown>;
        console.log("Has transcript in response:", !!rawData.transcript);
        console.log("Transcript segments count:", (rawData.transcript as { segments?: unknown[] } | undefined)?.segments?.length ?? 0);
        console.log("Generated videos count:", (rawData.generated_videos as unknown[] | undefined)?.length ?? 0);

        const processingData = processingDataRaw as {
          status: string;
          generated_videos: Array<{
            clip_index: number;
            start_time: number;
            end_time: number;
            hook?: string;
            reason?: string;
            virality_score?: number;
            video_url: string;
          }>;
          transcript?: {
            segments: Array<{
              start: number;
              end: number;
              text: string;
              words?: Array<{
                word: string;
                start: number;
                end: number;
                score?: number;
              }>;
            }>;
          };
        };

        // Save transcript data
        const { transcriptId } = await step.run("save-transcript", async () => {
          console.log("=== SAVE TRANSCRIPT DEBUG ===");
          console.log("Full processingData keys:", Object.keys(processingData));
          console.log("Has transcript property:", "transcript" in processingData);
          console.log("Transcript value:", processingData.transcript);
          console.log("Transcript type:", typeof processingData.transcript);
          console.log("Has segments:", !!processingData.transcript?.segments);
          console.log("Segments count:", processingData.transcript?.segments?.length ?? 0);
          console.log("First segment sample:", processingData.transcript?.segments?.[0]);
          console.log("uploadedFileId:", uploadedFileId);
          console.log("=============================");

          if (!processingData.transcript) {
            console.warn("❌ No transcript object in response");
            console.log("Available keys in processingData:", Object.keys(processingData));
            return { transcriptId: null };
          }

          if (!processingData.transcript.segments) {
            console.warn("❌ No segments property in transcript");
            console.log("Transcript object keys:", Object.keys(processingData.transcript));
            return { transcriptId: null };
          }

          if (!Array.isArray(processingData.transcript.segments)) {
            console.warn("❌ Segments is not an array:", typeof processingData.transcript.segments);
            return { transcriptId: null };
          }

          if (processingData.transcript.segments.length === 0) {
            console.warn("❌ Transcript segments array is empty");
            return { transcriptId: null };
          }

          console.log(`✅ Attempting to save ${processingData.transcript.segments.length} segments`);

          try {
            // Type assertion needed because Prisma Client types need regeneration
            // Run: npx prisma generate to fix this TypeScript error
            const transcript = await (db as unknown as {
              transcript: {
                create: (args: {
                  data: {
                    uploadedFileId: string;
                    segments: {
                      create: Array<{
                        start: number;
                        end: number;
                        text: string;
                        words: unknown;
                      }>;
                    };
                  };
                }) => Promise<{ id: string }>;
              };
            }).transcript.create({
              data: {
                uploadedFileId,
                segments: {
                  create: processingData.transcript.segments.map((segment, idx) => {
                    const segData = {
                      start: segment.start ?? 0,
                      end: segment.end ?? 0,
                      text: segment.text ?? "",
                      words: segment.words ? (JSON.parse(JSON.stringify(segment.words as unknown)) as unknown) : null,
                    };
                    if (idx === 0) {
                      console.log("First segment data:", segData);
                    }
                    return segData;
                  }),
                },
              },
            });
            console.log(`✅ Successfully saved transcript ID: ${transcript.id} with ${processingData.transcript.segments.length} segments`);
            return { transcriptId: transcript.id };
          } catch (error) {
            console.error("❌ Error saving transcript:", error);
            if (error instanceof Error) {
              console.error("Error message:", error.message);
              console.error("Error stack:", error.stack);
            }
            // Don't throw - allow processing to continue even if transcript save fails
            // This ensures clips are still created
            console.warn("⚠️ Continuing without transcript save");
            return { transcriptId: null };
          }
        });

        // Generate and store embeddings for transcript segments
        if (transcriptId && typeof transcriptId === "string") {
          await step.run("index-transcript-embeddings", async () => {
            try {
              const { indexTranscriptSegments } = await import("~/lib/vector-search");
              const result = await indexTranscriptSegments(transcriptId);
              if (result.success) {
                console.log(
                  `Indexed ${result.indexed ?? 0} transcript segments with embeddings`,
                );
              } else {
                console.warn("Failed to index embeddings:", result.error);
              }
              return result;
            } catch (error) {
              console.error("Error indexing embeddings:", error);
              // Don't fail the entire process if embeddings fail
              return { success: false, error: String(error) };
            }
          });
        } else {
          console.log("Skipping embedding generation - no transcript ID");
        }

        const { clipsFound } = await step.run(
          "create-clips-in-db",
          async () => {
            const folderPrefix = s3Key.split("/")[0]!;

            const allKeys = await listS3ObjectsByPrefix(folderPrefix);

            const clipKeys = allKeys.filter(
              (key): key is string =>
                key !== undefined &&
                !key.endsWith("original.mp4") &&
                key.includes("/clips/"),
            );

            // Match generated_videos with clip keys by extracting index from filename
            // Format: folderPrefix/clips/clip_X.mp4
            const clipsToCreate = clipKeys
              .map((clipKey) => {
                // Extract clip index from filename
                const regex = /clip_(\d+)\.mp4/;
                const match = regex.exec(clipKey);
                if (!match) return null;
                
                const clipIndex = parseInt(match[1]!, 10);
                
                // Find matching video data by clip_index
                const videoData = processingData.generated_videos?.find(
                  (v) => v.clip_index === clipIndex,
                );

                return {
                  s3Key: clipKey,
                  uploadedFileId,
                  userId,
                  clipIndex,
                  hook: videoData?.hook ?? null,
                  reason: videoData?.reason ?? null,
                  startTime: videoData?.start_time ?? null,
                  endTime: videoData?.end_time ?? null,
                  viralityScore: videoData?.virality_score ?? null,
                };
              })
              .filter((clip): clip is NonNullable<typeof clip> => clip !== null);

            if (clipsToCreate.length > 0) {
              await db.clip.createMany({
                data: clipsToCreate,
              });
            }

            return { clipsFound: clipsToCreate.length };
          },
        );

        await step.run("deduct-credits", async () => {
          await db.user.update({
            where: {
              id: userId,
            },
            data: {
              credits: {
                decrement: Math.min(credits, clipsFound),
              },
            },
          });
        });

        await step.run("set-status-processed", async () => {
          await db.uploadedFile.update({
            where: {
              id: uploadedFileId,
            },
            data: {
              status: "processed",
            },
          });
        });
      } else {
        await step.run("set-status-no-credits", async () => {
          await db.uploadedFile.update({
            where: {
              id: uploadedFileId,
            },
            data: {
              status: "no credits",
            },
          });
        });
      }
    } catch (error) {
      console.error("Error in processVideo function:", error);
      await step.run("set-status-failed", async () => {
        await db.uploadedFile.update({
          where: {
            id: uploadedFileId,
          },
          data: {
            status: "failed",
          },
        });
      });
    }
  },
);

async function listS3ObjectsByPrefix(prefix: string) {
  const s3Client = new S3Client({
    region: env.AWS_REGION,
    credentials: {
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    },
  });

  const listCommand = new ListObjectsV2Command({
    Bucket: env.S3_BUCKET_NAME,
    Prefix: prefix,
  });

  const response = await s3Client.send(listCommand);
  return response.Contents?.map((item) => item.Key).filter(Boolean) ?? [];
}