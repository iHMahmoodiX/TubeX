# Live test matrix (owner, Chrome or Edge)

Unit and fixture tests cannot prove these. Each line says what to do and what counts as a pass. Report the line number and a screenshot when something differs.

| # | Area | Do | Pass when |
|---|---|---|---|
| 1 | Install 0.6.0 | Load the unpacked build over the old one (same folder). | Old ideas, drafts and settings are still there. |
| 2 | Google sign-in | Restart the browser, open TubeX. | Channels stay signed in, or one "Reconnect all" fixes them (needs the Supabase secrets, see the persistent sign-in guide). |
| 3 | Studio upload button | Studio → Create → Upload videos, choose a file. | A small "Upload profile" pill sits next to "Reuse details"; the page layout is unchanged; the panel opens only on click and closes on outside click / Esc. |
| 4 | Quota | Settings → Connections. | "Searches today" and "Daily search limit" (100) show; research and rank checks count searches, not units. |
| 5 | Gemini | Settings → Connections → AI, Gemini with your key, "Test". | Test passes; if the saved model is 2.5-flash a notice offers "Use gemini-3.5-flash-lite". |
| 6 | Improve queue | Analyze → Improve queue. | Your own videos appear with reasons and numbers; "Improve in a draft" opens a linked draft. With Click Magnet data, low-CTR items appear. |
| 7 | Coach | Open a queue item → suggestions → allow AI once. | Advice uses only numbers shown in the item; "Ask Studio" copies a prompt and opens Studio. |
| 8 | A/B assistant | Analyze → A/B test → new for one video; add 2–3 title or thumbnail variants. | Context previews look right; the Studio checklist matches Studio's Test & Compare. Results are entered by you. |
| 9 | Research → draft | Research a keyword → "Idea + draft". | The draft opens with the keyword, the research box and the step tracker. On a YouTube watch page the "Save idea" action keeps views and date. |
| 10 | Outliers | Research → Outliers → My competitors (or a topic) → Find. | Results show views/day, baseline median, sample size and time; "Save idea" works. Cost line matches the units used today. |
| 11 | Aparat package | Manage → Aparat → "Prepare for Aparat" on one video. | Package fills from the draft without YouTube links; checks match Aparat's form; "Open Aparat upload page" opens the real upload page (confirm `https://www.aparat.com/upload`). |
| 12 | Aparat limits | Compare Aparat's upload form with docs/APARAT_FEASIBILITY.md. | Category names, 3–5 tags, 23-character tags and 2000-character description match; report any difference. |
| 13 | Aparat tab | Settings → "Read Aparat tabs" (allow aparat.com), open an Aparat video, open the TubeX side panel. | It shows "Aparat page" with the title and can save it as an idea. |
| 14 | Bulk find & replace | "Test on 1 video first" on one owned video. | Preview, write and undo work on that one video before any larger run. |

Never part of this test: uploads, publishing, deleting, paid calls or store submission.
