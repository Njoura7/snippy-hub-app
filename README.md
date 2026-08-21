# Clip Creator Pro

Lovable prompt — clipping tool UI MVP

Paste this into Lovable as your initial prompt.

Build a minimalistic, clean web app UI for an AI video clipping tool (a Crayo/OpusClip-style product). Focus on UI and component structure only for this first pass — no backend logic needs to work yet, just wire up realistic mock states and placeholder data so the flow feels real.

Product concept

A tool where a user pastes a long-form video URL (YouTube/Twitch) or uploads a file, the system processes it, and returns a list of auto-generated short vertical clips with captions, a virality score, and a suggested hook — which the user can preview, edit, and export.

Design direction

Minimalistic, generous whitespace, no clutter

Neutral base palette (near-black/near-white, one accent color max)

Clean sans-serif type, consistent spacing scale

No gradients, no heavy shadows, no decorative icons — flat and functional

Should feel closer to Linear or Vercel dashboard aesthetics than a flashy "creator tool" landing page

Core screens/components to build

Landing/input screen

URL input field (paste a YouTube/Twitch/podcast link) + drag-and-drop file upload alternative

Simple toggle or select for target platform (TikTok / YouTube Shorts / Instagram Reels — affects aspect ratio downstream)

Primary CTA: "Generate clips"

Recent projects list below (empty state + mock populated state)

Processing state

Simple progress indicator with step labels (Transcribing → Finding moments → Cutting clips → Captioning)

Should feel lightweight, not a giant spinner

Results/clip gallery screen

Grid or list of generated clips, each as a card showing:

Vertical video thumbnail (mock placeholder)

Clip duration

Virality score (simple numeric or bar indicator, not gamey)

Suggested hook text (editable inline)

Quick actions: preview, download, edit captions

Sort/filter control (by score, by duration)

Clip editor/preview screen

Vertical video preview frame (mock player, doesn't need to actually play video yet)

Caption style controls: font, color, position (simple, not overwhelming)

Hook text editable field

Trim/timing controls (basic — start/end handles on a timeline bar)

Export button

Simple top nav: logo, "New project", account menu placeholder

Component/tooling notes

Use shadcn/ui components (already available in Lovable) for buttons, cards, inputs, tabs, sliders — don't hand-roll basics

Keep state in mock/local data for now — no real backend wiring needed yet, just structure components so real data can slot in later

Mobile-responsive, but design primarily for desktop dashboard use first

What NOT to build yet

No real video processing, no real auth, no real database calls

No pricing/billing pages

No settings/account management depth — just a placeholder menu item

Keep the first output tight and functional rather than trying to build every screen in full detail. I'll iterate screen-by-screen from here.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/96ae57b5-30d0-496b-a6dd-c9272973bf64).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
