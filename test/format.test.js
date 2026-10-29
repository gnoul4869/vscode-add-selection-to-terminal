'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  fenceTag,
  fenceFor,
  truncateSnippet,
  addLineGutter,
  formatBlock,
  joinBlocks,
  pastePayload,
} = require('../src/format');

const base = {
  pathStyle: 'relative',
  lineNumbers: 'range',
  languageFence: true,
  lineGutter: false,
  maxSnippetLines: 0,
  preamble: '',
  delivery: 'bracketedPaste',
  submit: false,
};

const selection = {
  path: 'app/utils/embeds.py',
  languageId: 'python',
  startLine: 29,
  endLine: 29,
  snippet: 'MAX_EMBED_TITLE',
  partial: true,
};

test('range header with language fence', () => {
  assert.equal(
    formatBlock({ ...selection, startLine: 29, endLine: 31, partial: false }, base),
    '@app/utils/embeds.py:29-31\n```python\nMAX_EMBED_TITLE\n```',
  );
});

test('single line collapses to one number', () => {
  assert.equal(
    formatBlock(selection, base),
    '@app/utils/embeds.py:29 (partial selection)\n```python\nMAX_EMBED_TITLE\n```',
  );
});

test('start-only and no line numbers', () => {
  const multi = { ...selection, startLine: 29, endLine: 31, snippet: 'a\nb\nc', partial: false };
  assert.match(formatBlock(multi, { ...base, lineNumbers: 'start' }), /^@app\/utils\/embeds\.py:29\n/);
  assert.match(formatBlock(multi, { ...base, lineNumbers: 'none' }), /^@app\/utils\/embeds\.py\n/);
});

test('absolute path', () => {
  const out = formatBlock(
    { ...selection, path: 'C:/repo/app/utils/embeds.py' },
    { ...base, pathStyle: 'absolute' },
  );
  assert.ok(out.startsWith('@C:/repo/app/utils/embeds.py:29'));
});

test('fence off sends bare code', () => {
  assert.equal(
    formatBlock(selection, { ...base, languageFence: false }),
    '@app/utils/embeds.py:29 (partial selection)\nMAX_EMBED_TITLE',
  );
});

test('line gutter keeps numbering aligned', () => {
  const out = formatBlock(
    { ...selection, startLine: 9, endLine: 11, snippet: 'a\nbb\nc', partial: false },
    { ...base, lineGutter: true },
  );
  assert.equal(out, '@app/utils/embeds.py:9-11\n```python\n 9 | a\n10 | bb\n11 | c\n```');
});

test('trailing newline is dropped, tabs stay inside the fence', () => {
  const out = formatBlock({ ...selection, snippet: 'def f():\n\treturn 1\n' }, base);
  assert.equal(out, '@app/utils/embeds.py:29 (partial selection)\n```python\ndef f():\n\treturn 1\n```');
});

test('fence survives backticks and nested fences in the snippet', () => {
  assert.equal(fenceFor('const s = `hi`;', 'typescript').open, '```typescript');
  assert.equal(fenceFor('a ``` b', 'md').open, '````md');
  const out = formatBlock(
    { ...selection, languageId: 'markdown', snippet: '```py\nx\n```', partial: false },
    base,
  );
  assert.equal(out, '@app/utils/embeds.py:29\n````markdown\n```py\nx\n```\n````');
});

test('language ids map to markdown fence tags', () => {
  assert.equal(fenceTag('typescriptreact'), 'tsx');
  assert.equal(fenceTag('javascriptreact'), 'jsx');
  assert.equal(fenceTag('shellscript'), 'bash');
  assert.equal(fenceTag('plaintext'), '');
  assert.equal(fenceTag(undefined), '');
  assert.equal(fenceFor('x', 'plaintext').open, '```');
});

test('long selections are capped and the omission is announced', () => {
  const snippet = Array.from({ length: 50 }, (_, i) => `line ${i}`).join('\n');
  const out = truncateSnippet(snippet, 10);
  assert.equal(out, `${Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n')}\n[... 40 more lines omitted ...]`);
  assert.equal(truncateSnippet(snippet, 0), snippet);
  assert.match(
    formatBlock({ ...selection, snippet, partial: false }, { ...base, maxSnippetLines: 3 }),
    /\[\.\.\. 47 more lines omitted \.\.\.\]\n```$/,
  );
});

test('blocks are separated by blank lines and can carry a preamble', () => {
  const blocks = ['@a.py:1\n```python\nx\n```', '@b.py:2\n```python\ny\n```'];
  assert.equal(joinBlocks(blocks, ''), blocks.join('\n\n'));
  assert.ok(joinBlocks(blocks, 'Look at this:').startsWith('Look at this:\n\n@a.py:1'));
  assert.equal(joinBlocks(['@a.py:1'], '   '), '@a.py:1');
});

test('bracketed paste payload only submits when asked', () => {
  assert.equal(pastePayload('@a.py:1\nx', false), '\u001b[200~@a.py:1\nx\u001b[201~');
  assert.ok(pastePayload('x', true).endsWith('\u001b[201~\r'));
});
