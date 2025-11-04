"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Scissors, Clock } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";
import { Card, CardContent, CardHeader, CardTitle } from "./card";

interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

interface TimelineEditorProps {
  duration: number;
  segments: TranscriptSegment[];
  currentTime?: number;
  selectedStart?: number;
  selectedEnd?: number;
  onTimeChange?: (time: number) => void;
  onSelectionChange?: (_start: number, _end: number) => void;
  className?: string;
}

export function TimelineEditor({
  duration,
  segments,
  currentTime = 0,
  selectedStart,
  selectedEnd,
  onTimeChange,
  onSelectionChange: _onSelectionChange,
  className,
}: TimelineEditorProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [scrubberPosition, setScrubberPosition] = useState(currentTime);
  const [selectionStart, setSelectionStart] = useState<number | null>(selectedStart ?? null);
  const [selectionEnd, setSelectionEnd] = useState<number | null>(selectedEnd ?? null);
  const [isDragging, setIsDragging] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setScrubberPosition(currentTime);
  }, [currentTime]);

  useEffect(() => {
    if (selectedStart !== undefined) setSelectionStart(selectedStart);
    if (selectedEnd !== undefined) setSelectionEnd(selectedEnd);
  }, [selectedStart, selectedEnd]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getPosition = (time: number): number => {
    return (time / duration) * 100;
  };

  const getTimeFromPosition = useCallback((position: number): number => {
    return (position / 100) * duration;
  }, [duration]);

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    const time = getTimeFromPosition(percentage);
    
    if (onTimeChange) {
      onTimeChange(Math.max(0, Math.min(time, duration)));
    }
    setScrubberPosition(time);
  };

  const handleDragStart = (e: React.MouseEvent) => {
    setIsDragging(true);
    e.preventDefault();
  };

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    const time = Math.max(0, Math.min(getTimeFromPosition(percentage), duration));
    
    setScrubberPosition(time);
    if (onTimeChange) {
      onTimeChange(time);
    }
  }, [duration, onTimeChange, getTimeFromPosition]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleDrag);
      document.addEventListener("mouseup", handleDragEnd);
      return () => {
        document.removeEventListener("mousemove", handleDrag);
        document.removeEventListener("mouseup", handleDragEnd);
      };
    }
  }, [isDragging, handleDrag, handleDragEnd]);

  const getSegmentAtTime = (time: number): TranscriptSegment | null => {
    return segments.find((seg) => seg.start <= time && seg.end >= time) ?? null;
  };

  const currentSegment = getSegmentAtTime(scrubberPosition);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Scissors className="h-5 w-5" />
            Timeline Editor
          </span>
          <div className="text-sm font-normal text-muted-foreground">
            {formatTime(scrubberPosition)} / {formatTime(duration)}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsPlaying(!isPlaying)}
          >
            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </Button>
          <div className="flex-1" />
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4" />
            <span>Current: {formatTime(scrubberPosition)}</span>
          </div>
        </div>

        {/* Timeline */}
        <div className="relative">
          <div
            ref={timelineRef}
            className="relative h-24 w-full cursor-pointer rounded-lg bg-muted"
            onClick={handleTimelineClick}
            onMouseDown={handleDragStart}
          >
            {/* Transcript segments */}
            <div className="absolute inset-0 flex items-center">
              {segments.map((segment, idx) => {
                const left = getPosition(segment.start);
                const width = getPosition(segment.end - segment.start);
                const isActive = segment.start <= scrubberPosition && segment.end >= scrubberPosition;
                
                return (
                  <div
                    key={idx}
                    className="absolute h-full border-r border-border/50"
                    style={{
                      left: `${left}%`,
                      width: `${width}%`,
                      backgroundColor: isActive ? "rgba(59, 130, 246, 0.2)" : "transparent",
                    }}
                    title={segment.text}
                  />
                );
              })}

              {/* Selection range */}
              {selectionStart !== null && selectionEnd !== null && (
                <div
                  className="absolute top-0 h-full bg-primary/30 border-2 border-primary"
                  style={{
                    left: `${getPosition(selectionStart)}%`,
                    width: `${getPosition(selectionEnd - selectionStart)}%`,
                  }}
                />
              )}

              {/* Scrubber */}
              <div
                className="absolute top-0 h-full w-1 bg-primary z-10 cursor-grab active:cursor-grabbing"
                style={{ left: `${getPosition(scrubberPosition)}%` }}
              >
                <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-5 h-5 rounded-full bg-primary border-2 border-background" />
              </div>
            </div>

            {/* Time markers */}
            <div className="absolute bottom-0 left-0 right-0 flex justify-between text-xs text-muted-foreground px-2">
              <span>0:00</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>

        {/* Current segment info */}
        {currentSegment && (
          <div className="rounded-lg border bg-muted/50 p-3 text-sm">
            <p className="font-semibold mb-1">
              {formatTime(currentSegment.start)} - {formatTime(currentSegment.end)}
            </p>
            <p className="text-muted-foreground">{currentSegment.text}</p>
          </div>
        )}

        {/* Manual time inputs */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Start Time</label>
            <Input
              type="number"
              step="0.1"
              value={scrubberPosition.toFixed(1)}
              onChange={(e) => {
                const time = parseFloat(e.target.value) || 0;
                const clampedTime = Math.max(0, Math.min(time, duration));
                setScrubberPosition(clampedTime);
                if (onTimeChange) onTimeChange(clampedTime);
              }}
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">End Time</label>
            <Input
              type="number"
              step="0.1"
              value={duration.toFixed(1)}
              disabled
              className="font-mono"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

