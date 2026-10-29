import { ApiError, createApp } from "../app"
import { presentGeneration } from "../images/present"
import { requireAuth } from "../middleware/auth"
import { loadPlan } from "../plans"
import { loadVideoModels } from "../videos/models"
import { CreateVideo, prepareVideo } from "../videos/prepare"
import { startVideo } from "../videos/run"

export const videos = createApp()

videos.use("*", requireAuth)

videos.get("/models", async (c) => {
  const db = c.get("db")
  const user = c.get("user")
  const en = user.locale === "en"
  const plan = await loadPlan(db, user)
  return c.json({
    canGenerate: plan.parallel_limit > 0,
    models: (await loadVideoModels(db)).map((model) => ({
      id: model.id,
      name: model.name,
      tagline: en ? model.tagline_en : model.tagline_vi,
      options: model.options.map((option) => ({
        id: option.id,
        label: en ? option.label_en : option.label_vi,
        credits: option.credits,
      })),
      durations: model.durations,
      aspectRatios: model.aspectRatios,
      sound: model.sound,
      maxReferences: model.maxReferences,
      maxReferenceEdge: model.maxReferenceEdge,
      firstFrameCredits: model.firstFrameCredits,
    })),
  })
})

// Starts a video run and answers at once: the clip takes minutes, and the run's row says when it
// is ready (GET /api/images/generations/:id).
videos.post("/generations", async (c) => {
  const request = CreateVideo.parse(await c.req.json())
  const apiKey = c.env.OPENROUTER_API_KEY
  if (!apiKey) throw new ApiError(500, "LLM_NOT_CONFIGURED", "Thiếu OPENROUTER_API_KEY")
  const db = c.get("db")
  const prepared = await prepareVideo({
    db,
    bucket: c.env.BUCKET,
    images: c.env.IMAGES,
    apiKey,
    baseURL: c.env.OPENROUTER_BASE_URL,
    user: c.get("user"),
    request,
  })
  const generation = await startVideo({
    db,
    apiKey,
    baseURL: c.env.OPENROUTER_BASE_URL,
    generation: prepared.generation,
    model: prepared.model,
    firstFrame: prepared.firstFrame,
    workflow: c.env.VIDEO_WORKFLOW,
  })
  return c.json(presentGeneration(generation, []), 202)
})
