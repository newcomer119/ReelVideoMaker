"use server";

import { db } from "~/server/db";

interface Citation {
  segmentId: string;
  start: number;
  end: number;
  text: string;
  timestamp: string;
  similarity: number;
  uploadedFileId: string;
}

interface EditPlan {
  type: string;
  description: string;
  targetClipId?: string;
  startTime: number;
  endTime: number;
  newStartTime?: number;
  newEndTime?: number;
  splitPoint?: number;
  confidence: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  query?: string;
  editPlans?: EditPlan[];
  citations?: Citation[];
  createdAt: Date;
}

/**
 * Save a chat message to the database
 */
export async function saveChatMessage(
  role: "user" | "assistant",
  content: string,
  userId: string,
  uploadedFileId?: string,
  options?: {
    query?: string;
    editPlans?: EditPlan[];
    citations?: Citation[];
  },
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const message = await (db as {
      chatMessage: {
        create: (args: {
          data: {
            role: "user" | "assistant";
            content: string;
            query?: string;
            editPlans?: unknown;
            citations?: unknown;
            userId: string;
            uploadedFileId?: string;
          };
        }) => Promise<{ id: string }>;
      };
    }).chatMessage.create({
      data: {
        role,
        content,
        query: options?.query,
        editPlans: options?.editPlans ? JSON.parse(JSON.stringify(options.editPlans)) : null,
        citations: options?.citations ? JSON.parse(JSON.stringify(options.citations)) : null,
        userId,
        ...(uploadedFileId && { uploadedFileId }),
      },
    });

    return {
      success: true,
      messageId: message.id,
    };
  } catch (error) {
    console.error("Error saving chat message:", error);
    return {
      success: false,
      error: String(error),
    };
  }
}

/**
 * Get chat history for a user, optionally filtered by uploadedFileId
 */
export async function getChatHistory(
  userId: string,
  uploadedFileId?: string,
  limit = 50,
): Promise<{
  success: boolean;
  messages: ChatMessage[];
  error?: string;
}> {
  try {
    const messages = await (db as {
      chatMessage: {
        findMany: (args: {
          where: { userId: string; uploadedFileId?: string };
          orderBy: { createdAt: "asc" };
          take: number;
          select: {
            id: true;
            role: true;
            content: true;
            query: true;
            editPlans: true;
            citations: true;
            createdAt: true;
          };
        }) => Promise<Array<{
          id: string;
          role: string;
          content: string;
          query: string | null;
          editPlans: unknown;
          citations: unknown;
          createdAt: Date;
        }>>;
      };
    }).chatMessage.findMany({
      where: {
        userId,
        ...(uploadedFileId && { uploadedFileId }),
      },
      orderBy: {
        createdAt: "asc",
      },
      take: limit,
      select: {
        id: true,
        role: true,
        content: true,
        query: true,
        editPlans: true,
        citations: true,
        createdAt: true,
      },
    });

    // Parse JSON fields
    const parsedMessages: ChatMessage[] = messages.map((msg) => ({
      id: msg.id,
      role: (msg.role === "user" || msg.role === "assistant" ? msg.role : "user") as "user" | "assistant",
      content: msg.content,
      query: msg.query ?? undefined,
      editPlans: msg.editPlans ? (typeof msg.editPlans === "string" ? JSON.parse(msg.editPlans) as EditPlan[] : msg.editPlans as EditPlan[]) : undefined,
      citations: msg.citations ? (typeof msg.citations === "string" ? JSON.parse(msg.citations) as Citation[] : msg.citations as Citation[]) : undefined,
      createdAt: msg.createdAt,
    }));

    return {
      success: true,
      messages: parsedMessages,
    };
  } catch (error) {
    console.error("Error getting chat history:", error);
    return {
      success: false,
      messages: [],
      error: String(error),
    };
  }
}

/**
 * Clear chat history for a user, optionally filtered by uploadedFileId
 */
export async function clearChatHistory(
  userId: string,
  uploadedFileId?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await (db as {
      chatMessage: {
        deleteMany: (args: {
          where: { userId: string; uploadedFileId?: string };
        }) => Promise<unknown>;
      };
    }).chatMessage.deleteMany({
      where: {
        userId,
        ...(uploadedFileId && { uploadedFileId }),
      },
    });

    return {
      success: true,
    };
  } catch (error) {
    console.error("Error clearing chat history:", error);
    return {
      success: false,
      error: String(error),
    };
  }
}

