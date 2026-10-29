# Changelog

## 0.1.0

- `Add Selection to Terminal`: editor right-click action that writes the
  selection as `@path:lines` plus a fenced snippet into the active terminal
  (creates one if none exists).
- `Stage Selection` + `Send Staged Context`: collect several references and send
  them as one message; the status bar shows the pending count.
- `Copy Selection as Context Block`: same block onto the clipboard.
- One block per cursor for multi-cursor selections.
- Settings for path style, line-number style, fenced or bare snippets, line
  gutter, snippet length cap, preamble, delivery mode, and auto-submit.
