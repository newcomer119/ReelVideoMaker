import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { planEdit } from "~/lib/edits";

/**
 * POST /api/edits/plan
 * Plan an edit based on user request
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { editRequest, uploadedFileId } = (await req.json()) as {
      editRequest: string;
      uploadedFileId: string;
    };

    if (!editRequest || !uploadedFileId) {
      return NextResponse.json(
        { error: "editRequest and uploadedFileId are required" },
        { status: 400 },
      );
    }

    const result = await planEdit(editRequest, uploadedFileId, session.user.id);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      edits: result.edits,
    });
  } catch (error) {
    console.error("Edit planning API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

