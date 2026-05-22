import { sourceRange } from "@btxml/foundation";
import { resolveNodeUsage } from "@btxml/semantic";
import { findElementAt, formatBtXml, inspectXmlCursor } from "@btxml/syntax";
import type { LanguageRequestContext } from "../context.js";
import {
  addAttributeEdit,
  addAttributeWithValueEdit,
  insertAtLineStart,
  removeAttributeEdit,
} from "../edits.js";
import type { InternalCodeActionsInput } from "../internal-types.js";
import type { CodeAction, CodeActionsResult } from "../public-types.js";
import { fullDocumentRange } from "../ranges.js";

type Diagnostic = NonNullable<InternalCodeActionsInput["diagnostics"]>[number];
type DiagnosticWithRange = Diagnostic & {
  range: NonNullable<Diagnostic["range"]>;
};

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
    if (!hasRange(diag)) continue;
    const inspect = inspectXmlCursor({
      document: input.document,
      parsed: context.parsed,
      position: diag.range.start,
    });
    const target = resolveTargetElement(context, input, diag, inspect);
    addMissingRequiredPortAction(actions, context, input, diag.code, diag, target);
    addOutputRemapAction(actions, context, input, diag.code, diag, inspect, target);
    addUnknownPortAction(actions, context, input, diag.code, diag, inspect);
    addMissingBtcppFormatAction(actions, context, input, diag.code, diag);
    addSuppressionAction(actions, input, diag);
  }

  return { actions };
}

type InspectResult = ReturnType<typeof inspectXmlCursor>;
type PortUsage = ReturnType<typeof resolveUsage>["portUsages"][number];
type ResolvedPortUsage = Extract<PortUsage, { status: "resolved" }>;

function hasRange(diag: Diagnostic): diag is DiagnosticWithRange {
  return !!diag.range;
}

function isResolvedPortUsage(binding: PortUsage): binding is ResolvedPortUsage {
  return binding.status === "resolved";
}

function resolveUsage(
  context: LanguageRequestContext,
  input: InternalCodeActionsInput,
  element: NonNullable<ReturnType<typeof inspectElement>>,
) {
  return resolveNodeUsage(context.semantic, {
    element,
    documentRoot: context.parsed?.root,
    uri: input.document.uri,
    config: context.config,
    policy: context.nodeUsagePolicy,
  });
}

function inspectElement(inspect: InspectResult) {
  return "element" in inspect ? inspect.element : undefined;
}

function resolveTargetElement(
  context: LanguageRequestContext,
  input: InternalCodeActionsInput,
  diag: DiagnosticWithRange,
  inspect: InspectResult,
) {
  const fallback = inspectElement(inspect);
  const root = context.parsed?.root;
  if (!root || !diag.range) return fallback;

  const targetOffset = Math.min(diag.range.start.offset + 1, diag.range.end.offset);
  return findElementAt(root, targetOffset) ?? fallback;
}

function addMissingRequiredPortAction(
  actions: CodeAction[],
  context: LanguageRequestContext,
  input: InternalCodeActionsInput,
  code: string,
  diag: DiagnosticWithRange,
  target: ReturnType<typeof resolveTargetElement>,
) {
  if (code !== "BT101_MISSING_REQUIRED_PORT") return;
  if (!target) return;

  const usage = resolveUsage(context, input, target);
  const missing = usage.ports.find(
    (port) =>
      port.required &&
      !usage.portUsages.some(
        (binding) => binding.status === "resolved" && binding.name === port.name,
      ),
  );
  if (!missing) return;

  actions.push({
    title: `Add missing port ${missing.name}`,
    kind: "quickfix",
    diagnostics: [diag],
    edits: [addAttributeEdit(input.document, target, missing.name)],
  });
}

function addOutputRemapAction(
  actions: CodeAction[],
  context: LanguageRequestContext,
  input: InternalCodeActionsInput,
  code: string,
  diag: DiagnosticWithRange,
  inspect: InspectResult,
  target: ReturnType<typeof resolveTargetElement>,
) {
  if (code !== "BT115_OUTPUT_PORT_REQUIRES_REMAP") return;
  if (!target) return;

  const outputPortName = /`([^`]+)`/.exec(diag.message)?.[1];
  const usage = resolveUsage(context, input, target);

  const attribute = "attribute" in inspect ? inspect.attribute : undefined;
  if (attribute) {
    const binding = usage.portUsages.find(
      (
        candidate,
      ): candidate is Extract<(typeof usage.portUsages)[number], { status: "resolved" }> =>
        isResolvedPortUsage(candidate) &&
        candidate.port.direction === "output" &&
        candidate.attribute === attribute &&
        (!outputPortName || candidate.port.name === outputPortName),
    );
    if (binding) {
      actions.push({
        title: `Remap output port ${binding.port.name}`,
        kind: "quickfix",
        diagnostics: [diag],
        edits: [
          {
            range: attribute.valueContentRange ?? attribute.valueRange,
            newText: `{${binding.port.name}}`,
          },
        ],
      });
      return;
    }
  }

  const missingOutputPort = usage.ports.find(
    (port) =>
      port.direction === "output" &&
      (!outputPortName || port.name === outputPortName) &&
      !usage.portUsages.some(
        (binding) => binding.status === "resolved" && binding.name === port.name,
      ),
  );
  if (!missingOutputPort) return;

  actions.push({
    title: `Remap output port ${missingOutputPort.name}`,
    kind: "quickfix",
    diagnostics: [diag],
    edits: [
      addAttributeWithValueEdit(
        input.document,
        target,
        missingOutputPort.name,
        `{${missingOutputPort.name}}`,
      ),
    ],
  });
}

function addUnknownPortAction(
  actions: CodeAction[],
  context: LanguageRequestContext,
  input: InternalCodeActionsInput,
  code: string,
  diag: DiagnosticWithRange,
  inspect: InspectResult,
) {
  if (code !== "BT102_UNKNOWN_PORT") return;
  if (!("attribute" in inspect && inspect.attribute)) return;
  const element = inspectElement(inspect);
  if (!element) return;

  const usage = resolveUsage(context, input, element);
  const unknown = usage.portUsages.find(
    (candidate) => candidate.status === "undeclared" && candidate.attribute === inspect.attribute,
  );
  if (!unknown) return;

  const edit = removeAttributeEdit(input.document, inspect.attribute);
  if (!edit) return;

  actions.push({
    title: `Remove unknown port ${inspect.attribute.name}`,
    kind: "quickfix",
    diagnostics: [diag],
    edits: [edit],
  });
}

function addMissingBtcppFormatAction(
  actions: CodeAction[],
  context: LanguageRequestContext,
  input: InternalCodeActionsInput,
  code: string,
  diag: DiagnosticWithRange,
) {
  if (code !== "BT002_MISSING_BTCPP_FORMAT") return;
  if (!context.parsed?.root) return;

  const insertPos = input.document.positionAt(
    context.parsed.root.nameRange?.end.offset || context.parsed.root.openTagRange.end.offset - 1,
  );
  actions.push({
    title: 'Add BTCPP_format="4" to <root>',
    kind: "quickfix",
    diagnostics: [diag],
    edits: [
      {
        range: sourceRange(insertPos, insertPos),
        newText: ' BTCPP_format="4"',
      },
    ],
  });
}

function addSuppressionAction(
  actions: CodeAction[],
  input: InternalCodeActionsInput,
  diag: DiagnosticWithRange,
) {
  if (!diag.range) return;
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
