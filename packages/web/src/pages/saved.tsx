import { useLocation, useNavigate } from "@solidjs/router"
import { Show } from "solid-js"
import { CharacterMaker } from "@/components/character-maker"
import { Page } from "@/components/page"
import { SavedGallery } from "@/components/saved"
import { SavedDialog } from "@/components/saved-dialog"
import { useCharacters } from "@/context/characters"
import { useLanguage } from "@/context/language"
import { useLocations } from "@/context/locations"
import { useStudio } from "@/context/studio"

// The characters, or the locations, on a page of their own from the sidebar and the tab bar: the
// studio filter's cards, where using one goes on to the studio with it picked. Characters can also be
// made here from a description.
export default function Saved() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const studio = useStudio()
  const characters = useCharacters()
  const locations = useLocations()
  const store = () => (location.pathname === "/locations" ? locations : characters)
  const max = () => (store().kind === "locations" ? 1 : (studio.config.latest?.maxCharacters ?? 2))
  return (
    <Page title={t(`${store().kind}.title`)} width="wide">
      <Show when={store().kind === "characters"}>
        <CharacterMaker max={max()} onUse={() => navigate("/")} />
        <h2 class="mb-2 text-title-3 text-label">{t("characters.savedTitle")}</h2>
      </Show>
      <SavedGallery store={store()} max={max()} onUse={() => navigate("/")} class="" />
      <SavedDialog store={store()} max={max()} />
    </Page>
  )
}
