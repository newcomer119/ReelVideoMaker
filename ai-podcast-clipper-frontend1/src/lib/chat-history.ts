"use server";

import { db } from "~/server/db";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  query?: string;
  editPlans?: any[];
  citations?: any[];
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
    editPlans?: any[];
    citations?: any[];
  },
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const message = await (db as any).chatMessage.create({
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
  limit: number = 50,
): Promise<{
  success: boolean;
  messages: ChatMessage[];
  error?: string;
}> {
  try {
    const messages = await (db as any).chatMessage.findMany({
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
    const parsedMessages: ChatMessage[] = messages.map((msg: any) => ({
      id: msg.id,
      role: msg.role as "user" | "assistant",
      content: msg.content,
      query: msg.query,
      editPlans: msg.editPlans ? (typeof msg.editPlans === "string" ? JSON.parse(msg.editPlans) : msg.editPlans) : undefined,
      citations: msg.citations ? (typeof msg.citations === "string" ? JSON.parse(msg.citations) : msg.citations) : undefined,
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
    await (db as any).chatMessage.deleteMany({
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

