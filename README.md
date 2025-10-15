# Sink Ships (Battleship)

A lightweight, client-side Battleship game that runs as pure static HTML/CSS/JS. Includes single-player AI mode and manual WebRTC peer-to-peer (copy/paste signaling) for head-to-head play and spectating.

## Features
- Single-player vs AI with turn locking and configurable delay
- Manual ship placement (with adjacency allowed), auto-placement, and placement lock
- WebRTC peer-to-peer play with manual Offer/Answer copy-paste
- Spectate mode (data channel)
- Simple, static deployment (no build required)
- Documentation page at `docs.html`

## Project structure
```
index.html    # UI for AI, Host/Join, Spectate
style.css     # Styles
app.js        # Game logic, AI mode, UI wiring
webrtc.js     # Minimal WebRTC data-channel helpers (manual signaling)
docs.html     # In-app documentation
```

## Getting started (local)
- Open index.html directly, or serve locally:
  - Python: `python3 -m http.server 8000` then visit http://localhost:8000/
- Use the AI tab to place ships (Manual placement / Rotate / Lock placement) and click Start when ready.
- During the AI’s turn the opponent board is disabled and a status message indicates the turn.

## Deploying to GitHub Pages
This project is static and runs on GitHub Pages without a build.

### Option A: Deploy from a Branch (no Actions)
1. Push this folder to a GitHub repository (files at repo root).
2. In the repository: Settings → Pages → Build and deployment → Source: "Deploy from a branch".
3. Set Branch to `main` (or your default) and Folder to `/` (root).
4. Save. After a minute or two, your site will be available at:
   `https://<username>.github.io/<repo>/`

### Option B: GitHub Actions – Static HTML workflow
1. In Settings → Pages → Build and deployment → Source: select "GitHub Actions".
2. Choose the "Static HTML" suggested workflow (or add the YAML below to `.github/workflows/pages.yml`).

Example workflow:
```yaml
name: Deploy static content to Pages
on:
  push:
    branches: [ "main" ]
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: "pages"
  cancel-in-progress: true
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Pages
        uses: actions/configure-pages@v5
      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: .
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

## WebRTC notes (Host/Join/Spectate)
- GitHub Pages serves over HTTPS, satisfying WebRTC’s secure context requirements.
- Signaling is manual: copy/paste Offer/Answer between host and joiner.
- ICE config uses public STUN servers. For users behind restrictive NATs, add TURN credentials to `webrtc.js` for reliability (Pages cannot host TURN—use an external TURN service).

## In-app docs
Open `docs.html` from the app header to view gameplay and mode details.

## Customization
- AI delay: adjustable in `app.js` (look for the `setTimeout` around the AI turn). We can add a UI slider if desired.
- Placement rules: currently ships may touch in manual placement but cannot overlap.

## License
Add your preferred license (e.g., MIT) here.

## Acknowledgements
- Uses standard Web APIs (DOM, WebRTC) only. No external build tools required.