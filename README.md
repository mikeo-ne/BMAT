# EastSound Monitor

A responsive Uganda airplay-monitoring dashboard built with Next.js 14 App Router, Tailwind CSS and reusable Shadcn-style UI components.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The root route redirects to `/dashboard/artist`.

## Artist & Label Portal

The portal at `/dashboard/artist` includes:

- Drag-and-drop MP3/WAV master selection (up to 50 MB)
- Song title, primary artist, featured artists, release date and Uganda ISRC generator
- Responsive catalogue table with search, region filtering and verified spin totals
- Airplay breakdown for Central, Eastern, Western and Northern Uganda
- Mock detections from real Uganda artists and radio stations for the preview

The upload and catalogue interactions are client-side demo state; connect them to a storage and catalogue API before production use.

## Responsive navigation

The desktop sidebar starts as a compact 76px icon rail so it does not crowd the main workspace. Use the chevron control to expand it to 232px; the page content reflows in the layout rather than sitting underneath the sidebar. On small screens, the hamburger opens a touch-friendly navigation drawer.

## Scripts

- `npm run dev` — start the development server on `0.0.0.0:3000`
- `npm run typecheck` — run TypeScript checks
- `npm run build` — create an optimized production build
- `npm run start` — start the production server on `0.0.0.0:3000`
