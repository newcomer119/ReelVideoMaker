import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { getFullTranscript, getTranscriptInRange } from "~/lib/transcript";

/**
 * GET /api/transcript?uploadedFileId=xxx
 * Get the full transcript for a video
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
    const uploadedFileId = searchParams.get("uploadedFileId");
    const startTime = searchParams.get("startTime");
    const endTime = searchParams.get("endTime");

    if (!uploadedFileId) {
      return NextResponse.json(
        { error: "uploadedFileId is required" },
        { status: 400 },
      );
    }

    // If time range is provided, get segments in that range
    if (startTime && endTime) {
      const result = await getTranscriptInRange(
        uploadedFileId,
        parseFloat(startTime),
        parseFloat(endTime),
      );

      if (!result.success) {
        return NextResponse.json(
          { error: result.error },
          { status: 400 },
        );
      }

      return NextResponse.json({
        success: true,
        segments: result.segments,
        range: result.range,
      });
    }

    // Otherwise, get full transcript
    const result = await getFullTranscript(uploadedFileId);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 },
      );
    }

    return NextResponse.json({
      success: true,
      transcript: result.transcript,
    });
  } catch (error) {
    console.error("Transcript API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

