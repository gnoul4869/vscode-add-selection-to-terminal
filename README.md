# Add Selection to Terminal

Right-click a selection in the VS Code editor and drop it into the integrated
terminal as a context block an agent can actually use:

```
@app/utils/embeds.py:29-31
```python
MAX_EMBED_TITLE
```
```

Built for terminal agents (`pi`, Claude Code, Codex CLI, OpenCode, …) where the
chat input lives in the integrated terminal instead of a sidebar, so Cline-style
"Add selection to chat" does not exist.

## Commands

| Command | Where | What it does |
| --- | --- | --- |
| **Add Selection to Terminal** | editor right-click | Formats the selection and writes it into the terminal |
| **Stage Selection (Add to Pending Context)** | editor right-click | Keeps the block; send several references as one message |
| **Send Staged Context to Terminal** | command palette, status bar item | Flushes everything staged, separated by blank lines |
| **Clear Staged Context** | command palette | Discards the staged blocks |
| **Copy Selection as Context Block** | editor right-click | Same block on the clipboard, for any other app |

Multi-cursor selections produce one block per selection, in document order.
Staged blocks show as `$(clipboard) 3 staged` in the status bar; click it to send.

No keybinding is registered by default (to avoid stealing keys from terminal
apps). Bind your own in `keybindings.json`:

```json
{ "key": "ctrl+shift+enter", "command": "addSelectionToTerminal.send", "when": "editorHasSelection" }
```

## Why this shape

- `@path` — the convention agents already understand for "open this file"; most
  terminal agents resolve `@`-paths to real file references.
- `:29-31` — the model can quote, edit, or re-read exactly those lines instead of
  re-reading the whole file. A single line renders as `:29`.
- fenced ```` ```python ```` — keeps indentation, tells the model the language,
  and separates the quoted code from your own question typed after it.
- `(partial selection)` — appended when the selection starts or ends mid-line, so
  the model knows the snippet is cut out of a larger expression.
- Relative paths by default, because a terminal agent resolves paths against the
  directory it was started in — usually the workspace root.

Two things are deliberately **not** done: line numbers are not printed inside the
snippet (the header carries them, and copy-pasteable code stays valid), and nothing
is submitted by default — you get the context, then type your question.

## Configuration

| Setting | Default | Notes |
| --- | --- | --- |
| `addSelectionToTerminal.pathStyle` | `relative` | `absolute` for files outside the workspace |
| `addSelectionToTerminal.lineNumbers` | `range` | `range` \| `start` \| `none` |
| `addSelectionToTerminal.languageFence` | `true` | off = bare snippet, no fence |
| `addSelectionToTerminal.lineGutter` | `false` | `29 | code` per line; makes the snippet non-runnable, but models cite lines more reliably |
| `addSelectionToTerminal.maxSnippetLines` | `400` | `0` = unlimited; truncation is announced in the block |
| `addSelectionToTerminal.preamble` | `""` | e.g. `Code I am referring to:` |
| `addSelectionToTerminal.delivery` | `bracketedPaste` | see below |
| `addSelectionToTerminal.submit` | `false` | press Enter after the block |
| `addSelectionToTerminal.terminalName` | `AI Context` | name of the terminal created if none is open |

### Delivery modes

- `bracketedPaste` (default) — writes the block wrapped in `ESC[200~ … ESC[201~`,
  the same sequence VS Code's own paste sends. Line-aware readers (pi, Claude
  Code, bash, zsh, python REPL) insert the text instead of executing each line.
  Requires the program to have bracketed paste enabled; otherwise it is ignored
  as noise and the text still lands in the input.
- `plain` — raw keystrokes, no wrapping. Every newline submits, so use with
  `submit: false` only for single-line snippets.
- `clipboard` — copies the block and runs VS Code's terminal paste. Most
  compatible with raw-mode TUIs, but it overwrites your clipboard and needs the
  terminal focused.

## Install

From a clone:

```bash
cd vscode-add-selection-to-terminal
npm install
npm test
npm run install-local   # vsce package + code --install-extension
```

Reload the VS Code window, select some code, right-click → **Add Selection to
Terminal**.

Or install the released `.vsix` from the repo's releases page:

```bash
code --install-extension add-selection-to-terminal-0.1.0.vsix
```

## Development

Plain JavaScript, no build step:

```
src/extension.js  commands, terminal resolution, staging, status bar
src/format.js     pure formatting, no vscode imports, unit tested
src/settings.js   validated settings with fallbacks
test/format.test.js
```

- `npm test` — `node --test`, no test framework needed.
- `F5` (Run Extension) launches an Extension Development Host with the real
  editor and terminal.
- `npm run package` — produces the `.vsix`.

### Terminal behaviour worth knowing

VS Code's `Terminal.sendText(text, shouldExecute)` normalizes newlines to `\r` and
does not expose xterm's `bracketedPasteMode`, so the extension wraps the payload
itself. That is why `bracketedPaste` works for TUIs that opted into bracketed
paste, while `plain` reflects exactly what a raw-mode program receives.

## License

MIT
