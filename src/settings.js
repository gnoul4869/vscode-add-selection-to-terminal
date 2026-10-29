'use strict';

const vscode = require('vscode');

const SECTION = 'addSelectionToTerminal';
const PATH_STYLES = ['relative', 'absolute'];
const LINE_NUMBER_MODES = ['range', 'start', 'none'];
const DELIVERY_MODES = ['bracketedPaste', 'plain', 'clipboard'];

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function flag(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

function text(value, fallback) {
  return typeof value === 'string' && value ? value : fallback;
}

function count(value, fallback) {
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

/**
 * Settings are user input, so every value is validated against its schema and
 * falls back to the documented default.
 *
 * @returns {{
 *   pathStyle: string, lineNumbers: string, languageFence: boolean,
 *   lineGutter: boolean, maxSnippetLines: number, preamble: string,
 *   delivery: string, submit: boolean, terminalName: string
 * }}
 */
function readSettings() {
  const config = vscode.workspace.getConfiguration(SECTION);
  return {
    pathStyle: pick(config.get('pathStyle'), PATH_STYLES, 'relative'),
    lineNumbers: pick(config.get('lineNumbers'), LINE_NUMBER_MODES, 'range'),
    languageFence: flag(config.get('languageFence'), true),
    lineGutter: flag(config.get('lineGutter'), false),
    maxSnippetLines: count(config.get('maxSnippetLines'), 400),
    preamble: text(config.get('preamble'), ''),
    delivery: pick(config.get('delivery'), DELIVERY_MODES, 'bracketedPaste'),
    submit: flag(config.get('submit'), false),
    terminalName: text(config.get('terminalName'), 'AI Context'),
  };
}

module.exports = { readSettings };
