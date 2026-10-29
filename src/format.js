'use strict';

/**
 * Rendering of editor selections into text that an agent in a terminal can read
 * without extra round-trips:
 *
 *   @app/utils/embeds.py:29-31
 *   ```python
 *   MAX_EMBED_TITLE
 *   ```
 *
 * The header gives the model an addressable location (it can open the file and
 * jump straight to the lines), the fenced body gives exact content plus the
 * language. This module is deliberately free of the `vscode` API so it can be
 * unit tested with plain node.
 */

/** Bracketed paste markers: text between them is inserted, never executed. */
const BRACKETED_PASTE_START = '\u001b[200~';
const BRACKETED_PASTE_END = '\u001b[201~';

/** VS Code language ids that need a different markdown fence tag. */
const FENCE_TAGS = new Map([
  ['typescriptreact', 'tsx'],
  ['javascriptreact', 'jsx'],
  ['shellscript', 'bash'],
  ['shell script', 'bash'],
  ['plaintext', ''],
  ['output', ''],
  ['log', ''],
]);

/**
 * @param {string} languageId
 * @returns {string} fence tag, empty for untyped blocks
 */
function fenceTag(languageId) {
  if (!languageId) return '';
  const key = languageId.toLowerCase();
  return FENCE_TAGS.has(key) ? FENCE_TAGS.get(key) : key;
}

/**
 * @param {string} text
 * @returns {number} length of the longest run of backticks
 */
function longestBacktickRun(text) {
  let longest = 0;
  for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  return longest;
}

/**
 * Fence wide enough to survive snippets that themselves contain ```.
 *
 * @param {string} body
 * @param {string} languageId
 * @returns {{open: string, close: string}}
 */
function fenceFor(body, languageId) {
  const marker = '`'.repeat(Math.max(3, longestBacktickRun(body) + 1));
  const tag = fenceTag(languageId);
  return { open: tag ? `${marker}${tag}` : marker, close: marker };
}

/**
 * @param {string} snippet
 * @param {number} maxLines 0 or non-numeric means unlimited
 * @returns {string}
 */
function truncateSnippet(snippet, maxLines) {
  if (!Number.isFinite(maxLines) || maxLines <= 0) return snippet;
  const lines = snippet.split('\n');
  if (lines.length <= maxLines) return snippet;
  return `${lines.slice(0, maxLines).join('\n')}\n[... ${lines.length - maxLines} more lines omitted ...]`;
}

/**
 * @param {string} snippet
 * @param {number} startLine 1-based line number of the first snippet line
 * @returns {string}
 */
function addLineGutter(snippet, startLine) {
  const lines = snippet.split('\n');
  const width = String(startLine + lines.length - 1).length;
  return lines
    .map((line, index) => `${String(startLine + index).padStart(width, ' ')} | ${line}`)
    .join('\n');
}

/**
 * @param {number} startLine
 * @param {number} endLine
 * @param {'range'|'start'|'none'} mode
 * @returns {string}
 */
function rangeLabel(startLine, endLine, mode) {
  if (mode === 'none') return '';
  if (mode === 'start' || startLine === endLine) return `:${startLine}`;
  return `:${startLine}-${endLine}`;
}

/**
 * @param {{path: string, startLine: number, endLine: number, partial: boolean}} selection
 * @param {{pathStyle: string, lineNumbers: string}} settings
 * @returns {string}
 */
function headerFor(selection, settings) {
  const range = rangeLabel(selection.startLine, selection.endLine, settings.lineNumbers);
  return `@${selection.path}${range}${selection.partial ? ' (partial selection)' : ''}`;
}

/**
 * One selection -> header + optional fenced snippet.
 *
 * @param {{path: string, languageId: string, startLine: number, endLine: number, snippet: string, partial: boolean}} selection
 * @param {{pathStyle: string, lineNumbers: string, languageFence: boolean, lineGutter: boolean, maxSnippetLines: number}} settings
 * @returns {string}
 */
function formatBlock(selection, settings) {
  const snippet = truncateSnippet(selection.snippet.replace(/\n$/, ''), settings.maxSnippetLines);
  const body = settings.lineGutter ? addLineGutter(snippet, selection.startLine) : snippet;
  const header = headerFor(selection, settings);
  if (!settings.languageFence) return `${header}\n${body}`;

  const { open, close } = fenceFor(body, selection.languageId);
  return `${header}\n${open}\n${body}\n${close}`;
}

/**
 * @param {string[]} blocks
 * @param {string} preamble
 * @returns {string}
 */
function joinBlocks(blocks, preamble) {
  const parts = [preamble?.trim(), ...blocks].filter((part) => part);
  return parts.join('\n\n');
}

/**
 * Wraps a message so terminals that enabled bracketed paste (pi, Claude Code,
 * bash, zsh, ...) insert it instead of executing each line.
 *
 * @param {string} message
 * @param {boolean} submit press Enter afterwards
 * @returns {string}
 */
function pastePayload(message, submit) {
  const pasted = `${BRACKETED_PASTE_START}${message}${BRACKETED_PASTE_END}`;
  return submit ? `${pasted}\r` : pasted;
}

module.exports = {
  BRACKETED_PASTE_START,
  BRACKETED_PASTE_END,
  fenceTag,
  fenceFor,
  truncateSnippet,
  addLineGutter,
  formatBlock,
  joinBlocks,
  pastePayload,
};
