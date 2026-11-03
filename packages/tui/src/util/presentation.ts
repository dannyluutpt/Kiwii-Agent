import { dots, logo } from "../logo"

const reset = "\x1b[0m"
const bold = "\x1b[1m"
const dim = "\x1b[90m"
// Kiwii brand green (theme primary #9ccc65). The dots of the three "i"s are kiwi seeds.
const seed = "\x1b[38;2;156;204;101m"

function wordmark(pad = "") {
  const draw = (line: string, seeds: number[]) =>
    [...line]
      .map((char, column) => {
        if (char === " ") return " "
        if (seeds.includes(column)) return `${seed}${char}${reset}`
        return `${bold}${char}${reset}`
      })
      .join("")

  return logo.left.map((line, index) => {
    const left = draw(line, index === 0 ? dots.left : [])
    const right = draw(logo.right[index] ?? "", index === 0 ? dots.right : [])
    return `${pad}${left} ${right}`
  })
}

export function sessionEpilogue(input: { title: string; sessionID?: string }) {
  const weak = (text: string) => `${dim}${text.padEnd(10, " ")}${reset}`
  return [
    ...wordmark("  "),
    "",
    `  ${weak("Session")}${bold}${input.title}${reset}`,
    `  ${weak("Continue")}${bold}kiwii -s ${input.sessionID}${reset}`,
    "",
  ].join("\n")
}
