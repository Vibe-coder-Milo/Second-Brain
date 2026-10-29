# Second brain

A private, encrypted map of your notes, screenshots and ideas. Capture on your iPhone in seconds, see how things connect on a map, and ask Claude to sweep your chats or answer questions from your notes, only when you ask.

## How your data is protected

- **Encrypted on your device.** Every note and image is encrypted (AES-256-GCM) before it's stored. The key is protected by your passphrase (PBKDF2, 600,000 rounds). There is no reset: lose the passphrase and the notes can't be opened.
- **This repo holds only the app.** Your notes never go in it. They live on your devices and, if you turn on sync, in a separate private repo as ciphertext.
- **Text in screenshots is read on your device** (Tesseract). Nothing is uploaded for that.
- **No third-party requests.** Fonts and libraries are bundled here. The only network calls the app makes are to `api.github.com` for your own sync repo.
- **Sealed notes** have their own second passphrase, stay hidden until you open them, and are never included in anything shared with Claude.
- **Claude only sees what you copy into a chat.** The app builds the request; you paste it; you import the reply and approve every change.

## One-time setup

### 1. Publish the app (GitHub Pages)
In this repo: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)` → Save**. After a minute the app is live at:

`https://vibe-coder-milo.github.io/Second-Brain/`

(GitHub Pages on a private repo needs a paid plan. The app code is safe to keep public, since it holds no notes.)

### 2. Install it on your iPhone
Open the link in **Safari → Share → Add to Home Screen**. Use it from the Home Screen icon: that's what keeps its storage safe from Safari's automatic clean-up, and makes it work offline.

Then choose **Start a new second brain** and set a passphrase. Four or more random words is easy to type and hard to guess.

### 3. Turn on sync (phone ↔ iPad ↔ computer)
1. Create a **private** repo, e.g. `second-brain-data`, and tick *Add a README*.
2. **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
   - Repository access: **Only select repositories → second-brain-data**
   - Permissions → Repository permissions → **Contents: Read and write**
   - Pick an expiry you're comfortable with (you'll paste a new token when it expires).
3. In the app: **Settings → Sync with GitHub**, paste the token, **Connect**.

On each other device, open the same link and choose **Set up from another device** with the same repo, token and passphrase.

Every sync is one commit, so the data repo's history doubles as version history. Edits made on two devices before they sync are both kept: the newer one wins and the other becomes a "conflict copy" in your inbox.

## Everyday use

- **Capture** (the + button): a thought, screenshots or photos, and/or a link. It lands in the **Inbox**. Several screenshots without text become one note each; with text they're saved together.
- **Inbox**: tap a "File in" chip to move a capture into a region. Suggestions come from the text and from Claude.
- **Map**: each region is a territory; notes cluster around it, links are lines, dashed amber lines are suggested links. Tap a dot to open the note (on iPad it opens beside the map). Drag screenshots onto the map on iPad or a computer to capture them.
- **Notes**: Markdown, with `[[Note title]]` to link notes. Types like Highlight and Decision come with a template.
- **Ask Claude**
  - **Sweep my Claude chats** copies a request that asks Claude to go through your chats since the last sweep and keep only what's worth keeping (decisions, ideas, open questions, wins), skipping lookups and one-off tasks.
  - **Ask about your notes** copies your question plus the regions you choose.
  - Paste into any Claude chat, then **Import Claude's reply**. You review every new note, update and skipped chat before anything is saved.
- **Settings**: sync, auto-lock, passphrase, sealed notes, regions, encrypted backup download.

## Editing the app

Plain HTML, CSS and JavaScript modules, no build step. Edit on GitHub or locally and push; Pages redeploys automatically.

```
index.html            app shell and security policy
css/app.css           the whole look (light and night-chart themes)
js/app.js             routing, lock state
js/vault.js           encrypted storage and note operations
js/crypto.js          encryption
js/sync.js            GitHub sync (Git Data API)
js/graph.js           the map
js/claude.js          Ask Claude requests and reply import
js/ocr.js             on-device text reading
js/model.js           regions, note types, templates, search
js/views/*.js         one file per screen
sw.js                 offline cache
vendor/, fonts/       bundled libraries and typefaces
```

When you change any file, bump `VERSION` in `sw.js` (e.g. `sb-v2`) so installed copies pick up the update on their next launch.

To try it locally: `python3 -m http.server` in this folder, then open `http://localhost:8000`.

## Bundled software

force-graph (MIT), marked (MIT), DOMPurify (Apache-2.0 / MPL-2.0), tesseract.js and tesseract.js-core (Apache-2.0), Tesseract English data (Apache-2.0), Overpass and Spectral typefaces (SIL Open Font License 1.1).
