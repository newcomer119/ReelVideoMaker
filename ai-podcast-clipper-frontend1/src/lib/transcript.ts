"use server";

import { db } from "~/server/db";
import { auth } from "~/server/auth";

/**
 * Get the full transcript for a video (all segments, not just clips)
 * This is the complete transcript of the entire video from start to end
 */
export async function getFullTranscript(uploadedFileId: string) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Verify user owns this file
    const file = await db.uploadedFile.findFirst({
      where: {
        id: uploadedFileId,
        userId: session.user.id,
      },
    });

    if (!file) {
      return { success: false, error: "File not found or access denied" };
    }

    // Get the full transcript with all segments
    const transcript = await (db as {
      transcript: {
        findFirst: (args: {
          where: { uploadedFileId: string };
          include: {
            segments: {
              orderBy: { start: "asc" };
            };
          };
        }) => Promise<{
          id: string;
          uploadedFileId: string;
          segments: Array<{
            id: string;
            start: number;
            end: number;
            text: string;
            words: unknown;
          }>;
        } | null>;
      };
    }).transcript.findFirst({
      where: {
        uploadedFileId,
      },
      include: {
        segments: {
          orderBy: {
            start: "asc",
          },
        },
      },
    });

    if (!transcript) {
      return {
        success: false,
        error: "Transcript not found. Video may still be processing.",
        transcript: null,
      };
    }

    // Calculate total video duration
    const lastSegment = transcript.segments[transcript.segments.length - 1];
    const totalDuration = lastSegment?.end ?? 0;

    return {
      success: true,
      transcript: {
        id: transcript.id,
        uploadedFileId: transcript.uploadedFileId,
        totalDuration,
        segmentCount: transcript.segments.length,
        segments: transcript.segments.map((seg) => ({
          id: seg.id,
          start: seg.start,
          end: seg.end,
          text: seg.text,
          words: seg.words,
        })),
      },
    };
  } catch (error) {
    console.error("Error getting full transcript:", error);
    return {
      success: false,
      error: String(error),
      transcript: null,
    };
  }
}

/**
 * Get transcript segments within a time range
 * Useful for editing specific sections
 */
export async function getTranscriptInRange(
  uploadedFileId: string,
  startTime: number,
  endTime: number,
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return { success: false, error: "Unauthorized" };
    }

    // Verify user owns this file
    const file = await db.uploadedFile.findFirst({
      where: {
        id: uploadedFileId,
        userId: session.user.id,
      },
    });

    if (!file) {
      return { success: false, error: "File not found or access denied" };
    }

    // Get segments that overlap with the time range
    const segments = await (db as {
      transcriptSegment: {
        findMany: (args: {
          where: {
            transcript: { uploadedFileId: string };
            AND: Array<{ start?: { lte: number }; end?: { gte: number } }>;
          };
          orderBy: { start: "asc" };
        }) => Promise<Array<{
          id: string;
          start: number;
          end: number;
          text: string;
          words: unknown;
        }>>;
      };
    }).transcriptSegment.findMany({
      where: {
        transcript: {
          uploadedFileId,
        },
        AND: [
          { start: { lte: endTime } },
          { end: { gte: startTime } },
        ],
      },
      orderBy: {
        start: "asc",
      },
    });

    return {
      success: true,
      segments: segments.map((seg) => ({
        id: seg.id,
        start: seg.start,
        end: seg.end,
        text: seg.text,
        words: seg.words,
      })),
      range: {
        start: startTime,
        end: endTime,
      },
    };
  } catch (error) {
    console.error("Error getting transcript in range:", error);
    return {
      success: false,
      error: String(error),
      segments: [],
    };
  }
}

