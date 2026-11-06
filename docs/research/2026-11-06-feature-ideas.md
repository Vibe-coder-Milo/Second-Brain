# What to build next: feature ideas for Second brain

Research date: 6 November 2026. Question from the owner: *"Is there any functionality I should build to make this tool even better, a second brain and note-taking app where I store all my notes?"*

## In short (for the owner)

Your app already does almost everything the big note apps do, so these ideas fill the gaps that matter for daily iPad use. Everything below stays on your devices and encrypted. The top five:

1. **A "Recently deleted" bin.** A deleted note waits 30 days before it's gone, so one wrong tap can't lose anything. Apple Notes, Goodnotes and Notability all have one; your app doesn't yet.
2. **Old notes come back to you on Today.** Each day, Today shows what you wrote on this day in past years plus one older note worth a second look. It picks them by itself.
3. **Two notes side by side on the iPad.** For example, a PDF on the left and your handwritten notes on the right. Notability calls this Multi-Note.
4. **Gather your highlights.** One tap collects everything you highlighted in a PDF or note into a short summary note. Each item links back to its page.
5. **Reminders for due tasks.** Your due tasks go into Apple Calendar, which reminds you even when the app is closed. The app icon also shows how many tasks are due today.

The rest of the ranked list follows, then ideas that don't fit, then the sources.

## How the sources were checked

- Most product and standards websites were blocked from this research session (see "Hosts that could not be reached" at the end).
- **Read in full** from each publisher's own source files on GitHub:
  - Obsidian's help (`obsidianmd/obsidian-help`, which is published as help.obsidian.md);
  - Logseq's docs (`logseq/docs`);
  - MDN's pages (`mdn/content`) and its browser support tables (`mdn/browser-compat-data`), which MDN's compatibility tables are built from;
  - GitHub's own docs (`github/docs`);
  - the Transformers.js README.
- **Search excerpts only** for the official pages of Apple, Goodnotes, Notability (Ginger Labs), Readwise, Notion, Heptabase, Day One, Tana, WebKit and the IETF. Each claim was checked against the search engine's excerpt of that exact official page, not against third-party blogs. These citations are marked **(excerpt)**. Open the page and confirm before relying on fine details.

The app's own features were checked against `README.md`, `CLAUDE.md` and the code (`js/`), so nothing here duplicates what it already does.

---

## Ranked ideas

Effort: **S** about a day, **M** a few days, **L** a week or more. "Value" means value to *this* owner: daily iPad and Pencil use, a self-organising second brain, privacy first.

### Safety net

#### 1. Recently deleted (a 30-day bin)
- **The idea.** Deleting a note, notebook, board or page moves it to a "Recently deleted" list instead of erasing it. It can be put back with one tap, and it's cleared for good after 30 days.
- **Why it helps.** Today, deleting is final on every device as soon as it syncs (the app warns "This syncs to your other devices"). Version history works per note, and you open it from the note itself, so a deleted note has nowhere to open it from. Of everything here, this protects your notes the most, for the least work.
- **Who has it.**
  - Apple Notes keeps deleted notes in Recently Deleted for 30 days ([Apple, iPad guide](https://support.apple.com/guide/ipad/delete-and-recover-notes-ipad143d0bd0/ipados) (excerpt)).
  - Goodnotes has a Trash Bin that is never emptied automatically, and recovery puts items back where they were ([Goodnotes](https://support.goodnotes.com/hc/en-us/articles/7353712039055-Recover-deleted-documents-folders-and-pages-from-the-Trash-Bin) (excerpt)).
  - Notability keeps deleted notes in Recently Deleted for 30 days ([Ginger Labs](https://support.gingerlabs.com/hc/en-us/articles/5955258733082-Recovering-Recently-Deleted-Notes) (excerpt)).
  - Obsidian can send deleted files to a `.trash` folder ([Obsidian help: Manage notes](https://help.obsidian.md/manage-notes)).
- **Fit.** Fully on device and encrypted. A deleted note stays an encrypted record with a "deleted on" date; sync carries that date, and the note is purged after 30 days. Sealed notes stay sealed in the bin.
- **Effort.** S–M.
- **Risk.** Ink pages and kept PDFs must not be purged while a binned note still uses them (the same care `pdfInUse` already takes). Storage use rises a little for 30 days.

#### 2. Notes that come back to you (resurfacing on Today)
- **The idea.** Today gets a small card with two parts:
  - **"On this day"**: what you wrote on this date in past years.
  - **"Worth another look"**: one older note picked by itself. It favours notes you starred, labelled Important, or haven't opened in a long while, and spaces them out so the same note doesn't come back too soon. Tap "Not useful" and it shows up less.
- **Why it helps.** A second brain only pays off if old ideas come back. You asked for things that work by themselves, and this needs nothing from you. It complements "Your map this week", which looks only at the last week.
- **Who has it.**
  - Day One shows entries from the same date in earlier years in its Today view ([Day One: On This Day](https://dayoneapp.com/releases/on-this-day-now-available-on-web/) (excerpt); [Today view](https://dayoneapp.com/guides/tips-and-tutorials/today-view/) (excerpt)).
  - Readwise's Daily Review brings highlights back using a decaying "recall probability" schedule, with a per-item frequency control ([Readwise docs](https://docs.readwise.io/readwise/docs/faqs/reviewing-highlights) (excerpt); [Readwise help: spaced repetition](https://help.readwise.io/article/26-how-does-the-readwise-spaced-repetition-algorithm-work) (excerpt)).
  - Obsidian's Random note plugin opens a random note "to rediscover notes" ([Obsidian help: Random note](https://help.obsidian.md/plugins/random-note)).
- **Fit.** On device. Today already has the notes and dates it needs. The "seen/not useful" history is a device setting, so it isn't synced. Sealed notes are left out.
- **Effort.** S.
- **Risk.** Low. Keep it to one or two items, so Today doesn't get noisy.

### Handwriting and PDFs (iPad and Pencil)

#### 3. Two notes side by side on the iPad
- **The idea.** Open a second note beside the first, for example a lecture PDF on the left and your handwritten notes on the right. You can write in either, drag the divider, and swap sides.
- **Why it helps.** On an iPad with a Pencil, this is the main thing you can't do yet. Today you flip between notes. The outline beside typed notes and the notebook list beside a note show there is room on the iPad screen for this.
- **Who has it.** Notability's Multi-Note opens two notes at once, horizontally or vertically, with a draggable divider. You open the second note from the Note Switcher ([Ginger Labs: Multi-Note and Note Switcher](https://support.gingerlabs.com/hc/en-us/articles/360003857512) (excerpt)).
- **Fit.** No privacy issue.
- **Effort.** L. The handwriting screen assumes there is one live writing page and one scrolling area (see "Ink canvases are windowed" and the zoom and continuous-view notes in `CLAUDE.md`). A first version could limit the second pane to *reading and scrolling*, with writing in one pane at a time.
- **Risk.** Medium–high: memory with two long PDFs open (pdfview keeps at most 3 PDFs open, which still fits), and the Pencil and pinch handling across two panes. Needs a real-iPad check.

#### 4. Gather highlights into a summary note
- **The idea.** In any handwritten note, PDF or typed note, the menu gets **Gather highlights**. It makes a typed note listing every highlighted passage, in page order, each with a link that jumps back to its page:
  - for PDFs, the PDF's own text under the highlight;
  - for handwriting, the handwriting the app has read;
  - for typed notes, the highlighted text.

  Labels such as Important or Follow up can be gathered the same way.
- **Why it helps.** It turns marked-up reading into notes you can search, link and file, with no retyping. The organiser and the map then pick the summary up by themselves.
- **Who has it.**
  - Heptabase stores every PDF highlight as a "Highlight card" that can be placed on whiteboards, embedded in notes, and traced back to its spot in the PDF ([Heptabase wiki: PDF annotation](https://wiki.heptabase.com/pdf-annotation) (excerpt)).
  - OneNote's Tags Summary can "Create Summary Page" from tagged notes, typed or handwritten ([Microsoft Support](https://support.microsoft.com/en-us/onenote/onenote-help-and-learning/search-for-tagged-notes-in-onenote) (excerpt)).
- **Fit.** On device. The original PDF is already kept, so pdf.js can give the text under each highlight. Handwriting reading is already on device.
- **Effort.** M.
- **Risk.** Highlights over scanned pages (pictures, not text) need OCR text with positions, which is less exact. Show what was read, so you can fix it before saving.

#### 5. Your own paper (custom page templates)
- **The idea.** Under "Paper", add **Use a page as paper**. Pick a PDF page or a photo (a planner page, a meeting template, music paper) and new pages in that note or notebook start with it underneath.
- **Why it helps.** It brings the planner-style use that Goodnotes users rely on, and it uses what the app already has (page backgrounds from PDFs and photos).
- **Who has it.** Goodnotes lets you import a PDF or image as a custom notebook template. Only the first page of a multi-page PDF is used ([Goodnotes: Import and manage custom notebook templates](https://support.goodnotes.com/hc/en-us/articles/7353728093199-Add-external-templates-to-the-template-library) (excerpt)).
- **Fit.** On device. The template is one encrypted file, shared by the pages that use it. It's the same idea as `pdf: { file, n }`.
- **Effort.** S–M.
- **Risk.** Low. Dark paper mode needs a decision: keep templates light, as PDFs already are.

#### 6. Links to a page inside a handwritten note
- **The idea.** Lasso some writing (or a text box) and choose **Link to…** to point it at a *page* of another note, or a page of the same note, for example a contents page in a notebook. Tapping it with the Move tool jumps there.
- **Why it helps.** Handwritten notes can link to *notes* already (`[[ ]]` in text boxes, "Link to another note"), but not to a particular page. Long notebooks and imported PDFs would be easier to move around.
- **Who has it.** Goodnotes links typed text to a page in the same or another notebook, but not to a spot within a page ([Goodnotes: Create external and internal links](https://support.goodnotes.com/hc/en-us/articles/7353743248143-Create-external-and-internal-links) (excerpt)).
- **Fit.** On device. The links also show on the map as ordinary links.
- **Effort.** M.
- **Risk.** Low.

### Capture

#### 7. Say a thought (voice capture into the inbox)
- **The idea.** Capture gets a microphone: hold to talk. The recording is turned into text on the device, saved as an inbox note (with the audio), and then filed by the organiser like any other capture.
- **Why it helps.** It's the fastest capture on an iPhone while walking, and all the parts already exist: recording, Whisper transcription and the organiser.
- **Who has it.** Apple Notes records audio and shows a searchable transcript in the note ([Apple: Record and transcribe audio in Notes on iPad](https://support.apple.com/guide/ipad/record-and-transcribe-audio-ipadd0bde806/ipados) (excerpt)).
- **Fit.**
  - Use the bundled Whisper model, not the browser's built-in speech recognition. MDN says that one uses "a service provided by the user's platform" by default unless on-device recognition is requested ([MDN: Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)), which could send audio off the device.
  - Whisper is already bundled and runs in the worker.
- **Effort.** S.
- **Risk.** Transcription takes a few seconds on a phone, so show the note at once and fill in the text when it's ready.

### Reminders and the app icon

#### 8. Reminders for due tasks, through Apple Calendar, plus a count on the app icon
- **The idea.**
  - **Add to Calendar** on Tasks (and on a task's date) makes a calendar file with each due task and an alert, for example 9 am on the day. Apple Calendar then reminds you even when the app is closed.
  - Optionally, **Keep my calendar up to date** makes a fresh file each time you tap it.
  - The Home Screen icon shows a small number: tasks due today or late.
- **Why it helps.** The app knows what's due but can't tap you on the shoulder. Today you only find out by opening it.
- **Who has it.** Notion's `@remind` sends a notification at the chosen time, and a push notification and email if the app isn't open ([Notion: Set reminders](https://www.notion.com/help/reminders) (excerpt)).
- **Fit.**
  - **Calendar file:** standard iCalendar. A reminder is a `VALARM` inside an event or to-do ([RFC 5545](https://www.rfc-editor.org/rfc/rfc5545.html) (excerpt)). Made on the device, with no network. Only the task titles you choose go into Calendar, so they leave the encrypted vault, and the app must say so. Sealed notes are never included.
  - **Icon count:** the Badging API works for web apps saved to the Home Screen from iOS/iPadOS 16.4 ([MDN browser-compat-data: `Navigator.setAppBadge`](https://github.com/mdn/browser-compat-data/blob/main/api/Navigator.json); [MDN: Badging API](https://developer.mozilla.org/en-US/docs/Web/API/Badging_API)). WebKit says the badge only shows once notification permission is granted ([WebKit: Badging for Home Screen Web Apps](https://webkit.org/blog/14112/badging-for-home-screen-web-apps/) (excerpt)). Without push messages, the count only updates when the app is open, so it can be a day stale.
  - **Why not real push reminders:** see "Not recommended".
- **Effort.** S (calendar file) + S (icon count).
- **Risk.** Calendar events made from a file don't update by themselves. Re-export replaces them only if each task keeps the same event id (`UID`). Check how Apple Calendar handles a re-imported file on a real iPad.

### Organise and find

#### 9. Pin favourites
- **The idea.** Pin a note or notebook so it sits at the top of All notes, and in a small "Pinned" row on Today and in the side menu.
- **Why it helps.** It's one tap to reach what you use every day (a running list, a current project). Labels and search work, but take more steps.
- **Who has it.**
  - Apple Notes pins notes to the top of the list ([Apple: Use Notes](https://support.apple.com/en-us/118442) (excerpt); [Organise notes in folders on iPad](https://support.apple.com/guide/ipad/organize-in-folders-ipadc44c8c4a/ipados) (excerpt)).
  - Obsidian's Bookmarks plugin bookmarks files, folders, searches, headings and blocks ([Obsidian help: Bookmarks](https://help.obsidian.md/plugins/bookmarks)).
- **Fit.** The pin is a synced flag in the note, so it's encrypted.
- **Effort.** S.
- **Risk.** None.

#### 10. Saved searches (smart lists)
- **The idea.** Save any search or filter, for example "label Follow up, in Career, last 3 months" or "close in meaning to *house renovation*". It shows as a list that keeps itself up to date, in the side menu or pinned.
- **Why it helps.** It's a lasting view across notebooks and regions without moving anything. That suits an app where the organiser decides where things live.
- **Who has it.**
  - Apple Notes Smart Folders filter by tags, dates, mentions and more, across folders, without moving notes ([Apple: Tags and Smart Folders](https://support.apple.com/en-us/102288) (excerpt)).
  - Obsidian lets you bookmark a search ([Obsidian help: Bookmarks](https://help.obsidian.md/plugins/bookmarks)).
  - Obsidian Bases gives saved, filtered table and card views ([Obsidian help: Bases](https://help.obsidian.md/bases)).
- **Fit.** On device. Saved searches sync encrypted in `state.config`.
- **Effort.** S–M.
- **Risk.** A saved "close in meaning" list depends on the meaning index being built on that device.

#### 11. Merge two notes, or split part of a note out
- **The idea.** **Merge into…** joins a note into another. Its links, labels, tasks and sub-notes follow, and links that pointed at it are updated. **Move to a new note** lifts the selected text (or the lassoed writing) into its own note, linked back.
- **Why it helps.** Capture plus the organiser produces near-duplicates over time. The map assistant's Noticed panel already spots "notes that belong together", and merging is the natural next step there.
- **Who has it.** Obsidian's Note composer merges notes (updating all links) and extracts a selection into a new note ([Obsidian help: Note composer](https://help.obsidian.md/plugins/note-composer)).
- **Fit.** On device. Combined with idea 1, a merge you didn't mean can be undone.
- **Effort.** M (typed), M–L (handwritten pages).
- **Risk.** Moving pages between notes must carry their ink files, kept PDFs and recordings intact.

### Remembering what you learn

#### 12. Flashcards from your notes
- **The idea.** Turn any line or lassoed bit into a flashcard (front, then the back underneath), or write "Q:" / "A:" in a typed note. **Review** shows cards that are due, and you mark each one Easy, OK or Forgot. The app schedules the next showing.
- **Why it helps.** It's useful if you study (courses, exams, languages, work knowledge you want to keep). If you don't, skip it: ideas 2 and 4 cover remembering in a lighter way.
- **Who has it.**
  - Goodnotes Study Sets are flashcard decks with a spaced-repetition mode ("Smart Learn"), and import from CSV, Anki and Quizlet ([Goodnotes: Import and export Study Sets](https://support.goodnotes.com/hc/en-us/articles/7353717956367-Import-and-export-Study-Sets) (excerpt); [Goodnotes: Study Sets](https://www.goodnotes.com/features/study-sets) (excerpt)).
  - Logseq makes any block a card with `#card`, and keeps an interval, ease factor and next review date on each card, pointing to SuperMemo's SM-5 as background ([Logseq docs: Flashcards](https://docs.logseq.com/#/page/flashcards)).
- **Fit.** On device. Review history is a synced field in each card's note, so it's encrypted. Handwritten cards are drawn from the page, with no handwriting reading needed.
- **Effort.** M.
- **Risk.** Low. Keep it out of the way for people who don't study.

### Writing and structure

#### 13. Show one note inside another (embeds)
- **The idea.** In a typed note, `![[Note]]` (or Insert → Note) shows another note's content inline, kept up to date, for example a "Current projects" note that shows each project's status note.
- **Why it helps.** One source of truth shows up in several places. It's lower priority than the ideas above.
- **Who has it.**
  - Obsidian embeds notes, headings and blocks with `![[...]]`, and they stay up to date when the source changes ([Obsidian help: Embed files](https://help.obsidian.md/embeds)).
  - Logseq has block references with `(( ))` ([Logseq docs: Block Reference](https://docs.logseq.com/#/page/block%20reference)).
- **Fit.** On device. Sealed notes must never be embedded in an unsealed one: show "Sealed note" instead.
- **Effort.** M–L (Tiptap node view, preventing a note from embedding itself in a loop, export).
- **Risk.** Markdown export and "Ask Claude" prompts must decide whether to expand embeds.

### On-device AI, later

#### 14. Answers from your notes, written on the device (a small local language model)
- **The idea.** "Ask about your notes" gets an *on-device* option: a small language model drafts an answer from your closest notes, with links. Copy and paste to Claude stays for harder questions.
- **Why it helps.** It answers from your notes in the moment, with nothing leaving the device and no copy and paste.
- **Who has it.** Apple Notes summarises recordings with Apple Intelligence ([Apple: Record and transcribe audio](https://support.apple.com/guide/ipad/record-and-transcribe-audio-ipadd0bde806/ipados) (excerpt)). That's a system feature web apps can't call.
- **Fit.**
  - Feasible in principle: WebGPU is listed as supported from Safari 26 on iOS and iPadOS ([MDN browser-compat-data: `GPU`](https://github.com/mdn/browser-compat-data/blob/main/api/GPU.json); [WebKit: Safari 26.0](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/) (excerpt)).
  - Transformers.js, which the app already bundles, can run models on WebGPU with `device: 'webgpu'` ([Transformers.js README](https://github.com/huggingface/transformers.js/blob/main/README.md)).
  - The model must be bundled, like MiniLM and Whisper. GitHub blocks files over 100 MiB ([GitHub docs: large files](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)), and Pages sites may be no larger than 1 GB ([GitHub docs: Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits)). So a model of a few hundred MB would have to be split into pieces, and it would take a big share of the site's size budget.
- **Effort.** L.
- **Risk.** High: download size, memory on an iPad, answer quality from a small model, and battery. Worth a small trial before committing. It isn't a top pick.

---

## Not recommended, or doesn't fit

- **"Share to Second brain" from other apps (share sheet).**
  - Web apps register for the share sheet with the manifest's `share_target` ([MDN: share_target](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target)), but Safari, including on iOS, does not support it ([MDN browser-compat-data: `share_target`](https://github.com/mdn/browser-compat-data/blob/main/manifests/webapp/share_target.json)).
  - A Shortcuts workaround that opens the app's link would land in Safari. A Home Screen web app's storage is kept separate from Safari's ([WebKit: Tracking Prevention](https://webkit.org/tracking-prevention/) (excerpt); [WebKit: Safari 17.2](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/) (excerpt)), so the note wouldn't reach your unlocked vault.
  - What works today: copy, open the app, and paste into Capture, which already accepts pasted images and text.
- **Real push notifications for reminders.**
  - Push messages come "from a server" ([MDN: Push API](https://developer.mozilla.org/en-US/docs/Web/API/Push_API)). Home Screen web apps can receive them from iOS 16.4 ([MDN browser-compat-data: `PushManager`](https://github.com/mdn/browser-compat-data/blob/main/api/PushManager.json)), but something has to send them at the right time.
  - That means running a server that knows your task dates, a third party in the loop. This bends the "no third-party requests" and "only available to myself" rules.
  - Use the calendar file (idea 8) instead.
- **Syncing in the background while the app is closed.** Safari supports neither Background Sync nor Periodic Background Sync ([MDN browser-compat-data: `SyncManager`](https://github.com/mdn/browser-compat-data/blob/main/api/SyncManager.json), [`PeriodicSyncManager`](https://github.com/mdn/browser-compat-data/blob/main/api/PeriodicSyncManager.json)). Sync keeps running when the app is open, as now.
- **Automatic backups into a folder in Files.** Writing to a chosen folder needs the File System Access pickers, which Safari doesn't support ([MDN browser-compat-data: `showOpenFilePicker`](https://github.com/mdn/browser-compat-data/blob/main/api/Window.json)). GitHub sync (every sync a commit) plus the manual encrypted backup already cover this.
- **Quick Note from the screen corner, widgets, Siri.** Apple's Quick Note is opened by swiping the Pencil up from the bottom-right corner, or from Control Center ([Apple: Use Quick Notes on iPad](https://support.apple.com/guide/ipad/use-quick-notes-ipad5d91fd88/ipados) (excerpt)). It belongs to Apple Notes and iPadOS. We found no web platform feature that lets a Home Screen web app hook into it, add widgets, or take Siri commands.
- **Web clipper (save the full text of a web page).**
  - Obsidian's Web Clipper is a browser extension, including a Safari extension for iOS and iPadOS ([Obsidian help: Web Clipper](https://help.obsidian.md/web-clipper)).
  - Our app can't fetch other websites: the security policy allows only `'self'` and `api.github.com`, which is on purpose. A clipper would need a separate browser extension (a native app build) or a fetching server.
  - Links are still captured as links.
- **Importing Kindle highlights automatically.** Amazon offers no API for Kindle highlights; Readwise gets them through a browser extension, or from the `My Clippings.txt` file for sideloaded books ([Readwise: Import from Amazon Kindle](https://docs.readwise.io/readwise/docs/importing-highlights/kindle) (excerpt)). A `My Clippings.txt` import is possible and fully on device, but only worth it if you read on a Kindle.
- **Cloud AI summaries and quizzes.** Several apps do this on their servers. It would break the "all AI on the device" rule. Idea 14 is the on-device version.
- **Typed objects / "supertags" (every note a Person, Book, Meeting with fixed fields).** Tana's supertags turn a note into a typed object with template fields ([Tana: Supertags](https://tana.inc/docs/supertags) (excerpt)). This means more filling in by hand, which goes against "least effort". Table views and fields already cover it when you want it.
- **Sharing or collaborating with other people.** It goes against "what I upload should only be available to myself".
- **Pencil double-tap or squeeze to switch tools.** Apple presents squeeze as a feature for native apps ([Apple WWDC24: Squeeze the most out of Apple Pencil](https://developer.apple.com/videos/play/wwdc2024/10214/) (excerpt)). We found no web standard that gives these gestures to a Safari web app.

---

## Already in the app (checked, so not suggested)

Typed notes with templates for some note types; handwriting with layers, favourite pens, shapes, lasso to text, the writing window, zoom to 6x; PDF import and markup, kept sharp; bulk Notability import; scanning with OCR; recordings with transcripts and replay with the ink; whiteboards; table, card, timeline and board views; notebooks with 66 covers; daily notes and Today; tasks; labels with a summary screen; backlinks, unlinked mentions and related notes; the map with themes, replay and the assistant; the organiser; meaning search; version history; encrypted backup and restore; Markdown and PDF export; sealed notes; Touch ID and Face ID; "More room to write". Already listed in `CLAUDE.md` under "Ideas noted": a reminder before the GitHub token expires, and showing rows in batches in Inbox and Today.

---

## Hosts that could not be reached

This research session's network blocked direct fetches from:

- support.apple.com
- support.goodnotes.com and www.goodnotes.com
- support.gingerlabs.com
- docs.readwise.io and help.readwise.io
- www.notion.com
- wiki.heptabase.com
- dayoneapp.com
- tana.inc
- support.microsoft.com
- webkit.org
- developer.mozilla.org (read from its GitHub sources instead)
- help.obsidian.md (read from its GitHub sources instead)
- docs.logseq.com (read from its GitHub sources instead)
- www.rfc-editor.org and datatracker.ietf.org
- caniuse.com, w3c.github.io, developer.apple.com

---

## Sources

All accessed on 2026-11-06. **(excerpt)**: checked against the search engine's excerpt of this official page; the page itself could not be fetched. **(GitHub source)**: read in full from the publisher's own source files on GitHub (given in brackets).

### Note-taking products
- Apple. *Delete and recover notes in Notes on iPad*: https://support.apple.com/guide/ipad/delete-and-recover-notes-ipad143d0bd0/ipados (excerpt)
- Apple. *Use Notes on your iPhone and iPad*: https://support.apple.com/en-us/118442 (excerpt)
- Apple. *Organise your notes in folders on iPad*: https://support.apple.com/guide/ipad/organize-in-folders-ipadc44c8c4a/ipados (excerpt)
- Apple. *Use Tags and Smart Folders in Notes*: https://support.apple.com/en-us/102288 (excerpt)
- Apple. *Record and transcribe audio in Notes on iPad*: https://support.apple.com/guide/ipad/record-and-transcribe-audio-ipadd0bde806/ipados (excerpt)
- Apple. *Use Quick Notes on iPad*: https://support.apple.com/guide/ipad/use-quick-notes-ipad5d91fd88/ipados (excerpt)
- Apple Developer. *Squeeze the most out of Apple Pencil* (WWDC24): https://developer.apple.com/videos/play/wwdc2024/10214/ (excerpt)
- Goodnotes. *Recover deleted documents, folders, and pages from the Trash Bin*: https://support.goodnotes.com/hc/en-us/articles/7353712039055-Recover-deleted-documents-folders-and-pages-from-the-Trash-Bin (excerpt)
- Goodnotes. *Import and manage custom notebook templates*: https://support.goodnotes.com/hc/en-us/articles/7353728093199-Add-external-templates-to-the-template-library (excerpt)
- Goodnotes. *Create external and internal links*: https://support.goodnotes.com/hc/en-us/articles/7353743248143-Create-external-and-internal-links (excerpt)
- Goodnotes. *Import and export Study Sets*: https://support.goodnotes.com/hc/en-us/articles/7353717956367-Import-and-export-Study-Sets (excerpt)
- Goodnotes. *Study Sets*: https://www.goodnotes.com/features/study-sets (excerpt)
- Ginger Labs (Notability). *Multi-Note and Note Switcher*: https://support.gingerlabs.com/hc/en-us/articles/360003857512 (excerpt)
- Ginger Labs (Notability). *Recovering Recently Deleted Notes*: https://support.gingerlabs.com/hc/en-us/articles/5955258733082-Recovering-Recently-Deleted-Notes (excerpt)
- Obsidian. *Random note*: https://help.obsidian.md/plugins/random-note (GitHub source: `obsidianmd/obsidian-help/en/Plugins/Random note.md`)
- Obsidian. *Bookmarks*: https://help.obsidian.md/plugins/bookmarks (GitHub source: `en/Plugins/Bookmarks.md`)
- Obsidian. *Note composer*: https://help.obsidian.md/plugins/note-composer (GitHub source: `en/Plugins/Note composer.md`)
- Obsidian. *Embed files*: https://help.obsidian.md/embeds (GitHub source: `en/Linking notes and files/Embed files.md`)
- Obsidian. *Manage notes* (deleted files and `.trash`): https://help.obsidian.md/manage-notes (GitHub source: `en/Files and folders/Manage notes.md`)
- Obsidian. *Bases*: https://help.obsidian.md/bases (GitHub source: `en/Bases/Introduction to Bases.md`)
- Obsidian. *Web Clipper*: https://help.obsidian.md/web-clipper (GitHub source: `en/Obsidian Web Clipper/Introduction to Obsidian Web Clipper.md`)
- Logseq. *Flashcards*: https://docs.logseq.com/#/page/flashcards (GitHub source: `logseq/docs/pages/Flashcards.md`)
- Logseq. *Block Reference*: https://docs.logseq.com/#/page/block%20reference (GitHub source: `logseq/docs/pages/Block Reference.md`)
- Readwise. *Reviewing Highlights*: https://docs.readwise.io/readwise/docs/faqs/reviewing-highlights (excerpt)
- Readwise. *How does the Readwise spaced repetition algorithm work?*: https://help.readwise.io/article/26-how-does-the-readwise-spaced-repetition-algorithm-work (excerpt)
- Readwise. *Import from Amazon Kindle*: https://docs.readwise.io/readwise/docs/importing-highlights/kindle (excerpt)
- Notion. *Set reminders in Notion*: https://www.notion.com/help/reminders (excerpt)
- Heptabase. *Read PDFs, media, eBooks & webpages*: https://wiki.heptabase.com/pdf-annotation (excerpt)
- Microsoft. *Search for tagged notes in OneNote*: https://support.microsoft.com/en-us/onenote/onenote-help-and-learning/search-for-tagged-notes-in-onenote (excerpt)
- Day One. *On This Day now available on the web*: https://dayoneapp.com/releases/on-this-day-now-available-on-web/ (excerpt)
- Day One. *Today view*: https://dayoneapp.com/guides/tips-and-tutorials/today-view/ (excerpt)
- Tana. *Supertags*: https://tana.inc/docs/supertags (excerpt)

### Web platform and hosting
- MDN. *Push API*: https://developer.mozilla.org/en-US/docs/Web/API/Push_API (GitHub source: `mdn/content/files/en-us/web/api/push_api/index.md`)
- MDN. *Badging API*: https://developer.mozilla.org/en-US/docs/Web/API/Badging_API (GitHub source: `mdn/content/.../badging_api/index.md`)
- MDN. *share_target*: https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target (GitHub source: `mdn/content/.../share_target/index.md`)
- MDN. *Web Speech API*: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API (GitHub source: `mdn/content/.../web_speech_api/index.md`)
- MDN browser-compat-data:
  - `manifests/webapp/share_target.json`: https://github.com/mdn/browser-compat-data/blob/main/manifests/webapp/share_target.json
  - `api/PushManager.json`: https://github.com/mdn/browser-compat-data/blob/main/api/PushManager.json
  - `api/Navigator.json` (`setAppBadge`): https://github.com/mdn/browser-compat-data/blob/main/api/Navigator.json
  - `api/GPU.json`: https://github.com/mdn/browser-compat-data/blob/main/api/GPU.json
  - `api/SyncManager.json`: https://github.com/mdn/browser-compat-data/blob/main/api/SyncManager.json
  - `api/PeriodicSyncManager.json`: https://github.com/mdn/browser-compat-data/blob/main/api/PeriodicSyncManager.json
  - `api/Window.json` (`showOpenFilePicker`): https://github.com/mdn/browser-compat-data/blob/main/api/Window.json
- WebKit. *Badging for Home Screen Web Apps*: https://webkit.org/blog/14112/badging-for-home-screen-web-apps/ (excerpt)
- WebKit. *Tracking Prevention in WebKit*: https://webkit.org/tracking-prevention/ (excerpt)
- WebKit. *WebKit Features in Safari 17.2*: https://webkit.org/blog/14787/webkit-features-in-safari-17-2/ (excerpt)
- WebKit. *WebKit Features in Safari 26.0*: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ (excerpt)
- IETF. *RFC 5545, iCalendar*: https://www.rfc-editor.org/rfc/rfc5545.html (excerpt)
- Hugging Face. *Transformers.js README*: https://github.com/huggingface/transformers.js/blob/main/README.md (GitHub source)
- GitHub Docs. *About large files on GitHub*: https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github (GitHub source: `github/docs`, and `data/variables/large_files.yml` for the 100 MiB figure)
- GitHub Docs. *GitHub Pages limits*: https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits (GitHub source: `github/docs`)
