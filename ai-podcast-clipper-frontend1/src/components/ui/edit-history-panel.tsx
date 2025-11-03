"use client";

import { useState, useEffect } from "react";
import { Clock, Scissors, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { Badge } from "./badge";

interface EditRecord {
  id: string;
  editType: string;
  description: string;
  startTime: number;
  endTime: number;
  status: string;
  createdAt: Date;
}

interface EditHistoryPanelProps {
  uploadedFileId?: string;
  clipId?: string;
  className?: string;
}

export function EditHistoryPanel({
  uploadedFileId,
  clipId,
  className,
}: EditHistoryPanelProps) {
  const [edits, setEdits] = useState<EditRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadHistory = async () => {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        if (uploadedFileId) params.append("uploadedFileId", uploadedFileId);
        if (clipId) params.append("clipId", clipId);

        const response = await fetch(`/api/edits/history?${params.toString()}`);
        const data = (await response.json()) as {
          success?: boolean;
          edits?: EditRecord[];
        };

        if (data.success && data.edits) {
          setEdits(data.edits);
        }
      } catch (error) {
        console.error("Error loading edit history:", error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadHistory();
  }, [uploadedFileId, clipId]);

  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "applied":
        return <Badge variant="default" className="bg-green-500">Applied</Badge>;
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      case "cancelled":
        return <Badge variant="outline">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scissors className="h-5 w-5" />
          Edit History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : edits.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Scissors className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No edits yet</p>
            <p className="text-sm">Edit history will appear here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {edits.map((edit) => (
              <div
                key={edit.id}
                className="rounded-lg border p-4 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <h4 className="font-semibold text-sm">{edit.description}</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatTimestamp(edit.startTime)} - {formatTimestamp(edit.endTime)}
                    </p>
                  </div>
                  {getStatusBadge(edit.status)}
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDate(edit.createdAt)}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {edit.editType}
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

