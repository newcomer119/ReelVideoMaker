import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { chatWithTranscript } from "~/lib/chat";
import { saveChatMessage } from "~/lib/chat-history";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = (await request.json()) as {
      query?: string;
      uploadedFileId?: string;
      editPlans?: unknown;
    };
    const { query, uploadedFileId, editPlans } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 },
      );
    }

    // Save user message
    await saveChatMessage(
      "user",
      query,
      session.user.id,
      uploadedFileId ?? undefined,
      { query },
    );

    const result = await chatWithTranscript(
      query,
      uploadedFileId ?? undefined,
      session.user.id,
    );

    if (!result.success) {
      // Save error message
      await saveChatMessage(
        "assistant",
        result.error ?? "Sorry, I couldn't process your question.",
        session.user.id,
        uploadedFileId ?? undefined,
      );

      return NextResponse.json(
        { error: result.error, answer: result.answer, citations: [] },
        { status: 400 },
      );
    }

    // Save assistant message with citations and edit plans
    await saveChatMessage(
      "assistant",
      result.answer ?? "",
      session.user.id,
      uploadedFileId ?? undefined,
      {
        citations: result.citations,
        editPlans: editPlans,
      },
    );

    return NextResponse.json({
      success: true,
      answer: result.answer,
      citations: result.citations,
      query: result.query,
    });
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}


