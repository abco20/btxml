import { sourceRange } from "@btxml/foundation";
import { resolveNodeUsage } from "@btxml/semantic";
import { findElementAt, formatBtXml, inspectXmlCursor } from "@btxml/syntax";
import type { LanguageRequestContext } from "../context.js";
import { addAttributeEdit, insertAtLineStart, removeAttributeEdit } from "../edits.js";
import type { InternalCodeActionsInput } from "../internal-types.js";
import type { CodeAction, CodeActionsResult } from "../public-types.js";
import { fullDocumentRange } from "../ranges.js";

export function getCodeActions(
  context: LanguageRequestContext,
  input: InternalCodeActionsInput,
): CodeActionsResult {
  const diagnostics = input.diagnostics || context.diagnostics;
  const actions: CodeAction[] = [];
  const formatted = formatBtXml(input.document.text, context.config.formatter);
  if (formatted.ok && !formatted.skipped && formatted.text !== input.document.text) {
    actions.push({
      title: "Format document",
      kind: "source.format",
      edits: [{ range: fullDocumentRange(input.document), newText: formatted.text }],
    });
  }

  for (const diag of diagnostics) {
    if (!diag.range) continue;
    const inspect = inspectXmlCursor({
      document: input.document,
      parsed: context.parsed,
      position: diag.range.start,
    });
    if (diag.code === "BT101_MISSING_REQUIRED_PORT") {
      const targetOffset = Math.min(diag.range.start.offset + 1, diag.range.end.offset);
      const target = context.parsed?.root
        ? findElementAt(context.parsed.root, targetOffset) ||
          ("element" in inspect ? inspect.element : undefined)
        : "element" in inspect
          ? inspect.element
          : undefined;
      if (!target) continue;
      const usage = resolveNodeUsage(context.semantic, {
        element: target,
        documentRoot: context.parsed?.root,
        uri: input.document.uri,
        config: context.config,
        policy: context.nodeUsagePolicy,
      });
      const missing = usage.ports.find(
        (port) =>
          port.required &&
          !usage.portUsages.some(
            (binding) => binding.status === "resolved" && binding.name === port.name,
          ),
      );
      if (missing) {
        actions.push({
          title: `Add missing port ${missing.name}`,
          kind: "quickfix",
          diagnostics: [diag],
          edits: [addAttributeEdit(input.document, target, missing.name)],
        });
      }
    }
    if (
      diag.code === "BT102_UNKNOWN_PORT" &&
      "attribute" in inspect &&
      "element" in inspect &&
      inspect.attribute
    ) {
      const usage = inspect.element
        ? resolveNodeUsage(context.semantic, {
            element: inspect.element,
            documentRoot: context.parsed?.root,
            uri: input.document.uri,
            config: context.config,
            policy: context.nodeUsagePolicy,
          })
        : undefined;
      const unknown = usage?.portUsages.find(
        (candidate) =>
          candidate.status === "undeclared" && candidate.attribute === inspect.attribute,
      );
      const edit = unknown ? removeAttributeEdit(input.document, inspect.attribute) : undefined;
      if (edit && unknown) {
        actions.push({
          title: `Remove unknown port ${inspect.attribute.name}`,
          kind: "quickfix",
          diagnostics: [diag],
          edits: [edit],
        });
      }
    }
    if (diag.code === "BT002_MISSING_BTCPP_FORMAT" && context.parsed?.root) {
      const insertPos = input.document.positionAt(
        context.parsed.root.nameRange?.end.offset ||
          context.parsed.root.openTagRange.end.offset - 1,
      );
      actions.push({
        title: 'Add BTCPP_format="4" to <root>',
        kind: "quickfix",
        diagnostics: [diag],
        edits: [{ range: sourceRange(insertPos, insertPos), newText: ' BTCPP_format="4"' }],
      });
    }
    actions.push({
      title: `Suppress ${diag.code} for next line`,
      kind: "quickfix",
      diagnostics: [diag],
      edits: [
        insertAtLineStart(
          input.document,
          diag.range.start.line,
          `<!-- btxml-disable-next-line ${diag.code} reason: TODO -->\n`,
        ),
      ],
    });
  }

  return { actions };
}
