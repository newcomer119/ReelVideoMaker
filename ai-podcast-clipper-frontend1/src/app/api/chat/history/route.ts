import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { getChatHistory, clearChatHistory } from "~/lib/chat-history";

/**
 * GET /api/chat/history?uploadedFileId=xxx
 * Get chat history for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const uploadedFileId = searchParams.get("uploadedFileId") ?? undefined;
    const limit = parseInt(searchParams.get("limit") ?? "50", 10);

    const result = await getChatHistory(session.user.id, uploadedFileId, limit);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      messages: result.messages,
    });
  } catch (error) {
    console.error("Chat history API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/chat/history?uploadedFileId=xxx
 * Clear chat history for the current user
 */
export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 },
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const uploadedFileId = searchParams.get("uploadedFileId") ?? undefined;

    const result = await clearChatHistory(session.user.id, uploadedFileId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error("Clear chat history API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

