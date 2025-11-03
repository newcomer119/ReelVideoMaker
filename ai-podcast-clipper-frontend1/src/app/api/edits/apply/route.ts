import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { applyEdit, type EditPlan } from "~/lib/edits";

/**
 * POST /api/edits/apply
 * Apply an edit plan
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { editPlan, uploadedFileId, clipId } = (await req.json()) as {
      editPlan: EditPlan;
      uploadedFileId: string;
      clipId?: string;
    };

    if (!editPlan || !uploadedFileId) {
      return NextResponse.json(
        { error: "editPlan and uploadedFileId are required" },
        { status: 400 },
      );
    }

    const result = await applyEdit(editPlan, uploadedFileId, session.user.id, clipId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      editRecordId: result.editRecordId,
      clipId: result.clipId,
    });
  } catch (error) {
    console.error("Edit apply API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

