import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { chatWithTranscript } from "~/lib/chat";

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { query, uploadedFileId } = body;

    if (!query || typeof query !== "string") {
      return NextResponse.json(
        { error: "Query is required" },
        { status: 400 },
      );
    }

    const result = await chatWithTranscript(
      query,
      uploadedFileId,
      session.user.id,
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error, answer: result.answer, citations: [] },
        { status: 400 },
      );
    }

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

