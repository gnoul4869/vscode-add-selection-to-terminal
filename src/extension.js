'use strict';

const path = require('node:path');
const vscode = require('vscode');
const { readSettings } = require('./settings');
const { formatBlock, joinBlocks, pastePayload } = require('./format');

const PREFIX = 'addSelectionToTerminal';
const COMMANDS = {
  send: `${PREFIX}.send`,
  stage: `${PREFIX}.stage`,
  sendStaged: `${PREFIX}.sendStaged`,
  clearStaged: `${PREFIX}.clearStaged`,
  copy: `${PREFIX}.copy`,
};

/** Context blocks collected by "Stage", flushed by "Send Staged Context". */
let staged = [];
/** Terminal this extension created, if any. */
let createdTerminal;
/** Most recently active terminal, including when the focus is on the editor. */
let lastTerminal;
let statusBar;

function toPosix(filePath) {
  return filePath.split(path.sep).join('/');
}

/**
 * @param {vscode.Uri} uri
 * @param {'relative'|'absolute'} style
 * @returns {string} workspace-relative path when possible, POSIX separators
 */
function displayPath(uri, style) {
  const fsPath = uri.fsPath;
  if (style === 'relative') {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    if (folder) {
      const relative = path.relative(folder.uri.fsPath, fsPath);
      if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
        return toPosix(relative);
      }
    }
  }
  return toPosix(fsPath);
}

/**
 * Turns one editor selection into the data a block needs.
 *
 * Line numbers are 1-based. A selection ending at column 0 belongs to the
 * previous line; a selection that starts or ends mid-line is "partial", which
 * is worth telling the model because the surrounding code is not shown.
 *
 * @param {vscode.TextDocument} document
 * @param {vscode.Selection} selection
 * @param {ReturnType<typeof readSettings>} settings
 */
function describeSelection(document, selection, settings) {
  const snippet = document.getText(selection).replace(/\n$/, '');
  const startLine = selection.start.line + 1;
  const endLine = selection.end.character === 0 ? selection.end.line : selection.end.line + 1;
  const endLineLength = document.lineAt(selection.end.line).text.length;
  const partial =
    selection.start.character > 0 ||
    (selection.end.character > 0 && selection.end.character < endLineLength);

  return {
    path: displayPath(document.uri, settings.pathStyle),
    languageId: document.languageId,
    startLine,
    endLine: Math.max(startLine, endLine),
    snippet,
    partial,
  };
}

/**
 * @param {vscode.TextEditor | undefined} editor
 * @param {ReturnType<typeof readSettings>} settings
 * @returns {string[]} one block per non-empty selection, in document order
 */
function collectBlocks(editor, settings) {
  if (!editor) return [];
  const selections = editor.selections
    .filter((selection) => !selection.isEmpty)
    .sort((a, b) =>
      a.start.line - b.start.line || a.start.character - b.start.character,
    );
  return selections.map((selection) =>
    formatBlock(describeSelection(editor.document, selection, settings), settings),
  );
}

/**
 * @param {ReturnType<typeof readSettings>} settings
 * @returns {vscode.Terminal} the active terminal, or a new one
 */
function resolveTerminal(settings) {
  const existing = vscode.window.activeTerminal ?? lastTerminal ?? createdTerminal;
  if (existing) return existing;
  createdTerminal = vscode.window.createTerminal({ name: settings.terminalName });
  lastTerminal = createdTerminal;
  return createdTerminal;
}

/**
 * @param {string} message
 * @param {ReturnType<typeof readSettings>} settings
 */
async function deliver(message, settings) {
  const terminal = resolveTerminal(settings);

  if (settings.delivery === 'clipboard') {
    await vscode.env.clipboard.writeText(message);
    terminal.show(false);
    await vscode.commands.executeCommand('workbench.action.terminal.paste');
    return;
  }

  terminal.show(true);
  if (settings.delivery === 'plain') {
    terminal.sendText(message, settings.submit);
    return;
  }
  // sendText(text, false) writes bytes without pressing Enter; the bracketed
  // paste markers make line-aware readers treat the text as pasted input.
  terminal.sendText(pastePayload(message, settings.submit), false);
}

function reportNothingSelected() {
  vscode.window.showInformationMessage('Add Selection to Terminal: nothing selected.');
}

function updateStatusBar() {
  if (!statusBar) return;
  if (staged.length === 0) {
    statusBar.hide();
    return;
  }
  statusBar.text = `$(clipboard) ${staged.length} staged`;
  statusBar.tooltip =
    `Send ${staged.length} staged context block${staged.length === 1 ? '' : 's'} to the terminal\n` +
    '(command: Send Staged Context to Terminal)';
  statusBar.show();
}

async function send() {
  const settings = readSettings();
  const blocks = collectBlocks(vscode.window.activeTextEditor, settings);
  if (blocks.length === 0) {
    reportNothingSelected();
    return;
  }
  await deliver(joinBlocks(blocks, settings.preamble), settings);
}

async function stage() {
  const settings = readSettings();
  const blocks = collectBlocks(vscode.window.activeTextEditor, settings);
  if (blocks.length === 0) {
    reportNothingSelected();
    return;
  }
  staged.push(...blocks);
  updateStatusBar();
}

async function sendStaged() {
  if (staged.length === 0) {
    vscode.window.showInformationMessage('Add Selection to Terminal: nothing staged.');
    return;
  }
  const settings = readSettings();
  const blocks = staged;
  staged = [];
  updateStatusBar();
  await deliver(joinBlocks(blocks, settings.preamble), settings);
}

function clearStaged() {
  staged = [];
  updateStatusBar();
}

async function copy() {
  const settings = readSettings();
  const blocks = collectBlocks(vscode.window.activeTextEditor, settings);
  if (blocks.length === 0) {
    reportNothingSelected();
    return;
  }
  await vscode.env.clipboard.writeText(joinBlocks(blocks, settings.preamble));
  vscode.window.setStatusBarMessage(
    `$(check) Copied ${blocks.length} context block${blocks.length === 1 ? '' : 's'}`,
    3000,
  );
}

function activate(context) {
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBar.command = COMMANDS.sendStaged;

  context.subscriptions.push(
    statusBar,
    vscode.commands.registerCommand(COMMANDS.send, send),
    vscode.commands.registerCommand(COMMANDS.stage, stage),
    vscode.commands.registerCommand(COMMANDS.sendStaged, sendStaged),
    vscode.commands.registerCommand(COMMANDS.clearStaged, clearStaged),
    vscode.commands.registerCommand(COMMANDS.copy, copy),
    vscode.window.onDidChangeActiveTerminal((terminal) => {
      if (terminal) lastTerminal = terminal;
    }),
    vscode.window.onDidCloseTerminal((terminal) => {
      if (terminal === lastTerminal) lastTerminal = undefined;
      if (terminal === createdTerminal) createdTerminal = undefined;
    }),
  );
}

function deactivate() {}

module.exports = { activate, deactivate };
