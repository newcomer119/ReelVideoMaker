"use client";

import { Scissors, Check, Clock } from "lucide-react";
import { Button } from "./button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog";
import { Badge } from "./badge";
import type { EditPlan } from "~/lib/edits";

interface EditPreviewModalProps {
  open: boolean;
  onClose: () => void;
  editPlan: EditPlan;
  preview: {
    before: { startTime: number; endTime: number; duration: number };
    after: { startTime: number; endTime: number; duration: number };
    affectedSegments: Array<{ start: number; end: number; text: string }>;
  };
  onApply: () => void;
}

export function EditPreviewModal({
  open,
  onClose,
  editPlan,
  preview,
  onApply,
}: EditPreviewModalProps) {
  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Preview Edit
          </DialogTitle>
          <DialogDescription>
            Review the changes before applying the edit
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Edit Info */}
          <div className="rounded-lg border p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold">{editPlan.description}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Type: <Badge variant="outline">{editPlan.type}</Badge> • Confidence:{" "}
                  {Math.round(editPlan.confidence * 100)}%
                </p>
              </div>
            </div>
          </div>

          {/* Before/After Comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border p-4">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Before
              </h4>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Start:</span>{" "}
                  <span className="font-mono">
                    {formatTimestamp(preview.before.startTime)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">End:</span>{" "}
                  <span className="font-mono">
                    {formatTimestamp(preview.before.endTime)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Duration:</span>{" "}
                  <span className="font-mono">
                    {formatTimestamp(preview.before.duration)}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-lg border p-4 bg-primary/5">
              <h4 className="font-semibold mb-3 flex items-center gap-2">
                <Check className="h-4 w-4" />
                After
              </h4>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Start:</span>{" "}
                  <span className="font-mono">
                    {formatTimestamp(preview.after.startTime)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">End:</span>{" "}
                  <span className="font-mono">
                    {formatTimestamp(preview.after.endTime)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Duration:</span>{" "}
                  <span className="font-mono">
                    {formatTimestamp(preview.after.duration)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Affected Segments */}
          {preview.affectedSegments.length > 0 && (
            <div className="rounded-lg border p-4">
              <h4 className="font-semibold mb-3">Affected Transcript Segments</h4>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {preview.affectedSegments.map((segment, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border bg-muted/50 p-2 text-sm"
                  >
                    <p className="font-mono text-xs text-muted-foreground mb-1">
                      {formatTimestamp(segment.start)} - {formatTimestamp(segment.end)}
                    </p>
                    <p>{segment.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={onApply}>
              <Check className="h-4 w-4 mr-2" />
              Apply Edit
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

