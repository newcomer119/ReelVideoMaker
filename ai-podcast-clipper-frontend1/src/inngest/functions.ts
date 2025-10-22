import { env } from "~/env";
import { inngest } from "./client";

export const processVideo = inngest.createFunction(
  { id: "process-video" },
  { event: "process-video-events", concurrency: {
    limit : 1,
    key: "event.data.userId"
  } },
  async ({ event, step }) => {
    await step.run("calling-modal-endpoint", async () => {
      await fetch(env.PROCESS_VIDEO_ENDPOINT, {
        method: "POST",
        body: JSON.stringify({ s3_key: "test1/mi65min.mp4" }),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.PROCESS_VIDEO_ENDPOINT_AUTH}`,
        },
      });
    });
  },
);
