# Handoff: starting the 2.0 build

This file is for starting a new Claude Code session on Second brain, most
likely to plan and build version 2.0. It points to everything that already
exists and says only what isn't written down elsewhere.

## How to start a new session (for the owner)

Open Claude Code on this repo (`Vibe-coder-Milo/Second-Brain`) and paste:

> Read `docs/HANDOFF.md` and `CLAUDE.md` first. Then help me plan version 2.0
> of Second brain. Start by asking me which of the ideas in
> `docs/research/2026-11-06-feature-ideas.md` I want.

`CLAUDE.md` loads by itself in every session. This file is not automatic, so
ask for it by name.

## Where things stand (6 Nov 2026)

- Live app: https://vibe-coder-milo.github.io/Second-Brain/
- Version: service worker `sb-v27` on `main`.
- Tests: 80 of 80 passing (`cd tests && ./runall.sh`, about 25 minutes).
- Everything the owner asked for so far is built. The list, by date, is in
  `CLAUDE.md` under "Requests from the owner".

## Read these instead of this file

| What | Where |
|---|---|
| Rules, security, owner's preferences, architecture, things easy to break | `CLAUDE.md` |
| User guide: every feature as the owner sees it | `README.md` |
| Every test and what it checks | `tests/README.md` |
| Cover generators and other tools | `tools/README.md` |
| Ranked feature ideas, with sources (14 ideas; 1 to 4 are built) | `docs/research/2026-11-06-feature-ideas.md` |
| What changed and why | `git log` (commit messages are plain-language) |

## Open items to check first

1. **iPad top-bar blur: fixed** in `sb-v22` (`.edge-guard`). The owner confirmed
   it on their iPad. Keep the bar (see "iOS Safari" in `CLAUDE.md`).
2. **Confirm on a real iPad:** Touch ID or Face ID unlock, and writing with
   the Pencil across a page break in the continuous view. See "Ideas noted,
   not requested" in `CLAUDE.md`.

## Candidates for 2.0

Nothing here has been asked for yet. Let the owner choose.

- **From the research report** (not built yet):
  - 5: your own paper (custom page templates);
  - 6: links to a page inside a handwritten note;
  - 7: voice capture into the inbox;
  - 8: reminders for due tasks through Apple Calendar, plus a count on the
    app icon;
  - 9: pin favourites;
  - 10: saved searches;
  - 11: merge or split notes;
  - 12: flashcards;
  - 13: show one note inside another;
  - 14: answers written on the device by a small local language model.

  Each idea has its reasoning, effort and sources in the report.
- **From "Ideas noted, not requested" in `CLAUDE.md`:**
  - a reminder before the GitHub token expires;
  - batched rows in Inbox and Today;
  - reading Notability `.note` files.
- **The redesign mockup**:
  - What it was: a slim menu rail, a one-row writing toolbar and a cover shelf.
  - It was shown on 6 Nov; the owner said to ignore it.
  - Bring it up only if the owner asks. A "2.0" might be the moment they do.
  - The mockups are private pages in the owner's claude.ai account; the owner
    has the links.

## How a session here usually goes

- **Mockup first.** The owner likes to see a mockup before a big feature is
  built. Publish it as a private claude.ai page and wait for a yes.
- **Releasing.** For each change: add a test, run the full suite, then:
  - bump `VERSION` in `sw.js`;
  - add any new file to `SHELL`;
  - commit and push to `main`;
  - check the deploy (`gh run list --repo Vibe-coder-Milo/Second-Brain
    --limit 1`);
  - tell the owner "tap the update bar when it appears".
- **Reports from the owner.** They usually come as screenshots from the iPad
  (dark mode).
  - Check the owner's setup first: in the iPad layout a note opens inside its
    notebook (`#/notebook/B?note=A`), not as `#/note/A`.
  - Test with `.tap()`, not only `.click()`.
- **Owner-requests log.** Keep the "Requests from the owner" section in
  `CLAUDE.md` up to date: date, version, what was built, test name.
- **The code map.** `graphify-out/` is not in git. Run `/graphify` again if
  you want the code map.

## Suggested skills

- **`mattpocock-skills:research`**: before choosing 2.0 features, or to update
  the research report.
- **`hallmark:hallmark`** or **`impeccable:impeccable`**: for mockups or a
  redesign. Use them only if the owner asks for a redesign. Use
  `artifact-design` for a plain mockup page.
- **`mattpocock-skills:grilling`**: to pin down what the owner wants from 2.0
  before building.
- **`mattpocock-skills:tdd`**: for new features. Every feature needs a
  Playwright test in `tests/`.
- **`mattpocock-skills:diagnosing-bugs`**: for owner-reported problems,
  especially iPad-only ones.
- **`code-review`** and **`security-review`**: before a big release. Security
  is the owner's first rule.
- **`graphify`**: to rebuild the code map.

## Never

These come from `CLAUDE.md`, repeated because they matter most:

- Never ask for, read or handle the owner's GitHub token.
- Never send sealed notes anywhere, Claude included.
- Never add third-party requests, analytics or CDNs.
- Never put the owner's notes or personal details in this repo. The repo is
  public.
