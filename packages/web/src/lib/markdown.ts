// Languages of the fenced code blocks, in order. A fence opens a block unless one is already open
// with the same character, in which case a bare fence closes it.
export function fenceLanguages(text: string) {
  const fences = Array.from(text.matchAll(/^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)/gm))
  return fences.reduce<{ open?: string; languages: string[] }>(
    (state, match) => {
      const fence = match[1] ?? ""
      const language = match[2] ?? ""
      const closes =
        state.open !== undefined && fence[0] === state.open[0] && fence.length >= state.open.length && !language
      if (closes) return { languages: state.languages }
      if (state.open !== undefined) return state
      return { open: fence, languages: [...state.languages, language] }
    },
    { languages: [] },
  ).languages
}
