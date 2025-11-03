import { NextRequest, NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { previewEdit, type EditPlan } from "~/lib/edits";

/**
 * POST /api/edits/preview
 * Preview an edit plan
 */
export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { editPlan, uploadedFileId } = (await req.json()) as {
      editPlan: EditPlan;
      uploadedFileId: string;
    };

    if (!editPlan || !uploadedFileId) {
      return NextResponse.json(
        { error: "editPlan and uploadedFileId are required" },
        { status: 400 },
      );
    }

    const result = await previewEdit(editPlan, uploadedFileId);

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      preview: result.preview,
    });
  } catch (error) {
    console.error("Edit preview API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

