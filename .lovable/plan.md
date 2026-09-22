# Edit Lyrics error page — diagnosis status and next step

## What I verified this round (read-only, no changes)

1. **The lyrics editor does not crash on your real data.** I rendered the `LyricsWorkspace` component in isolation, outside the browser, feeding it the actual saved prompt (`d00a1486…`, project `c17fb37a…`, 2030 characters of lyrics, valid input snapshot) pulled live from the PromptBeats database. It rendered successfully (24,883 characters of output, no exception).
2. **The live site is not running older code.** I downloaded the published generator bundle from promptbeats.app and it contains the current lyrics-mode logic, the same base-version request, and the same saved-prompt handling as the synced source. Not a stale deploy.
3. **No hook-order fault.** The lyrics branch returns early at `generate.tsx:1362`; no React hook is declared after that point in the page, so the classic "rendered fewer hooks" crash is ruled out.
4. **Every risky operation inside the editor's start-up is already wrapped in error handling**, including the background job recovery and the stored job id read.
5. **No recorded errors.** Browser console snapshot: empty. Runtime error telemetry: empty. Server logs for the period: no related entries.
6. **Reproduction in preview is still blocked.** The project runs on the external PromptBeats database, so no signed-in preview session can be created on my side; an automated run lands on the sign-in page and the lyrics screen never mounts.

## Honest conclusion

With the data, the code, and the published bundle all checking out, I cannot name the exact exception without seeing it once. Anything more specific from me would be a guess presented as a diagnosis, which is worse than no answer.

## Fastest way to close this (choose one)

**Option A — you paste the error (no changes, 1 minute).**
On promptbeats.app, open the browser console (F12 → Console), click Edit Lyrics, and paste the red error line plus the first five stack lines. Also say whether the error page appears instantly or after a brief spinner: instantly means the crash happens while drawing the screen; after a spinner means it happens once the saved version has been fetched. Either answer plus the stack pins the exact line, and I will then propose the minimal fix.

**Option B — temporary instrumentation (requires your approval to change code).**
Add a small error boundary around the lyrics screen only, which shows the real exception message and stack on screen instead of the generic error page, and logs it. Nothing else changes; it can stay permanently as a better failure message, or be removed once the cause is known.

## Why Revise works and Edit Lyrics does not

Both buttons open the same page and both fetch the base version through the same server request, so the backend and the data are not the difference. The only thing unique to Edit Lyrics is that it mounts the lyrics editing screen. That narrows the fault to that screen mounting in a real browser — the one place I cannot yet observe.
