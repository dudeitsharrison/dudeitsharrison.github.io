# dudeitsharrison.github.io

Personal landing site for Harrison Engle's software portfolio.

Terminal-style file browser. Pure static HTML/CSS/JS — no build step. To add a new product, edit `projects.json` and push.

Live at https://dudeitsharrison.github.io

---

## Adding a New Project

Edit `projects.json` and add a new entry under `"projects"`. Use this template — every field matters for the site to display correctly:

```json
"my-project-id": {
  "name": "My Project Name",
  "category": "apps",
  "status": "live",
  "logo": "screenshots/my-project/logo.png",
  "tagline": "One-line pitch shown in listings and spotlight.",
  "description": "2-4 sentence description. What it does, who it's for, why it exists.",
  "highlights": [
    "Key feature one",
    "Key feature two",
    "Key feature three",
    "Key feature four"
  ],
  "screenshots": [
    "screenshots/my-project/main.png",
    "screenshots/my-project/feature.png"
  ],
  "tags": ["React", "TypeScript", "API", "Dashboard", "Free"],
  "availability": "wip",
  "progress": {
    "core": 80,
    "ui": 70,
    "stability": 50,
    "docs": 30
  },
  "links": [
    { "label": "Open App", "url": "https://example.com", "primary": true },
    { "label": "View on GitHub", "url": "https://github.com/...", "primary": false }
  ],
  "reviews": [
    { "quote": "User testimonial here.", "author": "User Name" }
  ]
}
```

### Field Reference

| Field | Required | Notes |
|---|---|---|
| `name` | Yes | Display name |
| `category` | Yes | Must match a key in `categories`: `apps`, `dev-tools`, `games-helpers`, `experiments` |
| `status` | Yes | `live` (green shimmer), `beta` (orange shimmer), `alpha`, `archived` |
| `logo` | No | Path to logo image. If omitted, first letter of name is used |
| `tagline` | Yes | One-liner shown in listings and pinned spotlight |
| `description` | Yes | Full description shown on the project page |
| `highlights` | Recommended | 3-4 bullet points. Shown in pinned spotlight cards. Add these! |
| `screenshots` | Recommended | Array of image paths. First one is used as pinned thumbnail |
| `tags` | Yes | 5-10 hashtags. Shown inline in listings, searchable via `tag` command |
| `availability` | Only for WIP | `wip`, `private`, `coming-soon`. Omit for live/public projects |
| `progress` | Only for WIP | Object with `core`, `ui`, `stability`, `docs` (0-100 each). Shown as progress bars |
| `links` | Recommended | CTA buttons. Set `"primary": true` for the main action |
| `reviews` | Optional | User quotes. Shown on project page |

### Checklist Before Pushing

- [ ] `name`, `category`, `status`, `tagline`, `description` filled in
- [ ] `tags` has 5-10 relevant hashtags (tech stack, purpose, platform)
- [ ] `highlights` has 3-4 feature bullets (especially if pinned)
- [ ] Screenshots captured and paths added (run project locally, use Playwright)
- [ ] `status` set correctly (`live` or `beta`) with shimmer effect
- [ ] If WIP: `availability` and `progress` percentages set
- [ ] If public repo: GitHub link in `links` array
- [ ] If private repo: no GitHub link, set `availability: "wip"` or `"private"`
- [ ] If pinning: add project ID to `"pinned"` array in meta section

### Pinning a Project

Add the project's key to the `"pinned"` array at the top of `projects.json`:

```json
"pinned": ["snipboard", "picklepairs", "pokemon-card-tracker"]
```

Pinned projects rotate in the spotlight carousel on the home page. They need `highlights` and at least one `screenshot` to look good.

### Capturing Screenshots & Video

All screenshots are auto-captured using Playwright from localhost. Here's the process:

**Setup:**
```bash
cd portfolio-site
npm install playwright --no-save    # install
npx playwright install chromium      # if browsers outdated
# clean up after: rm -rf node_modules
```

**Steps for a new project:**
1. Figure out how to run the project locally (check its `package.json` for `dev`/`start` scripts)
2. Start the server(s), verify with `curl http://localhost:<port>/`
3. Write a Playwright script to navigate and capture key views
4. Save screenshots to `screenshots/<project-key>/`
5. Update `projects.json` screenshots array (first image = pinned thumbnail)
6. Clean up: remove capture script, `rm -rf node_modules`

**Playwright capture script template:**
```js
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto('http://localhost:<PORT>', { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'screenshots/<project-key>/main.png' });

  // Navigate to other views, click buttons, etc.
  // await page.click('button:has-text("Something")');
  // await page.screenshot({ path: 'screenshots/<project-key>/feature.png' });

  await browser.close();
})();
```

**Tips:**
- Use 1280x800 viewport for web apps, 1400x900 for complex UIs
- For non-web projects (PowerShell, CLI tools), create an HTML mock of the UI and screenshot that
- For videos: use Playwright's `recordVideo` option on the browser context
- Videos support `.webm` and `.mp4` — they render as autoplay loops in the gallery
- First screenshot in the array is used as the pinned spotlight thumbnail — use a PNG, not a large GIF/video
- Trim white frames from video with ffmpeg: `ffmpeg -ss 0.5 -i input.webm -c:v libx264 -crf 23 -pix_fmt yuv420p output.mp4`

**Project-specific notes:**

| Project | How to run | Port | Notes |
|---|---|---|---|
| Snipboard | Manual screenshots already exist | — | GIF is 4.9MB, keep last in array |
| PicklePairs | Manual screenshots already exist | — | 11 screenshots |
| Claude Harry's UI | `npx http-server dist/renderer -p 8082` | 8082 | Inject mock content via `page.evaluate()` |
| SGU Player | `npx http-server . -p 8081` | 8081 | Wait 8s for RSS feed. Click `.year-header`, `.ep-card` |
| TranscribeTutorials | Server: `cd server && node src/app.js` Client: `cd client && npm start` | 3004 | Run `npm rebuild better-sqlite3` if node changed |
| Pokemon Card Tracker | Server: `cd server && npm run dev` Client: `cd client && npm run dev` | 4004 | Needs PostgreSQL running |
| NAS Installer Helper | No web UI | — | Create HTML mock of the Windows Forms layout |
| Portfolio Site | `python -m http.server 8080` | 8080 | Use `record-promo.js` for video with cursor + zooms |
