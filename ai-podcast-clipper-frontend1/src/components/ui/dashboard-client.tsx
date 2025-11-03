"use client";

import Dropzone, { type DropzoneState } from "shadcn-dropzone";
import type { Clip } from "@prisma/client";
import Link from "next/link";
import { Button } from "./button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./card";
import { Loader2, UploadCloud } from "lucide-react";
import { useState } from "react";
import { generateUploadUrl } from "~/actions/s3";
import { toast } from "sonner";
import { processVideo } from "~/actions/generation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";
import { Badge } from "./badge";
import { useRouter } from "next/navigation";
import { ClipDisplay } from "./clip-display";
import { Chat } from "./chat";
import { EditInterface } from "./edit-interface";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";

export function DashboardClient({
  uploadedFiles,
  clips,
}: {
  uploadedFiles: {
    id: string;
    s3Key: string;
    filename: string;
    status: string;
    clipsCount: number;
    createdAt: Date;
  }[];
  clips: Clip[];
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>(undefined);
  const router = useRouter();

  const handleRefresh = async () => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 600);
  };

  const handleDrop = (acceptedFiles: File[]) => {
    setFiles(acceptedFiles);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    const file = files[0]!;
    setUploading(true);

    try {
      const { success, signedUrl, uploadedFileId } = await generateUploadUrl({
        filename: file.name,
        contentType: file.type,
      });

      if (!success) throw new Error("Failed to get upload URL");

      const uploadResponse = await fetch(signedUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!uploadResponse.ok)
        throw new Error(`Upload filed with status: ${uploadResponse.status}`);

      await processVideo(uploadedFileId);

      setFiles([]);

      toast.success("Video uploaded successfully", {
        description:
          "Your video has been scheduled for processing. Check the status below.",
        duration: 5000,
      });
    } catch {
      toast.error("Upload failed", {
        description:
          "There was a problem uploading your video. Please try again.",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            EmpathAI Video Sentiment Analyzer
          </h1>
          <p className="text-muted-foreground">
            Upload your video and analyze emotions & sentiment with AI
          </p>
        </div>
        <Link href="/dashboard/billing">
          <Button>Buy Credits</Button>
        </Link>
      </div>

      <Tabs defaultValue="upload">
                  <TabsList>
                    <TabsTrigger value="upload">Upload</TabsTrigger>
                    <TabsTrigger value="my-clips">My Clips</TabsTrigger>
                    <TabsTrigger value="chat">Chat</TabsTrigger>
                    <TabsTrigger value="edit">Edit</TabsTrigger>
                  </TabsList>

        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle>Upload Video</CardTitle>
              <CardDescription>
                Upload your video file to analyze emotions and sentiment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Dropzone
                onDrop={handleDrop}
                accept={{ "video/mp4": [".mp4"] }}
                maxSize={500 * 1024 * 1024}
                disabled={uploading}
                maxFiles={1}
              >
                {(_dropzone: DropzoneState) => (
                  <>
                    <div className="flex flex-col items-center justify-center space-y-4 rounded-lg p-10 text-center">
                      <UploadCloud className="text-muted-foreground h-12 w-12" />
                      <p className="font-medium">Drag and drop your file</p>
                      <p className="text-muted-foreground text-sm">
                        or click to browse (MP4 up to 500MB)
                      </p>
                      <Button
                        className="cursor-pointer"
                        variant="default"
                        size="sm"
                        disabled={uploading}
                      >
                        Select File
                      </Button>
                    </div>
                  </>
                )}
              </Dropzone>

              <div className="mt-2 flex items-start justify-between">
                <div>
                  {files.length > 0 && (
                    <div className="space-y-1 text-sm">
                      <p className="font-medium">Selected file:</p>
                      {files.map((file) => (
                        <p key={file.name} className="text-muted-foreground">
                          {file.name}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <Button
                  disabled={files.length === 0 || uploading}
                  onClick={handleUpload}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    "Upload and Generate Analyzed Clips"
                  )}
                </Button>
              </div>

              {uploadedFiles.length > 0 && (
                <div className="pt-6">
                  <div className="mb-2 flex items-center justify-between">
                    <h3 className="text-md mb-2 font-medium">Queue status</h3>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRefresh}
                      disabled={refreshing}
                    >
                      {refreshing && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Refresh
                    </Button>
                  </div>
                  <div className="max-h-[300px] overflow-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>File</TableHead>
                          <TableHead>Uploaded</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Analysis Results</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {uploadedFiles.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="max-w-xs truncate font-medium">
                              {item.filename}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {new Date(item.createdAt).toLocaleDateString('en-US')}
                            </TableCell>
                            <TableCell>
                              {item.status === "queued" && (
                                <Badge variant="outline">Queued</Badge>
                              )}
                              {item.status === "processing" && (
                                <Badge variant="outline">Processing</Badge>
                              )}
                              {item.status === "processed" && (
                                <Badge variant="outline">Processed</Badge>
                              )}
                              {item.status === "no credits" && (
                                <Badge variant="destructive">No credits</Badge>
                              )}
                              {item.status === "failed" && (
                                <Badge variant="destructive">Failed</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {item.clipsCount > 0 ? (
                                <span>
                                  {item.clipsCount} result
                                  {item.clipsCount !== 1 ? "s" : ""}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">
                                  No results yet
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="my-clips">
          <Card>
            <CardHeader>
              <CardTitle>Analysis Results</CardTitle>
              <CardDescription>
                View and manage your emotion & sentiment analysis results here. Processing may take a
                few minutes.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ClipDisplay clips={clips} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="chat" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Chat with Your Videos</CardTitle>
              <CardDescription>
                Ask questions about your video content. Select a video to chat about it specifically, or leave unselected to search all videos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <label className="text-sm font-medium mb-2 block">
                  Select Video (Optional)
                </label>
                <Select
                  value={selectedFileId ?? "all"}
                  onValueChange={(value) =>
                    setSelectedFileId(value === "all" ? undefined : value)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="All videos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Videos</SelectItem>
                    {uploadedFiles
                      .filter((file) => file.status === "processed")
                      .map((file) => (
                        <SelectItem key={file.id} value={file.id}>
                          {file.filename}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="h-[600px]">
                <Chat
                  uploadedFileId={selectedFileId}
                  onTimestampClick={(timestamp) => {
                    // TODO: Implement video playback at timestamp
                    console.log("Jump to timestamp:", timestamp);
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="edit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Edit Videos</CardTitle>
              <CardDescription>
                Use the visual timeline editor to precisely edit your videos. Select a video to edit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <label className="text-sm font-medium mb-2 block">
                  Select Video to Edit
                </label>
                <Select
                  value={selectedFileId ?? "none"}
                  onValueChange={(value) =>
                    setSelectedFileId(value === "none" ? undefined : value)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a video" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Select a video...</SelectItem>
                    {uploadedFiles
                      .filter((file) => file.status === "processed")
                      .map((file) => (
                        <SelectItem key={file.id} value={file.id}>
                          {file.filename}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              {selectedFileId ? (
                <EditInterface uploadedFileId={selectedFileId} />
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <p>Please select a video to start editing</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}