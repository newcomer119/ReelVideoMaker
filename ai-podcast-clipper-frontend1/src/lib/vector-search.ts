"use server";

import { db } from "~/server/db";
import { generateEmbeddingsBatch } from "./embeddings";

/**
 * Generate and store embeddings for transcript segments
 */
export async function indexTranscriptSegments(transcriptId: string) {
  try {
    // Get all segments for this transcript
    // Type assertion needed because Prisma Client types need regeneration
    const segments = await (db as {
      transcriptSegment: {
        findMany: (args: {
          where: { transcriptId: string };
          select: { id: true; text: true };
        }) => Promise<Array<{ id: string; text: string }>>;
      };
    }).transcriptSegment.findMany({
      where: { transcriptId },
      select: {
        id: true,
        text: true,
      },
    });

    if (segments.length === 0) {
      return { success: false, error: "No segments found" };
    }

    // Generate embeddings in batches (OpenAI supports up to 2048 texts per batch)
    const batchSize = 100;
    const texts = segments.map((s) => s.text);

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const embeddings = await generateEmbeddingsBatch(batch);

        // Update each segment with its embedding as JSON array
        for (let j = 0; j < batch.length; j++) {
          const segmentIndex = i + j;
          const embedding = embeddings[j];
          const segmentId = segments[segmentIndex]!.id;

          // Store embedding as JSON array (no pgvector needed)
          await (db as {
            transcriptSegment: {
              update: (args: {
                where: { id: string };
                data: { embedding: number[] };
              }) => Promise<unknown>;
            };
          }).transcriptSegment.update({
            where: { id: segmentId },
            data: { embedding: embedding },
          });
        }
    }

    return { success: true, indexed: segments.length };
  } catch (error) {
    console.error("Error indexing transcript segments:", error);
    return { success: false, error: String(error) };
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Search transcript segments using vector similarity (JSON-based, no pgvector needed)
 * @param query - Search query text
 * @param uploadedFileId - Optional: filter by uploaded file
 * @param limit - Number of results to return
 * @returns Array of matching segments with similarity scores
 */
export async function searchTranscriptSegments(
  query: string,
  uploadedFileId?: string,
  limit = 10,
) {
  try {
    // Generate embedding for the search query
    const { generateEmbedding } = await import("./embeddings");
    const queryEmbedding = await generateEmbedding(query);

    // Get ALL transcript segments from the FULL VIDEO transcript (not just clips)
    // This ensures we can search and edit any part of the video, not just processed clips
    const segments = await (db as {
      transcriptSegment: {
        findMany: (args: {
          where: {
            embedding: { not: null };
            transcript?: { uploadedFileId: string };
          };
          include: {
            transcript: {
              select: { uploadedFileId: true };
            };
          };
        }) => Promise<Array<{
          id: string;
          start: number;
          end: number;
          text: string;
          transcriptId: string;
          embedding: number[] | null;
          transcript: { uploadedFileId: string };
        }>>;
      };
    }).transcriptSegment.findMany({
      where: {
        embedding: { not: null }, // Only segments that have been indexed
        ...(uploadedFileId && {
          transcript: {
            uploadedFileId,
          },
        }),
      },
      include: {
        transcript: {
          select: {
            uploadedFileId: true,
          },
        },
      },
    });

    // Calculate similarity scores
    interface SearchResult {
      segmentId: string;
      start: number;
      end: number;
      text: string;
      transcriptId: string;
      uploadedFileId: string;
      similarity: number;
    }
    
    const results: SearchResult[] = segments
      .map((segment) => {
        const embedding = segment.embedding;
        if (!embedding || !Array.isArray(embedding)) {
          return null;
        }

        const similarity = cosineSimilarity(queryEmbedding, embedding);

        return {
          segmentId: segment.id,
          start: segment.start,
          end: segment.end,
          text: segment.text,
          transcriptId: segment.transcriptId,
          uploadedFileId: segment.transcript.uploadedFileId,
          similarity,
        };
      })
      .filter(
        (r): r is SearchResult => r !== null && r.similarity > 0,
      )
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);

    return {
      success: true,
      results,
    };
  } catch (error) {
    console.error("Error searching transcript segments:", error);
    return {
      success: false,
      error: String(error),
      results: [],
    };
  }
}

