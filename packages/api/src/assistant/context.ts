import { BRAND } from "../brand"
import type { ImageModel } from "../images/models"
import type { ChatMessage, ToolDefinition } from "../llm/openrouter"
import type { MessagePart } from "./parts"

// A picture the assistant may build on, by its label: "#1" is the newest in the project, "R1" the
// first one attached to the message.
export type Picture = { label: string; fileID: string; prompt: string; position: number; n: number }
// A saved character the assistant may put in pictures, by its label: "C1" and on.
export type Cast = { label: string; id: string; name: string }

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}…` : text)

export function systemPrompt(input: {
  model: ImageModel
  option: string
  aspectRatio: string
  n: number
  parallel: number
  maxPictures: number
  pictures: Picture[]
  attached: string[]
  characters: Cast[]
  // Labels of the characters the person picked for this message; they are in every picture of it.
  picked: string[]
}) {
  const quality = input.model.param === "quality" ? "quality" : "resolution"
  return [
    `You are the image assistant of ${BRAND}, an app that makes pictures with AI. The person describes what they want and you make it right away with the generate_image tool. Ask a question only when the request cannot be drawn at all.`,
    "",
    "How to use generate_image:",
    "- The prompt stands on its own, because the image model sees nothing of this conversation: say in full what the person wants, plainly. Add nothing they did not ask for, such as poses, expressions, lighting setups, camera or quality words, so the picture looks natural. Words the person wants printed in the picture stay exactly as given, in quotes.",
    "- A picture exists only once you call generate_image. Writing a prompt or a picture's description in your reply makes nothing, so never do that instead of calling the tool, and never say a picture is on its way without having called it.",
    "- Write the prompt in the language of the person's message (Vietnamese when they write Vietnamese): it is shown to them under the picture, and the app translates it for the image model.",
    "- To change or continue an earlier picture, pass its label in reference_images (such as #1) and describe the whole result with the change.",
    ...(input.characters.length
      ? [
          "- When a picture shows one of the person's saved characters, pass its label in characters (at most 2 per picture) and call them by name in the prompt, without describing their looks: the image model gets their photos.",
        ]
      : []),
    `- For different ideas, call the tool once per idea; for more pictures of one idea, use count. At most ${input.maxPictures} pictures per message in total.`,
    "- Change aspect_ratio or count only when the person asks. Never change the model or the quality: they are the person's choice.",
    "After the tool answers, reply in one or two short sentences in the person's language (Vietnamese unless they write in another one). Do not repeat the prompt. If the tool reports an error, say briefly what went wrong and what to do.",
    "",
    `Current settings: model ${input.model.name}, ${quality} ${input.option}, aspect ratio ${input.aspectRatio}, ${input.n} picture(s) per run. Aspect ratios this model takes: ${input.model.aspectRatios.join(", ")}. Runs at the same time: at most ${input.parallel}.`,
    input.pictures.length
      ? `Recent pictures in this project, newest first:\n${input.pictures
          .map((p) => `${p.label}: from "${clip(p.prompt, 200)}" (picture ${p.position + 1} of ${p.n})`)
          .join("\n")}`
      : "There are no pictures in this project yet.",
    input.attached.length ? `Pictures attached to this message: ${input.attached.join(", ")}.` : "",
    ...(input.characters.length
      ? [`Saved characters: ${input.characters.map((c) => `${c.label} "${c.name}"`).join(", ")}.`]
      : []),
    ...(input.picked.length
      ? [`The person picked ${input.picked.join(" and ")} for this message: they are in every picture of it.`]
      : []),
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n")
}

export function generateTool(model: ImageModel, maxPictures: number, characters: Cast[] = []): ToolDefinition {
  return {
    type: "function",
    function: {
      name: "generate_image",
      description:
        "Make pictures with the image model, on the person's current settings unless they asked otherwise. It returns at once; the pictures render while you reply.",
      parameters: {
        type: "object",
        properties: {
          prompt: {
            type: "string",
            description: "Complete description of the picture, standing on its own, in the person's language.",
          },
          reference_images: {
            type: "array",
            items: { type: "string" },
            description: "Labels of pictures to work from, such as #1 or R1.",
          },
          aspect_ratio: {
            type: "string",
            enum: model.aspectRatios,
            description:
              "The frame, whenever the person names one (such as 9:16 for a story or 16:9 for a banner), even if the prompt mentions it: the prompt alone does not change the frame. Leave it out otherwise.",
          },
          count: {
            type: "integer",
            minimum: 1,
            maximum: maxPictures,
            description: "How many pictures of this one idea; only when the person asks.",
          },
          ...(characters.length
            ? {
                characters: {
                  type: "array",
                  items: { type: "string", enum: characters.map((c) => c.label) },
                  maxItems: 2,
                  description: "Labels of the saved characters in the picture, such as C1.",
                },
              }
            : {}),
        },
        required: ["prompt"],
      },
    },
  }
}

// Earlier turns as the model reads them: what was said, and each run a reply started replayed as the
// generate_image call that started it. Written out as text, runs taught the model to describe
// pictures in its replies instead of calling the tool. Refused calls are left out; the reply says why.
// A message that never got an answer (its turn failed) is left out too, or the model would carry it
// out along with the next one, which is often the same request sent again.
export function historyMessages(
  rows: Array<{ role: "user" | "assistant"; parts: MessagePart[] }>,
  runs: Map<string, { prompt: string; n: number }>,
): ChatMessage[] {
  return rows.flatMap((row, index): ChatMessage[] => {
    if (row.role === "user" && rows[index + 1]?.role === "user") return []
    const text = row.parts
      .flatMap((part) => {
        if (part.type === "text") return [clip(part.text, 4000)]
        if (part.type === "image" && row.role === "user") return ["[attached a picture]"]
        if (part.type === "character" && row.role === "user") return [`[picked the character "${part.name}"]`]
        return []
      })
      .join("\n")
    if (row.role === "user") return [{ role: "user", content: text }]
    const started = row.parts.flatMap((part) => {
      if (part.type !== "generation") return []
      const run = runs.get(part.id)
      return run ? [{ id: `call_${part.id}`, prompt: run.prompt, n: run.n }] : []
    })
    if (started.length === 0) return [{ role: "assistant", content: text }]
    return [
      {
        role: "assistant",
        content: null,
        tool_calls: started.map((run) => ({
          id: run.id,
          type: "function",
          function: { name: "generate_image", arguments: JSON.stringify({ prompt: clip(run.prompt, 1000) }) },
        })),
      },
      ...started.map(
        (run): ChatMessage => ({
          role: "tool",
          tool_call_id: run.id,
          content: JSON.stringify({ status: "started", pictures: run.n }),
        }),
      ),
      ...(text ? [{ role: "assistant" as const, content: text }] : []),
    ]
  })
}
