// The product name, in one place. The i18n strings say {{brand}} and t() fills it in; index.html
// and the manifest spell it out, and src/brand.test.ts keeps them in step.
export const BRAND = "Amberpix"

// For file names: "amberpix-<id>.png".
export const BRAND_SLUG = BRAND.toLowerCase()

// Where customers write: questions, refunds, requests about their data. A form on the site rather
// than an address: the domain sends email but does not receive it.
export const SUPPORT_PATH = "/support"
export const SUPPORT_URL = `amberpix.com${SUPPORT_PATH}`
