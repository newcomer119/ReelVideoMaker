"use client";

import { useState, useEffect } from "react";
import { Scissors, Play, History, Eye, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./card";
import { Button } from "./button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import { TimelineEditor } from "./timeline-editor";
import { EditPreviewModal } from "./edit-preview-modal";
import { EditHistoryPanel } from "./edit-history-panel";
import { Input } from "./input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { toast } from "sonner";
import type { EditPlan } from "~/lib/edits";

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface EditInterfaceProps {
  uploadedFileId: string;
  onClose?: () => void;
}

export function EditInterface({ uploadedFileId, onClose }: EditInterfaceProps) {
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [editStart, setEditStart] = useState<number | null>(null);
  const [editEnd, setEditEnd] = useState<number | null>(null);
  const [editType, setEditType] = useState<string>("trim");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);

  useEffect(() => {
    const loadTranscript = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/transcript?uploadedFileId=${uploadedFileId}`);
        const data = await response.json();

        if (data.success && data.transcript) {
          const segments = data.transcript.segments || [];
          setTranscript(segments);
          setDuration(data.transcript.totalDuration || 0);
        }
      } catch (error) {
        console.error("Error loading transcript:", error);
        toast.error("Failed to load transcript");
      } finally {
        setIsLoading(false);
      }
    };

    loadTranscript();
  }, [uploadedFileId]);

  const handlePreview = async () => {
    if (editStart === null || editEnd === null) {
      toast.error("Please select a time range");
      return;
    }

    try {
      const editPlan: EditPlan = {
        type: editType as any,
        description: `${editType} from ${formatTime(editStart)} to ${formatTime(editEnd)}`,
        startTime: editStart,
        endTime: editEnd,
        confidence: 0.9,
      };

      const response = await fetch("/api/edits/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editPlan,
          uploadedFileId,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setPreviewData({ editPlan, preview: data.preview });
        setPreviewOpen(true);
      } else {
        toast.error(data.error || "Failed to preview edit");
      }
    } catch (error) {
      console.error("Preview error:", error);
      toast.error("Error previewing edit");
    }
  };

  const handleApplyEdit = async () => {
    if (!previewData) return;

    try {
      const response = await fetch("/api/edits/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          editPlan: previewData.editPlan,
          uploadedFileId,
        }),
      });

      const data = await response.json();
      if (data.success) {
        toast.success("Edit applied successfully!");
        setPreviewOpen(false);
        if (onClose) onClose();
      } else {
        toast.error(data.error || "Failed to apply edit");
      }
    } catch (error) {
      console.error("Apply edit error:", error);
      toast.error("Error applying edit");
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="timeline" className="w-full">
        <TabsList>
          <TabsTrigger value="timeline">
            <Scissors className="h-4 w-4 mr-2" />
            Timeline Editor
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="h-4 w-4 mr-2" />
            Edit History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="timeline" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Visual Timeline Editor</CardTitle>
              <CardDescription>
                Select a time range and edit your video with precision
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Edit Type Selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Edit Type</label>
                  <Select value={editType} onValueChange={setEditType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trim">Trim</SelectItem>
                      <SelectItem value="remove">Remove</SelectItem>
                      <SelectItem value="split">Split</SelectItem>
                      <SelectItem value="adjust_timing">Adjust Timing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Time Range Inputs */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Start Time</label>
                    <Input
                      type="number"
                      step="0.1"
                      value={editStart?.toFixed(1) ?? ""}
                      onChange={(e) => setEditStart(parseFloat(e.target.value) || null)}
                      placeholder="0.0"
                      className="font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">End Time</label>
                    <Input
                      type="number"
                      step="0.1"
                      value={editEnd?.toFixed(1) ?? ""}
                      onChange={(e) => setEditEnd(parseFloat(e.target.value) || null)}
                      placeholder="0.0"
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Timeline Editor */}
              <TimelineEditor
                duration={duration}
                segments={transcript}
                currentTime={currentTime}
                selectedStart={editStart ?? undefined}
                selectedEnd={editEnd ?? undefined}
                onTimeChange={setCurrentTime}
                onSelectionChange={(start, end) => {
                  setEditStart(start);
                  setEditEnd(end);
                }}
              />

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
                <Button variant="outline" onClick={handlePreview}>
                  <Eye className="h-4 w-4 mr-2" />
                  Preview
                </Button>
                <Button
                  onClick={handleApplyEdit}
                  disabled={editStart === null || editEnd === null}
                >
                  <Scissors className="h-4 w-4 mr-2" />
                  Apply Edit
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <EditHistoryPanel uploadedFileId={uploadedFileId} />
        </TabsContent>
      </Tabs>

      {/* Preview Modal */}
      {previewOpen && previewData && (
        <EditPreviewModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          editPlan={previewData.editPlan}
          preview={previewData.preview}
          onApply={handleApplyEdit}
        />
      )}
    </div>
  );
}

