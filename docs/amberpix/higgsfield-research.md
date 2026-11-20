# Higgsfield vs Amberpix: research and roadmap (2026-11-20)

Method: Higgsfield's own `llms.txt`, blog and help centre were read directly; `higgsfield.ai/pricing` and the logged-in app render client-side and could not be read, so anything about the in-app UI is marked unverified. GitHub figures come from the GitHub search API today. Amberpix facts come from the repo.

## 0. Amberpix today (from the repo)

- Image: FLUX 3 Klein, Nano Banana 2.1, GPT Image 2.5 (1 to 28 credits), up to 4 references, 4 images per run, prompt rewrite.
- Video: Wan 3.0, MiniMax H3, Seedance 2.5 (Kling 3.0 Std hidden), 5/10 s, first and last frame, sound, 27 to 122 credits.
- Projects, per-project image assistant chat (free messages, 300/day paid, 30/day trial), saved characters and locations (1 to 4 photos, character sheet maker), library, lightbox, "Dùng lại prompt", "next scene" from a clip's frame.
- Plans: Starter 299,000 đ / 180 credits, Plus 949,000 đ / 750, Ultra 2,490,000 đ / 2,300; top-ups 200 for 379,000 đ and 1,000 for 1,790,000 đ (90 days, paid plans only). Trial: 3 credits for 14 days, FLUX 3 Klein 1K only. Monthly only, VietQR via SePay.
- Public site: landing with a showcase and "Dùng prompt này", pricing page. It is a single-page app with one set of meta tags; no per-model or per-use-case pages, no public feed, no presets, no upscale, lipsync, inpainting, API, referral or team plan.

## 1. Higgsfield product map

Source for the surface list: https://higgsfield.ai/llms.txt

| Surface | What it is |
|---|---|
| Create Image / Create Video | Multi-model workspaces (`/image`, `/ai/video`). Image: Nano Banana Pro/2, Soul 2.0, Soul Cinema, FLUX 2, GPT Image, Seedream. Video: Sora 2, Veo 3.1, Kling 3.0, WAN, Seedance, Grok Imagine |
| Motion Library | `/motion`: about 419 named camera/VFX presets grouped by model (Higgsfield 229, Hailuo 77, Kling 56, Seedance 25, WAN 32), e.g. Crash Zoom In, Dolly In, Earth Zoom Out, Bullet Time. Each preset has its own URL, a looping preview and a "Generate" button |
| Cinema Studio | Camera bodies, lenses, motion presets, film-style controls; Storyboard Generator and Keyframes beside it |
| Character / Soul ID / Soul Cast | Define a character once, reuse it across tools; AI Influencer Studio on top |
| Lipsync Studio | Talking avatars and UGC speaking clips (Speak 2.0, about 14 credits per 5 s at 720p) |
| Apps | `/apps`: 100+ one-click apps in collections (Ads & Products, Face & Identity, Viral, VFX, ASMR, Trending). Examples: Click to Ad (product link to video ad), Packshot, Billboard Ad, Outfit Swap, Face Swap, Relight, Angles, Shots (nine shots from one image), Headshot Generator, Background Remover, Expand Image |
| Editing | Image Editing (inpaint), Draw to Edit, Draw to Video, Video Edit, Animate, Upscale, Moodboard, Mixed Media |
| Chat / agent | `/chat` (shared projects, chat, calls); "Supercomputer", one chat agent for the whole pipeline, launched May 2026 and reported as Ultra-only (secondary source, unverified) |
| Canvas | Named in search results as a product; no primary page found. Unverified |
| Community | `/community`: featured creators, open projects, contests, "Shots by creators", grants (up to 200K credits), Discord; per-model community feeds (`/soul-community`, `/kling-30-community`) |
| Learning | Academy courses, prompt guides, changelog, help centre |
| API | Separate product: prepaid USD balance (minimum $5), per-second/per-image prices, 50+ models, keys at open.higgsfield.ai, async with webhooks, Python and TypeScript SDKs. MCP and CLI spend web plan credits instead. https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api |
| Earn | Creator monetization/affiliate program (`/earn`) |

**Pricing** (Higgsfield's own post dated 2026-10-24: https://higgsfield.ai/blog/higgsfield-pricing-explained)

| Plan | Price/month | Credits | Parallel jobs (video/image) |
|---|---|---|---|
| Free | $0 | 0 | 1/1, limited models, watermark |
| Starter | $15 | 200 | 2/4, selected models |
| Plus | $49 | 1,000 | 6/8, all models |
| Ultra | $129 | 3,000 | 8/8 |
| Team / Scale | $79 / $215 per seat | 1,000 / 2,500 per seat | shared workspace, SSO on Scale |

- A HeyGen article of 2026-10-20 lists different numbers (Starter $19/270, Plus $59/1,200, annual Plus $47 and Ultra $99): https://www.heygen.com/blog/higgsfield-pricing. Higgsfield prices vary by region, so both may be true; annual prices are not confirmed by a primary source.
- "Unlimited" is the main hook: selected image models cost no credits for 365 days on Plus/Ultra, plus 7-day unlimited windows on new models (Nano Banana 2, Kling 3.0 on annual plans).
- Credits do not roll over; packs and auto-refill need a subscription and expire in 90 days; failed runs are refunded.
- Example costs: FLUX.2 Pro 1 credit, Nano Banana Pro 2K 2 credits, Seedance 2.5 5 s 720p 35 credits, Veo 3 8 s 58 credits.

**Onboarding:** not verifiable from outside the app. What is confirmed: the free tier has no monthly credits, a limited model set, a watermark and one job at a time. Deep links from marketing pages (model pages, app pages, motion presets) land directly in a pre-configured generator.

**What makes it feel premium** (verified from public pages unless noted)

- Everything is a named, illustrated preset with its own URL and looping video, so users pick an outcome and never face an empty prompt box.
- One landing page per model, per app, per preset and per use case ("Sora 2 for TikTok"): a very large SEO surface that doubles as onboarding.
- Apps collapse a workflow into "upload one photo, press Generate".
- Launch cadence as marketing: every new model gets a page, a community feed and a time-limited unlimited window.
- Community, contests, Academy and Discord supply social proof.
- Hover-play tiles and a "Recreate" button inside the app: commonly described, but I could not load the app UI to confirm.
- Counterpoint: Trustpilot reviews complain about billing after cancellation, slow queues and restrictive "unlimited" plans (https://trustpilot.com/review/higgsfield.ai). Honest billing is a place to beat them.

## 2. Open-source clones

| Repo | Stars | License | Stack | Notes |
|---|---|---|---|---|
| [Anil-matcha/Open-Generative-AI](https://github.com/Anil-matcha/Open-Generative-AI) (formerly Open-Higgsfield-AI; many forks keep the old name) | 35.5k | MIT | Next.js + Electron/Vite, npm workspaces, browser storage, bring-your-own MuAPI key | Most starred and broadest: Image, Video, Audio, Lip Sync, Cinema, Recast, Marketing, Workflow (node editor), Agent, Apps, AI Influencer studios. It is a funnel for the author's paid API and white-label service, and advertises "no content filters" |
| [wide-trace/open-higgsfield](https://github.com/wide-trace/open-higgsfield) | 6.5k | **No LICENSE file** (all rights reserved by default) | Next.js 16, React 19, Zustand, Vercel Blob, IndexedDB history | One composer for image and video, 38 models, masonry gallery, viewer with Recreate, bulk select, 6-second undo |
| [neuregex/freefield](https://github.com/neuregex/freefield) | 1.7k | MIT (model weights keep their own licenses, some non-commercial) | Node + ComfyUI on Modal/RunPod | 120 apps on open weights, laid out like Higgsfield's menus |

Smaller: SegFault42/HeliosGen (3.4k, desktop, no license), D3voz/openjutsu (2.5k, MIT, character swap).

Ideas worth borrowing (ideas only):

1. **Catalog as the single source of truth** (wide-trace): each model declares its settings and media roles; the UI renders from that. Amberpix's `models.ts` is already close; extend it to media roles and presets.
2. **App = manifest, not code** (freefield): an app is a JSON file (inputs, a fixed prompt template with `{subject}` slots, an example run). 72 of its 120 apps are just a fixed prompt over an existing pipeline. This is the cheapest route to an Apps directory.
3. **Cinema controls as prompt modifiers** (Open-Generative-AI): camera, lens, focal length and aperture pickers only append text to the prompt. No new model needed.
4. **Gallery ergonomics** (wide-trace): Recreate restores model + settings + prompt, favorites, shift-click bulk actions, undo on delete, empty states that offer a starter prompt.
5. **Every example is a real run with its cost and time shown** (freefield).

Avoid: wide-trace's code (unlicensed), any repo's logos or screenshots, and the "uncensored" positioning.

## 3. Gap analysis

| Higgsfield feature | Amberpix | Effort | Paid runs to test? | Value for VN SMB/creators |
|---|---|---|---|---|
| Multi-model image + video | Has | - | - | - |
| Characters / consistent identity | Has (characters, locations, sheets) | - | - | High, already a strength |
| Chat assistant | Has (per project) | - | - | High; Higgsfield gates its agent to Ultra |
| Recreate / reuse | Partial (prompt only) | S | No | Medium |
| Favorites, bulk actions, undo | Missing (not found in strings) | S | No | Medium |
| Motion/camera preset gallery | Missing | M | No for the UI and templates; yes for preview clips | High: removes prompt writing |
| Cinema controls (lens, camera, lighting) | Missing | S | No (prompt modifiers) | Medium |
| Apps / one-click templates (product ad, packshot, poster, headshot, outfit) | Missing | M | No for the framework; yes for one example each | Very high: shop owners want "ảnh sản phẩm", not prompts |
| Public explore feed + recreate | Partial (static showcase) | M | No (opt-in user runs, existing showcase) | High: social proof and acquisition |
| SEO pages per model / app / use case | Missing (SPA, one meta set) | M | No | High: Vietnamese keywords are uncontested |
| Free tier | Partial (3 credits, 14 days, one model) | S | No | High for conversion; costs margin |
| Annual billing, unlimited windows | Missing | S / M | No | Medium; "unlimited" is risky on OpenRouter pass-through cost |
| Referral / affiliate | Missing | M | No | High in VN (Zalo/Facebook groups) |
| Upscale | Missing | M | Yes | Medium (print, banners) |
| Inpaint / draw to edit / expand / background remove | Partial (edit by prompt with references) | M | Yes | High for product photos |
| Lipsync / talking avatar | Missing | L | Yes; needs a provider beyond the current video models | High for TikTok Shop sellers; Vietnamese voice quality is the open question |
| Face/character swap in video | Missing | L | Yes | Medium; deepfake risk |
| Storyboard / multi-shot | Partial ("next scene", last frame) | M | Yes | Medium |
| Team workspace | Missing | L | No | Low now (agencies later) |
| Public API | Missing | L | No | Low now |
| Academy / guides / changelog | Missing | S | No | Medium (SEO, trust) |
| Mobile | Has (installable web app) | - | - | - |

## 4. Prioritized roadmap

**(a) Zero spend to build and verify (mock OpenRouter is already in the repo)**

1. **Preset system as data**: one manifest type (id, Vietnamese name, category, prompt template with slots, default model/ratio, example media). Powers items 2 to 4.
2. **Camera/motion and style pickers** in the video and image composers, as prompt modifiers with original Vietnamese names.
3. **Apps directory v1**: 10 to 15 templates for local demand (ảnh sản phẩm nền trắng, poster khuyến mãi, ảnh thời trang, ảnh chân dung, banner Tết, video quay quanh sản phẩm). Framework and forms need no spend; example images can start from the existing production showcase.
4. **Full Recreate** (model + settings + references + prompt), favorites, bulk download/delete with undo.
5. **Explore feed**: opt-in "publish this run", public page with recreate that carries through sign-up (the `next` mechanism exists).
6. **SEO surface**: static, prerendered pages per model, per app and per use case in Vietnamese, plus sitemap, each deep-linking into a pre-filled studio.
7. **Onboarding**: first screen offers 3 to 4 goal cards (product photo, portrait, video, poster) that load a preset instead of an empty prompt.
8. **Referral credits and annual billing** on SePay (ledger and grants already exist).

**(b) Needs paid test runs (ask the owner first, with costs)**

9. **Preview media for presets/apps**: one run each. Roughly 15 image examples at 2 to 3 credits and 10 clips at 27 to 34 credits; exact USD/VND to be quoted before running.
10. **Upscale and inpaint/expand/background removal**, then **lipsync** once a provider and Vietnamese voice quality are evaluated.

Order: 1 → 4 → 2 → 3 → 7 → 6 → 5 → 8, then 9 and 10.

## 5. Legal and brand risk

- Do not use Higgsfield names or marks: "Soul", "Soul ID", "Soul Cast", "Cinema Studio", "Higgsfield Speak", "Genjutsu", "Click to Ad", "Banana Boutique", or their preset names where distinctive. Generic film terms (dolly in, crash zoom, bullet time, packshot) are fine.
- Do not copy their preview videos, thumbnails, icons, copywriting or page layouts pixel for pixel. Borrow patterns (preset grid, recreate), keep Amberpix's own amber-on-black system.
- Do not say "Higgsfield alternative/clone" in the product UI. A factual comparison page is lower risk but still avoid their logo.
- Do not copy code from unlicensed repos (wide-trace, HeliosGen). MIT repos require keeping the copyright notice if code is taken; taking ideas only avoids the question.
- Model names (Kling, Seedance, Nano Banana, GPT Image) are third-party marks: use them only to identify the model, as today.
- Face swap, lipsync on real people and "AI influencer" features carry deepfake and impersonation risk under Vietnamese law (Cybersecurity Law, personal data decree 13/2023): require consent, keep the existing prompt screening, and treat this as needing local legal advice.
- Public feed: needs explicit opt-in, a report/takedown path and moderation before anything is shown.
- "Unlimited" claims: Higgsfield's are a top complaint; advertise only what the cost model can honour.

## Sources

- https://higgsfield.ai/llms.txt
- https://higgsfield.ai/blog/higgsfield-pricing-explained
- https://www.heygen.com/blog/higgsfield-pricing
- https://higgsfield.ai/motion
- https://higgsfield.ai/community
- https://higgsfield.ai/creator-hub/help-center/integrations/what-is-the-higgsfield-api
- https://trustpilot.com/review/higgsfield.ai
- https://github.com/Anil-matcha/Open-Generative-AI
- https://github.com/wide-trace/open-higgsfield
- https://github.com/neuregex/freefield
