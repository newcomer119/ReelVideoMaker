"use client";

import { useState } from "react";
import { Send, Loader2, MessageSquare, Clock } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { Card, CardContent, CardHeader, CardTitle } from "./card";

interface Citation {
  segmentId: string;
  start: number;
  end: number;
  text: string;
  timestamp: string;
  similarity: number;
  uploadedFileId: string;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  query?: string;
}

interface ChatProps {
  uploadedFileId?: string;
  onTimestampClick?: (timestamp: number) => void;
}

export function Chat({ uploadedFileId, onTimestampClick }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: input.trim(),
          uploadedFileId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        const assistantMessage: Message = {
          role: "assistant",
          content: data.answer,
          citations: data.citations,
          query: data.query,
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
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          Ask About Your Video
        </CardTitle>
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
              </div>
            </div>
          )}

          {messages.map((message, idx) => (
            <div
              key={idx}
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

