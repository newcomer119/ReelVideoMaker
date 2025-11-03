"use client";

import { useState, useEffect } from "react";
import { Send, Loader2, MessageSquare, Clock, Scissors, Check, X, Trash2 } from "lucide-react"
import { Button } from "./button";
import { Input } from "./input";
import { Card, CardContent, CardHeader, CardTitle } from "./card";
import { toast } from "sonner";

interface Citation {
  segmentId: string;
  start: number;
  end: number;
  text: string;
  timestamp: string;
  similarity: number;
  uploadedFileId: string;
}

interface EditPlan {
  type: string;
  description: string;
  targetClipId?: string;
  startTime: number;
  endTime: number;
  newStartTime?: number;
  newEndTime?: number;
  splitPoint?: number;
  confidence: number;
}

interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  query?: string;
  editPlans?: EditPlan[];
}

interface ChatProps {
  uploadedFileId?: string;
  onTimestampClick?: (timestamp: number) => void;
}

export function Chat({ uploadedFileId, onTimestampClick }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // Load chat history on mount
  useEffect(() => {
    const loadHistory = async () => {
      setIsLoadingHistory(true);
      try {
        const params = new URLSearchParams();
        if (uploadedFileId) {
          params.append("uploadedFileId", uploadedFileId);
        }
        params.append("limit", "100");

        const response = await fetch(`/api/chat/history?${params.toString()}`);
        const data = await response.json();

        if (data.success && data.messages) {
          // Convert database messages to UI messages
          const uiMessages: Message[] = data.messages.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            query: msg.query,
            citations: msg.citations,
            editPlans: msg.editPlans,
          }));
          setMessages(uiMessages);
        }
      } catch (error) {
        console.error("Error loading chat history:", error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [uploadedFileId]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const queryText = input.trim();
    setInput("");
    setIsLoading(true);

    try {
      // Check if this is an edit request
      const editKeywords = ["trim", "cut", "remove", "delete", "split", "merge", "edit", "adjust", "change", "modify"];
      const isEditRequest = editKeywords.some((keyword) => queryText.toLowerCase().includes(keyword));

      // If it's an edit request and we have an uploadedFileId, try to plan the edit
      let editPlans: EditPlan[] | undefined;
      if (isEditRequest && uploadedFileId) {
        try {
          const editResponse = await fetch("/api/edits/plan", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              editRequest: queryText,
              uploadedFileId,
            }),
          });

          const editData = await editResponse.json();
          if (editData.success && editData.edits && editData.edits.length > 0) {
            editPlans = editData.edits;
          }
        } catch (editError) {
          console.error("Edit planning error:", editError);
          // Continue with regular chat even if edit planning fails
        }
      }

      // Get chat response
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: queryText,
          uploadedFileId,
          editPlans: editPlans, // Pass edit plans to save with message
        }),
      });

      const data = await response.json();

      if (data.success) {
        const assistantMessage: Message = {
          id: Date.now().toString() + "-ai",
          role: "assistant",
          content: data.answer,
          citations: data.citations,
          query: data.query,
          editPlans: editPlans,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      } else {
        const errorMessage: Message = {
          role: "assistant",
          content: data.error || "Sorry, I couldn't process your question.",
          citations: [],
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: Message = {
        role: "assistant",
        content: "Sorry, there was an error processing your question.",
        citations: [],
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApplyEdit = async (editPlan: EditPlan, clipId?: string) => {
    if (!uploadedFileId) {
      toast.error("Please select a video first");
      return;
    }

    try {
      const response = await fetch("/api/edits/apply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          editPlan,
          uploadedFileId,
          clipId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success("Edit applied successfully!");
        // Optionally refresh the page or update clips
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        toast.error(data.error || "Failed to apply edit");
      }
    } catch (error) {
      console.error("Apply edit error:", error);
      toast.error("Error applying edit");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTimestamp = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Ask About Your Video
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              if (confirm("Are you sure you want to clear chat history?")) {
                try {
                  const params = new URLSearchParams();
                  if (uploadedFileId) {
                    params.append("uploadedFileId", uploadedFileId);
                  }
                  const response = await fetch(`/api/chat/history?${params.toString()}`, {
                    method: "DELETE",
                  });
                  if (response.ok) {
                    setMessages([]);
                    toast.success("Chat history cleared");
                  }
                } catch (error) {
                  toast.error("Failed to clear history");
                }
              }
            }}
            className="h-8 w-8 p-0"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden">
        {/* Messages */}
        <div className="flex-1 space-y-4 overflow-y-auto pr-2">
          {messages.length === 0 && (
            <div className="text-muted-foreground flex h-full items-center justify-center text-center text-sm">
              <div>
                <p className="mb-2">Ask questions about your video content!</p>
                <p className="text-xs">
                  Try: "What are the main topics discussed?" or "Find moments
                  about pricing"
                </p>
                <p className="text-xs mt-2 opacity-70">
                  You can also edit: "Cut the pause at 1:30" or "Remove content from 2:15 to 2:17"
                </p>
              </div>
            </div>
          )}

          {isLoadingHistory && (
            <div className="text-muted-foreground flex h-full items-center justify-center text-center text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading chat history...
            </div>
          )}

          {!isLoadingHistory && messages.map((message, idx) => (
            <div
              key={message.id || idx}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-lg px-4 py-2 ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted"
                }`}
              >
                <p className="whitespace-pre-wrap text-sm">{message.content}</p>

                {/* Edit Plans */}
                {message.editPlans && message.editPlans.length > 0 && (
                  <div className="mt-3 space-y-3 border-t pt-3">
                    <p className="text-xs font-semibold opacity-70 flex items-center gap-1">
                      <Scissors className="h-3 w-3" />
                      Suggested Edits:
                    </p>
                    {message.editPlans.map((editPlan, editIdx) => (
                      <div
                        key={editIdx}
                        className="rounded-md border bg-background/50 p-3 text-xs"
                      >
                        <div className="mb-2">
                          <p className="font-semibold">{editPlan.description}</p>
                          <p className="text-muted-foreground mt-1">
                            {formatTimestamp(editPlan.startTime)} - {formatTimestamp(editPlan.endTime)}
                            {editPlan.type === "adjust_timing" && editPlan.newStartTime && editPlan.newEndTime && (
                              <span className="ml-2">
                                → {formatTimestamp(editPlan.newStartTime)} - {formatTimestamp(editPlan.newEndTime)}
                              </span>
                            )}
                          </p>
                          <p className="text-muted-foreground mt-1">
                            Type: {editPlan.type} • Confidence: {Math.round(editPlan.confidence * 100)}%
                            {editPlan.targetClipId && (
                              <span className="ml-2 text-xs">• Editing specific clip</span>
                            )}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleApplyEdit(editPlan, editPlan.targetClipId)}
                            className="h-7 text-xs"
                          >
                            <Check className="h-3 w-3 mr-1" />
                            Apply Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              toast.info("Preview feature coming soon!");
                            }}
                            className="h-7 text-xs"
                          >
                            Preview
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Citations */}
                {message.citations && message.citations.length > 0 && (
                  <div className="mt-3 space-y-2 border-t pt-2">
                    <p className="text-xs font-semibold opacity-70">
                      Sources:
                    </p>
                    {message.citations.map((citation, citationIdx) => (
                      <div
                        key={citationIdx}
                        className="text-xs opacity-80 hover:opacity-100"
                      >
                        <button
                          onClick={() =>
                            onTimestampClick?.(citation.start)
                          }
                          className="flex items-center gap-1 text-left hover:underline"
                          disabled={!onTimestampClick}
                        >
                          <Clock className="h-3 w-3" />
                          <span className="font-mono">
                            {formatTimestamp(citation.start)}
                          </span>
                          <span className="ml-1 truncate">
                            {citation.text.slice(0, 60)}
                            {citation.text.length > 60 ? "..." : ""}
                          </span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg px-4 py-2">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Ask a question about the video..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            size="icon"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

