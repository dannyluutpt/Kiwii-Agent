import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep } from "cloudflare:workers"
import { createDatabase } from "../db/client"
import type { Env } from "../env"
import { checkVideo, giveUpVideo, type VideoParams } from "./run"

// Waits on one video's job: looks at it every few seconds for half an hour at most, then the clip is
// stored and charged, or the run refunded. Each look is a step, so a restarted Worker resumes it.
export class VideoWorkflow extends WorkflowEntrypoint<Env, VideoParams> {
  async run(event: Readonly<WorkflowEvent<VideoParams>>, step: WorkflowStep) {
    const env = this.env
    const wait = Number(env.VIDEO_POLL_SECONDS ?? 15)
    const look = () =>
      checkVideo({
        apiKey: env.OPENROUTER_API_KEY ?? "",
        baseURL: env.OPENROUTER_BASE_URL,
        db: createDatabase(env.DB),
        bucket: env.BUCKET,
        generationID: event.payload.generationID,
      })
    for (let round = 1; round <= Math.ceil((30 * 60) / wait); round++) {
      await step.sleep(`wait ${round}`, `${wait} seconds`)
      const status = await step.do(
        `look ${round}`,
        { retries: { limit: 3, delay: "10 seconds", backoff: "exponential" }, timeout: "5 minutes" },
        look,
      )
      if (status !== "running") return status
    }
    return step.do("give up", () => giveUpVideo(createDatabase(env.DB), event.payload.generationID))
  }
}
