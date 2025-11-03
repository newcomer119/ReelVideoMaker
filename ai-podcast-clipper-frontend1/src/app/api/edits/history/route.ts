import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { getEditHistory } from "~/lib/edits";

/**
 * GET /api/edits/history?uploadedFileId=xxx&clipId=xxx
 * Get edit history for a file or clip
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = req.nextUrl.searchParams;
    const uploadedFileId = searchParams.get("uploadedFileId") ?? undefined;
    const clipId = searchParams.get("clipId") ?? undefined;

    const result = await getEditHistory(uploadedFileId, clipId, session.user.id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      edits: result.edits,
    });
  } catch (error) {
    console.error("Edit history API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

