// The Code tab's pure logic (no page, no server): everything here can be tested on its own. The work lives in
// small modules; this file lists what the rest of the Code tab may use.
export { LANGS, commentSyntax, detectLanguage, languageInfo } from "./codeLang.js";
export { MAX_COLOURED_LINE, TOKEN_TYPES, createHighlighter, tokenizeLine, tokenizeText } from "./codeTokens.js";
export {
  CASES, buildLineStarts, changeCase, convertIndent, deleteLines, duplicateLines, ensureFinalNewline, indentLines, joinLines, lineAt, lineCol, lineEnd, lineStart, moveLines, offsetOf,
  outdentLines, removeDuplicateLines, reverseLines, selectLine, sortLines, tabAtCaret, toggleBlockComment, toggleLineComment, touchedLines, trimTrailingWhitespace, urlDecode, urlEncode, wordAt,
} from "./codeLines.js";
export {
  autoClosePairs, backspaceEdit, closerDedentEdit, detectEol, detectIndent, findMatchingBracket, indentUnit, newLineEdit, shiftBookmarks, stepBookmark, textStats, toggleBookmark, typedCharEdit,
} from "./codeEditing.js";
export { compileSearch, expandReplacement, findAll, fuzzyScore, nextMatch, previousMatch, regexRisk, replaceAll, replacementAt, runRegexSandbox } from "./codeFind.js";
export { formatCode, formatCss, formatJson, minifyCode, minifyCss, minifyJson, reindentCode } from "./codeFormat.js";
export { formatHtml } from "./codeHtml.js";
export { extractSymbols, symbolAt } from "./codeSymbols.js";
export { parseInline, parseMarkdown } from "./codeMarkdown.js";
export { KEYMAP, commandForEvent, formatShortcut, matchShortcut, parseShortcut, shortcutText } from "./codeKeys.js";
export {
  PLACEHOLDERS, SUGGESTIONS, buildRunSequence, copyName, expandCommand, hasControlChars, needsConfirmation, pathParts, quoteArg, shellFor, suggestionsFor,
} from "./codeRun.js";
export { MAX_ITEMS, acceptEdit, buildIndex, complete, emptyIndex, matchScore, scopeAt, shouldAutoOpen, signatureAt } from "./codeComplete.js";
export { callAt, inCommentOrString, normalizeType, receiverAt, structLiteralAt, typeFromInit, wordBefore } from "./codeCompleteCtx.js";
export { parseParams } from "./codeCompleteIndex.js";
export { createSnippetSession, expandSnippet, snippetPreview } from "./codeSnippets.js";
export { SNIPPETS } from "./codeSnippetData.js";
