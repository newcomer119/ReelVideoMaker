"use server";

import { env } from "~/env";
import { db } from "~/server/db";
import { getFullTranscript } from "./transcript";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

export type EditType = "trim" | "split" | "merge" | "adjust_timing" | "remove" | "extend";

export interface EditPlan {
  type: EditType;
  description: string;
  targetClipId?: string; // If editing existing clip
  startTime: number;
  endTime: number;
  newStartTime?: number; // For adjust_timing
  newEndTime?: number; // For adjust_timing
  splitPoint?: number; // For split operation
  confidence: number; // 0-1, how confident we are about this edit
}

/**
 * Parse edit request from chat and generate edit plan
 * Example: "Trim the pause at 1:30 to 200ms" or "Cut the filler from 2:15 to 2:17"
 */
export async function planEdit(
  editRequest: string,
  uploadedFileId: string,
  _userId?: string,
): Promise<{ success: boolean; edits: EditPlan[]; error?: string }> {
  try {
    // Get full transcript for context
    const transcriptResult = await getFullTranscript(uploadedFileId);
    if (!transcriptResult.success || !transcriptResult.transcript) {
      return {
        success: false,
        edits: [],
        error: "Transcript not found. Video may still be processing.",
      };
    }

    // Get existing clips for context
    const clips = await (db as unknown as {
      clip: {
        findMany: (args: {
          where: { uploadedFileId: string };
          select: {
            id: true;
            hook: true;
            startTime: true;
            endTime: true;
            clipIndex: true;
          };
          orderBy: { clipIndex: "asc" };
        }) => Promise<Array<{
          id: string;
          hook: string | null;
          startTime: number;
          endTime: number;
          clipIndex: number;
        }>>;
      };
    }).clip.findMany({
      where: {
        uploadedFileId,
      },
      select: {
        id: true,
        hook: true,
        startTime: true,
        endTime: true,
        clipIndex: true,
      },
      orderBy: {
        clipIndex: "asc",
      },
    });

    // Use OpenAI to parse edit request and generate structured edit plan
    const tools = [
      {
        type: "function" as const,
        function: {
          name: "create_edit_plan",
          description: "Create edit plans for video content based on user request",
          parameters: {
            type: "object",
            properties: {
              edits: {
                type: "array",
                description: "List of edits to perform",
                items: {
                  type: "object",
                  properties: {
                    type: {
                      type: "string",
                      enum: ["trim", "split", "merge", "adjust_timing", "remove", "extend"],
                      description: "Type of edit operation",
                    },
                    description: {
                      type: "string",
                      description: "Human-readable description of the edit",
                    },
                    targetClipId: {
                      type: "string",
                      description: "ID of clip to edit (if editing existing clip)",
                    },
                    startTime: {
                      type: "number",
                      description: "Start time in seconds",
                    },
                    endTime: {
                      type: "number",
                      description: "End time in seconds",
                    },
                    newStartTime: {
                      type: "number",
                      description: "New start time (for adjust_timing)",
                    },
                    newEndTime: {
                      type: "number",
                      description: "New end time (for adjust_timing)",
                    },
                    splitPoint: {
                      type: "number",
                      description: "Time to split at (for split operation)",
                    },
                    confidence: {
                      type: "number",
                      description: "Confidence score 0-1",
                      minimum: 0,
                      maximum: 1,
                    },
                  },
                  required: ["type", "description", "startTime", "endTime", "confidence"],
                },
              },
            },
            required: ["edits"],
          },
        },
      },
    ];

    const transcriptSummary = `Video duration: ${transcriptResult.transcript.totalDuration.toFixed(1)}s, ${transcriptResult.transcript.segmentCount} segments`;
    
    const clipsSummary = clips.length > 0
      ? `\nExisting clips:\n${clips.map((c) => 
        `- Clip ${c.clipIndex + 1} (${c.startTime.toFixed(1)}s - ${c.endTime.toFixed(1)}s): "${c.hook ?? ""}"`
      ).join("\n")}`
      : "\nNo existing clips.";

    const systemPrompt = `You are a video editing assistant that creates precise edit plans.

IMPORTANT RULES:
- All timestamps must be within video duration (0 - ${transcriptResult.transcript.totalDuration.toFixed(1)}s)
- startTime must be < endTime
- For trim: remove content between startTime and endTime
- For split: split clip at splitPoint (must be between startTime and endTime)
- For merge: combine two clips (provide both start/end times)
- For adjust_timing: change startTime/endTime to newStartTime/newEndTime
- For remove: delete content from startTime to endTime
- For extend: add time before startTime or after endTime
- Be precise with timestamps - use exact seconds from transcript
- Confidence should reflect how clear the request is (0.5-1.0 for clear requests, 0.3-0.5 for ambiguous)`;

    const userPrompt = `Edit request: "${editRequest}"

${transcriptSummary}${clipsSummary}

Create a precise edit plan with exact timestamps.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      tools,
      tool_choice: { type: "function", function: { name: "create_edit_plan" } },
      temperature: 0.3, // Lower temperature for more precise edits
    });

    const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return {
        success: false,
        edits: [],
        error: "Could not generate edit plan from request",
      };
    }

    const editData = JSON.parse(toolCall.function.arguments) as {
      edits: Array<{
        type: string;
        description: string;
        targetClipId?: string;
        startTime: number;
        endTime: number;
        newStartTime?: number;
        newEndTime?: number;
        splitPoint?: number;
        confidence: number;
      }>;
    };
    const edits: EditPlan[] = editData.edits.map((edit) => ({
      type: edit.type as EditType,
      description: edit.description,
      targetClipId: edit.targetClipId,
      startTime: edit.startTime,
      endTime: edit.endTime,
      newStartTime: edit.newStartTime,
      newEndTime: edit.newEndTime,
      splitPoint: edit.splitPoint,
      confidence: edit.confidence ?? 0.7,
    }));

    // Validate edits and automatically find which clip they belong to
    const validEdits = edits.map((edit) => {
      // Validate timestamps
      if (!transcriptResult.transcript || edit.startTime < 0 || edit.endTime > transcriptResult.transcript.totalDuration) {
        return null;
      }
      if (edit.startTime >= edit.endTime) {
        return null;
      }

      // If targetClipId wasn't provided, find which clip contains this timestamp
      if (!edit.targetClipId && clips.length > 0) {
        // Find the clip that contains this timestamp
        const containingClip = clips.find((clip) => {
          const clipStart = clip.startTime;
          const clipEnd = clip.endTime;
          // Check if edit timestamp falls within this clip's time range
          return edit.startTime >= clipStart && edit.startTime <= clipEnd;
        });

        if (containingClip) {
          edit.targetClipId = containingClip.id;
        }
      }

      return edit;
    }).filter((edit): edit is EditPlan => edit !== null);

    return {
      success: true,
      edits: validEdits,
    };
  } catch (error) {
    console.error("Error planning edit:", error);
    return {
      success: false,
      edits: [],
      error: String(error),
    };
  }
}

/**
 * Preview an edit plan without applying it
 * Returns what the edit would do
 */
export async function previewEdit(
  editPlan: EditPlan,
  uploadedFileId: string,
): Promise<{
  success: boolean;
  preview: {
    before: { startTime: number; endTime: number; duration: number };
    after: { startTime: number; endTime: number; duration: number };
    affectedSegments: Array<{ start: number; end: number; text: string }>;
  };
  error?: string;
}> {
  try {
    const transcriptResult = await getFullTranscript(uploadedFileId);
    if (!transcriptResult.success || !transcriptResult.transcript) {
      return {
        success: false,
        preview: {
          before: { startTime: 0, endTime: 0, duration: 0 },
          after: { startTime: 0, endTime: 0, duration: 0 },
          affectedSegments: [],
        },
        error: "Transcript not found",
      };
    }

    // Get segments that would be affected
    const affectedSegments = transcriptResult.transcript.segments.filter(
      (seg) => seg.start < editPlan.endTime && seg.end > editPlan.startTime,
    );

    const before = {
      startTime: editPlan.startTime,
      endTime: editPlan.endTime,
      duration: editPlan.endTime - editPlan.startTime,
    };

    let after = before;

    // Calculate after state based on edit type
    switch (editPlan.type) {
      case "trim":
      case "remove":
        after = {
          startTime: editPlan.startTime,
          endTime: editPlan.startTime, // Content removed
          duration: 0,
        };
        break;
      case "adjust_timing":
        after = {
          startTime: editPlan.newStartTime ?? editPlan.startTime,
          endTime: editPlan.newEndTime ?? editPlan.endTime,
          duration: (editPlan.newEndTime ?? editPlan.endTime) - (editPlan.newStartTime ?? editPlan.startTime),
        };
        break;
      case "split":
        if (editPlan.splitPoint) {
          after = {
            startTime: editPlan.startTime,
            endTime: editPlan.splitPoint,
            duration: editPlan.splitPoint - editPlan.startTime,
          };
        }
        break;
      default:
        after = before;
    }

    return {
      success: true,
      preview: {
        before,
        after,
        affectedSegments: affectedSegments.map((seg) => ({
          start: seg.start,
          end: seg.end,
          text: seg.text,
        })),
      },
    };
  } catch (error) {
    console.error("Error previewing edit:", error);
    return {
      success: false,
      preview: {
        before: { startTime: 0, endTime: 0, duration: 0 },
        after: { startTime: 0, endTime: 0, duration: 0 },
        affectedSegments: [],
      },
      error: String(error),
    };
  }
}

/**
 * Apply an edit plan to create a new clip version
 * This saves the edit record and triggers video processing
 */
export async function applyEdit(
  editPlan: EditPlan,
  uploadedFileId: string,
  userId: string,
  clipId?: string,
): Promise<{
  success: boolean;
  editRecordId?: string;
  clipId?: string;
  error?: string;
}> {
  try {
    // Verify user owns the file
    const file = await db.uploadedFile.findFirst({
      where: {
        id: uploadedFileId,
        userId,
      },
    });

    if (!file) {
      return {
        success: false,
        error: "File not found or access denied",
      };
    }

    // Create edit record
    const editRecord = await (db as unknown as {
      editRecord: {
        create: (args: {
          data: {
            editType: string;
            description: string;
            startTime: number;
            endTime: number;
            newStartTime?: number;
            newEndTime?: number;
            splitPoint?: number;
            status: string;
            uploadedFileId: string;
            userId: string;
            clipId?: string;
          };
        }) => Promise<{ id: string }>;
      };
    }).editRecord.create({
      data: {
        editType: editPlan.type,
        description: editPlan.description,
        startTime: editPlan.startTime,
        endTime: editPlan.endTime,
        newStartTime: editPlan.newStartTime,
        newEndTime: editPlan.newEndTime,
        splitPoint: editPlan.splitPoint,
        status: "pending",
        uploadedFileId,
        userId,
        ...(clipId && { clipId }),
      },
    });

    // For now, we'll mark the edit as applied immediately
    // In a full implementation, this would trigger an Inngest job to process the video
    // Similar to how processVideo works
    await (db as unknown as {
      editRecord: {
        update: (args: {
          where: { id: string };
          data: {
            status: string;
            appliedAt: Date;
          };
        }) => Promise<unknown>;
      };
    }).editRecord.update({
      where: { id: editRecord.id },
      data: {
        status: "applied",
        appliedAt: new Date(),
      },
    });

    // IMPORTANT: Edits should only be applied to specific clips, not the entire video
    // If no clipId is provided, try to find the clip that contains the edit timestamp
    let targetClipId = clipId ?? editPlan.targetClipId;
    
    if (!targetClipId) {
      // Find which clip contains this timestamp
      const clips = await (db as unknown as {
        clip: {
          findMany: (args: {
            where: { uploadedFileId: string; isOriginal: boolean };
            select: { id: true; startTime: true; endTime: true };
          }) => Promise<Array<{
            id: string;
            startTime: number | null;
            endTime: number | null;
          }>>;
        };
      }).clip.findMany({
        where: {
          uploadedFileId,
          isOriginal: true, // Only look at original clips, not edited versions
        },
        select: {
          id: true,
          startTime: true,
          endTime: true,
        },
      });

      const containingClip = clips.find((clip) => {
        const clipStart = clip.startTime ?? 0;
        const clipEnd = clip.endTime ?? 999999;
        return editPlan.startTime >= clipStart && editPlan.startTime <= clipEnd;
      });

      if (containingClip) {
        targetClipId = containingClip.id;
      } else {
        return {
          success: false,
          error: "Could not find a clip containing this timestamp. Please specify which clip to edit.",
        };
      }
    }

    // If editing an existing clip, create a new version
    if (targetClipId) {
      const originalClip = await (db as unknown as {
        clip: {
          findUnique: (args: {
            where: { id: string };
          }) => Promise<{
            id: string;
            startTime: number | null;
            endTime: number | null;
            hook: string | null;
            reason: string | null;
          } | null>;
        };
      }).clip.findUnique({
        where: { id: targetClipId },
      });

      if (!originalClip) {
        return {
          success: false,
          error: "Clip not found",
        };
      }

      // Calculate new timing based on edit type
      // Note: Timestamps in editPlan are relative to the FULL video, but we need to convert them
      // to be relative to the clip's start time
      const clipStart = originalClip.startTime ?? 0;
      const clipEnd = originalClip.endTime ?? 0;
      const clipDuration = clipEnd - clipStart;

      // Convert edit timestamps from full video time to clip-relative time
      const editStartRelative = Math.max(0, editPlan.startTime - clipStart);
      const editEndRelative = Math.min(clipDuration, editPlan.endTime - clipStart);

      let newStartTime = clipStart;
      let newEndTime = clipEnd;

      switch (editPlan.type) {
        case "adjust_timing":
          newStartTime = editPlan.newStartTime ?? clipStart;
          newEndTime = editPlan.newEndTime ?? clipEnd;
          break;
        case "trim":
        case "remove":
          // Remove content between start and end within the clip
          // If edit is within clip boundaries, shorten the clip
          if (editStartRelative >= 0 && editEndRelative <= clipDuration) {
            const removedDuration = editEndRelative - editStartRelative;
            // If removing from the middle, we'll need to split or adjust
            // For now, if removing from start, move start forward
            if (editStartRelative === 0) {
              newStartTime = clipStart + removedDuration;
            } else if (editEndRelative >= clipDuration) {
              // Removing from end
              newEndTime = clipEnd - removedDuration;
            } else {
              // Removing from middle - for now, just shorten end
              newEndTime = clipEnd - removedDuration;
            }
          }
          break;
        case "split":
          if (editPlan.splitPoint && editPlan.splitPoint >= clipStart && editPlan.splitPoint <= clipEnd) {
            newEndTime = editPlan.splitPoint;
          }
          break;
        default:
          break;
      }

      // Create new clip version (edited clip)
      const newClip = await (db as unknown as {
        clip: {
          create: (args: {
            data: {
              s3Key: string;
              uploadedFileId: string;
              userId: string;
              hook: string | null;
              reason: string | null;
              startTime: number;
              endTime: number;
              viralityScore: number | null;
              clipIndex: number | null;
              isOriginal: boolean;
              originalClipId: string;
              version: number;
            };
          }) => Promise<{ id: string }>;
        };
      }).clip.create({
        data: {
          s3Key: `${file.s3Key.split('/')[0]}/edits/${editRecord.id}.mp4`, // Placeholder - will be updated when video is processed
          uploadedFileId,
          userId,
          hook: originalClip.hook,
          reason: originalClip.reason,
          startTime: newStartTime,
          endTime: newEndTime,
          viralityScore: null, // Will be updated when video is processed
          clipIndex: null, // Will be updated when video is processed
          isOriginal: false,
          originalClipId: originalClip.id,
          version: 1, // Will be updated when video is processed
        },
      });

      // Update edit record with clipId
      await (db as unknown as {
        editRecord: {
          update: (args: {
            where: { id: string };
            data: { clipId: string };
          }) => Promise<unknown>;
        };
      }).editRecord.update({
        where: { id: editRecord.id },
        data: {
          clipId: targetClipId,
        },
      });

      return {
        success: true,
        editRecordId: editRecord.id,
        clipId: newClip.id,
      };
    }

    // If no clip found, return error
    return {
      success: false,
      error: "Could not find a clip to edit. Please ensure the timestamp falls within an existing clip.",
    };
  } catch (error) {
    console.error("Error applying edit:", error);
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Get edit history for a file or clip
 */
export async function getEditHistory(
  uploadedFileId?: string,
  clipId?: string,
  userId?: string,
): Promise<{
  success: boolean;
  edits: Array<{
    id: string;
    editType: string;
    description: string;
    startTime: number;
    endTime: number;
    status: string;
    createdAt: Date;
  }>;
  error?: string;
}> {
  try {
    const edits = await (db as unknown as {
      editRecord: {
        findMany: (args: {
          where: {
            uploadedFileId?: string;
            clipId?: string;
            userId?: string;
          };
          orderBy: { createdAt: "desc" };
          select: {
            id: true;
            editType: true;
            description: true;
            startTime: true;
            endTime: true;
            status: true;
            createdAt: true;
          };
        }) => Promise<Array<{
          id: string;
          editType: string;
          description: string;
          startTime: number;
          endTime: number;
          status: string;
          createdAt: Date;
        }>>;
      };
    }).editRecord.findMany({
      where: {
        ...(uploadedFileId && { uploadedFileId }),
        ...(clipId && { clipId }),
        ...(userId && { userId }),
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        editType: true,
        description: true,
        startTime: true,
        endTime: true,
        status: true,
        createdAt: true,
      },
    });

    return {
      success: true,
      edits: edits.map((edit) => ({
        id: edit.id,
        editType: edit.editType,
        description: edit.description,
        startTime: edit.startTime,
        endTime: edit.endTime,
        status: edit.status,
        createdAt: edit.createdAt,
      })),
    };
  } catch (error) {
    console.error("Error getting edit history:", error);
    return {
      success: false,
      edits: [],
      error: String(error),
    };
  }
}

