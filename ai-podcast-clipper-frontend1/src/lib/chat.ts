"use server";

import { env } from "~/env";
import { db } from "~/server/db";
import { searchTranscriptSegments } from "./vector-search";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

/**
 * Format timestamp to readable format (MM:SS)
 */
function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Chat with video transcripts - answers questions using vector search + LLM
 */
export async function chatWithTranscript(
  query: string,
  uploadedFileId?: string,
  userId?: string,
) {
  try {
    // Verify user has access to the uploaded file if provided
    if (uploadedFileId && userId) {
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
          answer: null,
          citations: [],
        };
      }
    }

    // Search for relevant transcript segments from the FULL VIDEO transcript
    // Note: This searches the entire video transcript, not just clips
    // This ensures we can edit any part of the video, not just processed clips
    const searchResults = await searchTranscriptSegments(
      query,
      uploadedFileId,
      10, // Get top 10 most relevant segments from the full transcript
    );

    if (!searchResults.success || searchResults.results.length === 0) {
      return {
        success: false,
        error: "No relevant content found in transcripts",
        answer: "I couldn't find any relevant information in the video transcripts to answer your question.",
        citations: [],
      };
    }

    // Get clip information for context
    const clips = uploadedFileId
      ? await (db as unknown as {
          clip: {
            findMany: (args: {
              where: { uploadedFileId: string };
              select: {
                id: true;
                hook: true;
                reason: true;
                startTime: true;
                endTime: true;
                clipIndex: true;
              };
              orderBy: { clipIndex: "asc" };
            }) => Promise<Array<{
              id: string;
              hook: string | null;
              reason: string | null;
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
            reason: true,
            startTime: true,
            endTime: true,
            clipIndex: true,
          },
          orderBy: {
            clipIndex: "asc",
          },
        })
      : [];

    // Prepare context for LLM
    const contextSegments = searchResults.results
      .map((result, idx) => {
        const timeRange = `${formatTimestamp(result.start)} - ${formatTimestamp(result.end)}`;
        return `[${idx + 1}] ${timeRange}: ${result.text}`;
      })
      .join("\n\n");

    const clipsContext = clips.length > 0
      ? `\n\nClips in this video:\n${clips
          .map(
            (clip) =>
              `- Clip ${clip.clipIndex + 1}: "${clip.hook ?? ""}" (${formatTimestamp(clip.startTime)} - ${formatTimestamp(clip.endTime)})`,
          )
          .join("\n")}`
      : "";

    // Check if the query is an edit request
    const editKeywords = ["trim", "cut", "remove", "delete", "split", "merge", "edit", "adjust", "change", "modify"];
    const isEditRequest = editKeywords.some((keyword) => query.toLowerCase().includes(keyword));

    // Generate answer using OpenAI
    const systemPrompt = `You are a helpful assistant that answers questions about video content based on transcript segments.

IMPORTANT:
- Always cite specific timestamps when referencing content
- Use the format [MM:SS] when mentioning times
- Be accurate and only use information from the provided context
- If the question can't be answered from the context, say so
- Format timestamps as clickable references like "(00:12 - 00:45)"
${isEditRequest ? "- If the user is asking to edit/modify the video, acknowledge the request and suggest using the edit feature" : ""}`;

    const userPrompt = `Question: ${query}

Relevant transcript segments (with timestamps):
${contextSegments}${clipsContext}

Please provide a helpful answer to the question, citing specific timestamps where relevant.${isEditRequest ? "\n\nNote: If this is an edit request, suggest that the user can use the edit feature to make changes." : ""}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    });

    const answer = completion.choices[0]?.message?.content ?? "I couldn't generate an answer.";

    // Prepare citations with timestamps
    const citations = searchResults.results
      .slice(0, 5) // Top 5 most relevant
      .map((result) => ({
        segmentId: result.segmentId,
        start: result.start,
        end: result.end,
        text: result.text,
        timestamp: formatTimestamp(result.start),
        similarity: result.similarity,
        uploadedFileId: result.uploadedFileId,
      }));

    return {
      success: true,
      answer,
      citations,
      query,
    };
  } catch (error) {
    console.error("Error in chatWithTranscript:", error);
    return {
      success: false,
      error: String(error),
      answer: null,
      citations: [],
    };
  }
}

