import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx"
import { z } from "zod"
import { safeName, type GeneratedFile } from "./shared"

const Block = z.object({
  type: z.enum(["heading", "paragraph", "bullets", "numbered", "table"]),
  text: z.string().max(20_000).optional(),
  level: z.number().int().min(1).max(3).optional(),
  items: z.array(z.string().max(5_000)).max(500).optional(),
  rows: z
    .array(z.array(z.string().max(2_000)).max(30))
    .max(500)
    .optional(),
})
const Input = z.object({
  filename: z.string().min(1).max(100),
  title: z.string().max(300).optional(),
  blocks: z.array(Block).min(1).max(400),
})

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3] as const

export async function buildDocx(raw: unknown): Promise<GeneratedFile> {
  const input = Input.parse(raw)
  const children: Array<Paragraph | Table> = []
  if (input.title)
    children.push(new Paragraph({ text: input.title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }))
  for (const block of input.blocks) {
    if (block.type === "heading") {
      children.push(new Paragraph({ text: block.text ?? "", heading: HEADINGS[(block.level ?? 1) - 1] }))
    } else if (block.type === "paragraph") {
      for (const line of (block.text ?? "").split(/\n{2,}/)) {
        children.push(new Paragraph({ children: [new TextRun(line.trim())], spacing: { after: 160 } }))
      }
    } else if (block.type === "bullets" || block.type === "numbered") {
      for (const item of block.items ?? []) {
        children.push(
          block.type === "bullets"
            ? new Paragraph({ text: item, bullet: { level: 0 } })
            : new Paragraph({ text: item, numbering: { reference: "numbers", level: 0 } }),
        )
      }
    } else if (block.type === "table" && block.rows?.length) {
      const width = Math.max(...block.rows.map((r) => r.length))
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: block.rows.map(
            (row, index) =>
              new TableRow({
                tableHeader: index === 0,
                children: Array.from(
                  { length: width },
                  (_, i) =>
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text: row[i] ?? "", bold: index === 0 })] })],
                    }),
                ),
              }),
          ),
        }),
      )
      children.push(new Paragraph({ text: "" }))
    }
  }
  const doc = new Document({
    numbering: {
      config: [
        {
          reference: "numbers",
          levels: [{ level: 0, format: "decimal", text: "%1.", alignment: AlignmentType.START }],
        },
      ],
    },
    styles: { default: { document: { run: { font: "Calibri", size: 22 } } } },
    sections: [{ children }],
  })
  const bytes = new Uint8Array(await Packer.toBuffer(doc))
  return {
    bytes,
    name: `${safeName(input.filename.replace(/\.docx$/i, ""), "document")}.docx`,
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  }
}
