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

### Screenshot Tips

- Use Playwright to auto-capture: serve the project locally, write a quick capture script
- First screenshot in the array is used as the pinned spotlight thumbnail
- Aim for 1280x800 viewport for web apps, 1400x900 for complex UIs
- Save to `screenshots/<project-key>/` folder
- For non-web projects (PowerShell, CLI tools), create an HTML mock of the UI
