import { expect, test } from "bun:test"
import { sessionEpilogue } from "../../src/util/presentation"

test("formats session continuation summary", () => {
  const epilogue = sessionEpilogue({ title: "A session", sessionID: "ses_123" })
  expect(epilogue).toContain("A session")
  expect(epilogue).toContain("kiwii -s ses_123")
})

test("prints the kiwii wordmark with brand seed colour", () => {
  const epilogue = sessionEpilogue({ title: "A session", sessionID: "ses_123" })
  expect(epilogue).toContain("\x1b[38;2;156;204;101m")
  expect(epilogue).not.toContain("█▀▀█ █▀▀█")
})
