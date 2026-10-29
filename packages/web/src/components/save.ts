import { useLanguage } from "@/context/language"
import { shareFile } from "@/lib/save"
import { toast } from "@/ui/toast"

// Saves a file through the share sheet (see lib/save.ts) and says so when it did not go through.
export function useShareFile() {
  const { t } = useLanguage()
  return (url: string, name: string) =>
    shareFile(url, name).then((result) => {
      if (result === "again") toast.show(t("save.again"))
      if (result === "failed") toast.error(t("save.failed"))
    })
}
