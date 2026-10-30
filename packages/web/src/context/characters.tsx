import { createSimpleContext } from "@kiwii/ui/context/helper"
import { createSaved } from "@/context/saved"

// The account's saved characters and the ones picked for the next pictures.
export const { use: useCharacters, provider: CharactersProvider } = createSimpleContext({
  name: "Characters",
  init: () => createSaved("characters"),
})
