# Dylan's Second Brain

A morning dashboard for phone and desktop: tasks, notes, read/watch-later links, streaks, Brooklyn weather, a daily summary, a focus quote and a weekly review. Classic dark mode.

![Desktop](docs/desktop.png)

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/
```

## Deploy

`npm run build` produces a plain static site in `dist/` (relative paths, no server needed). Any static host works:

- **Vercel / Netlify / Cloudflare Pages**: import the repo, build command `npm run build`, output folder `dist`.
- **GitHub Pages** (live at https://dstraffon.github.io/Second-Brain/): `.github/workflows/deploy.yml` builds and publishes on every push to `main`. One-time setup: repo Settings → Pages → Source → **GitHub Actions**.

On a phone, open the site and use "Add to Home Screen" so it opens like an app.

## Features

- **Tasks**: Today / Week / Month / General / All tabs, with the quick-add going to whichever tab is open (Today, from All). Tap 📅 before adding to give a task a day: Today, Tomorrow, the rest of this week, Next Mon, or any date. A dated task shows under Today on its day (and stays there with a "due Mon" badge if it slips), in Week if the day is later this week, in Month if later this month, and in General if further out. 📅 on a task changes or clears its day. **All** shows every task at once, grouped Today, Later this week, Weekly, Monthly, General. Toggle ↻ Daily before adding to make a task repeat every day. Unfinished Today tasks carry over with a "since Mon" badge. Finished tasks stay visible (struck through) until their period ends, then drop out of view but stay in the weekly review. Double-click a task to rename it; use the dropdown to move it to another list. Drag the ⠿ grip to reorder tasks within a list (mouse or touch; arrow keys on the grip work too). The order is saved.
- **Full view**: click a tile's title (Tasks, Notes, Streaks, Read / watch later) to give it the whole screen. Tasks shows Daily, Weekly, Monthly and General side by side, each with its own quick-add; on a phone it shows one column at a time, so swipe or tap the switcher. Notes and links get a search box and a wider grid, and streaks show the last five weeks as a calendar. ← Dashboard, `Esc` or the browser's back button returns. The URL (`#/tasks`) can be bookmarked.
- **Notes**: type and press Enter. Tap a category chip to filter, and new notes go into the selected category. Click a note to edit, ★ to pin.
- **Links**: paste a URL (optionally with a title) and press Enter. YouTube, Vimeo, TikTok, Twitch and similar are tagged as video, everything else as article (tap the icon to switch). Video titles are filled in automatically. Filter by category or type, sort by newest, oldest or category. "Done" hides a link without deleting it; "Read" shows them again.
- **Streaks**: add your own, tap "Log today", or tap any of the last 7 days to fix a missed log. "Reset to 0 if I miss a day" is off by default. With it off, the count is the number of days logged since the last reset. ⋯ → Reset starts over by hand. Tap the number (or ⋯ → Set length) to set the current length yourself, for a streak that started before you added it.
- **Daily summary** and **focus quote** at the top. Either can be switched off in Settings; the summary is one self-contained component (`src/components/DailySummary.tsx`).
- **Weekly review**: tasks finished per day, habit grid for streaks and daily tasks, what's still open, and a short reflection saved per week.
- **Calendar**: today's and tomorrow's Google Calendar events on a tile, with what's on now, a countdown to the next event and a Join button for Meet calls; the full view (`#/calendar`) shows the next seven days and lets you hide calendars. Read-only, signed in with Google from the browser. One-time setup: [docs/google-calendar-setup.md](docs/google-calendar-setup.md).
- **Weather**: Open-Meteo (no API key), refreshed every 30 minutes.
- **Keyboard**: `t` task, `n` note, `l` link, `r` weekly review, `Esc` back.

## Data

Everything is saved in the browser's localStorage for now, so each device has its own data. Settings → Export / Import backup moves data between devices by hand.

All reads and writes go through `src/lib/storage.ts`. When a Supabase project is configured, `src/main.tsx` swaps in the sync adapter from `src/lib/sync/`, which keeps localStorage as the offline copy and mirrors each key to the cloud, merging edits from different devices. Setup steps: [docs/sync-setup.md](docs/sync-setup.md). No feature code needs to know about sync; new keys and fields sync automatically (keys starting with `ui:` stay on each device).

## Stack

Vite + React + TypeScript, no other runtime dependencies.
