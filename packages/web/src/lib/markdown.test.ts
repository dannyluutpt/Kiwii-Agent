/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { fenceLanguages } from "./markdown"

describe("fenceLanguages", () => {
  test("lists the language of each block in order", () => {
    const text = "Intro\n\n```ts\nconst a = 1\n```\n\nText\n\n```\nplain\n```\n\n~~~python\nprint(1)\n~~~\n"
    expect(fenceLanguages(text)).toEqual(["ts", "", "python"])
  })

  test("a fence inside an open block of another kind does not start a new block", () => {
    const text = "````md\n```js\nnested\n```\n````\n\n```sh\nls\n```"
    expect(fenceLanguages(text)).toEqual(["md", "sh"])
  })

  test("an unclosed block while streaming still counts", () => {
    expect(fenceLanguages("Here:\n\n```python\nprint(")).toEqual(["python"])
  })
})
