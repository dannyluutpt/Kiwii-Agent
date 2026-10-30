import { createSimpleContext } from "@kiwii/ui/context/helper"
import { createSaved } from "@/context/saved"

// The account's saved locations and the one picked for the next pictures.
export const { use: useLocations, provider: LocationsProvider } = createSimpleContext({
  name: "Locations",
  init: () => createSaved("locations"),
})
