import type { Diagnostic, TextEdit, WorkspaceEdit } from "@btxml/foundation";
import type { BtDocument, BtXmlElement } from "@btxml/syntax";
import type { FixCandidate } from "./types.ts";

type FixableModelPort = {
  direction: "input" | "output" | "inout";
  name: string;
  type?: string;
  defaultValue?: string;
  description?: string;
  enum?: readonly string[];
};

type FixableModel = {
  id: string;
  kind: "Action" | "Condition" | "Decorator" | "Control";
  ports: readonly FixableModelPort[];
};

function fingerprintDiagnostic(diagnostic: Diagnostic): string {
  const start = diagnostic.range?.start.offset ?? -1;
  const end = diagnostic.range?.end.offset ?? -1;
  return [diagnostic.code, diagnostic.uri, start, end, diagnostic.message].join(":");
}

function buildCandidate(input: {
  id: string;
  uri: string;
  diagnostic: Diagnostic;
  safety: "safe" | "unsafe";
  title: string;
  edits: TextEdit[];
  description?: string;
  metadata?: Record<string, unknown>;
}): FixCandidate {
  return {
    id: input.id,
    uri: input.uri,
    diagnosticCode: input.diagnostic.code,
    diagnosticRule: input.diagnostic.rule,
    diagnosticSeverity: input.diagnostic.severity,
    diagnosticMessage: input.diagnostic.message,
    safety: input.safety,
    title: input.title,
    description: input.description,
    edits: [...input.edits],
    source: {
      kind: "diagnostic",
      diagnosticFingerprint: fingerprintDiagnostic(input.diagnostic),
    },
    metadata: input.metadata,
  };
}

function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("'", "&apos;");
}

function portTagName(direction: FixableModelPort["direction"]) {
  if (direction === "output") return "output_port";
  if (direction === "inout") return "inout_port";
  return "input_port";
}

function serializePort(port: FixableModelPort, indent: string): string {
  const attributes = [
    `name="${escapeXmlAttribute(port.name)}"`,
    ...(port.type ? [`type="${escapeXmlAttribute(port.type)}"`] : []),
    ...(port.defaultValue ? [`default="${escapeXmlAttribute(port.defaultValue)}"`] : []),
    ...(port.description ? [`description="${escapeXmlAttribute(port.description)}"`] : []),
    ...(port.enum?.length ? [`enum="${escapeXmlAttribute(port.enum.map(String).join(";"))}"`] : []),
  ];
  return `${indent}<${portTagName(port.direction)} ${attributes.join(" ")}/>`;
}

export function serializeTreeNodeModelDefinition(model: FixableModel, indent = ""): string {
  const id = escapeXmlAttribute(model.id);
  if (model.ports.length === 0) {
    return `${indent}<${model.kind} ID="${id}"/>`;
  }

  const portIndent = `${indent}  `;
  const lines = [
    `${indent}<${model.kind} ID="${id}">`,
    ...model.ports.map((port) => serializePort(port, portIndent)),
    `${indent}</${model.kind}>`,
  ];
  return lines.join("\n");
}

function getLineIndent(text: string, offset: number): string {
  const lineStart = text.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
  let cursor = lineStart;
  while (cursor < text.length) {
    const ch = text[cursor];
    if (ch !== " " && ch !== "\t") break;
    cursor += 1;
  }
  return text.slice(lineStart, cursor);
}

function getTreeNodesModelElement(document: BtDocument): BtXmlElement | undefined {
  const root = document.root;
  if (!root) return undefined;
  if (root.name === "TreeNodesModel") return root;
  if (root.name !== "root") return undefined;
  return root.children.find(
    (entry): entry is BtXmlElement => entry.kind === "element" && entry.name === "TreeNodesModel",
  );
}

function getBtcppInsertOffset(document: BtDocument): number | undefined {
  if (document.root?.name !== "root") return undefined;
  if (document.root.attributes.some((attribute) => attribute.name === "BTCPP_format")) return undefined;
  if (document.root.nameRange) return document.root.nameRange.end.offset;
  if (document.root.openTagRange) return document.root.openTagRange.start.offset + "<root".length;
  return undefined;
}

function getBtcppFormatFixCandidates(input: {
  documents: BtDocument[];
  diagnostics: Diagnostic[];
}): FixCandidate[] {
  const editsByUri = new Map<string, TextEdit[]>();
  const sourceByUri = new Map<string, Diagnostic>();

  for (const diagnostic of input.diagnostics) {
    if (diagnostic.code !== "BT002_MISSING_BTCPP_FORMAT") continue;
    const document = input.documents.find((doc) => doc.uri === diagnostic.uri);
    if (!document) continue;

    const insertOffset = getBtcppInsertOffset(document);
    if (insertOffset === undefined) continue;

    const existing = editsByUri.get(document.uri) ?? [];
    existing.push({
      range: {
        start: { line: 0, character: 0, offset: insertOffset },
        end: { line: 0, character: 0, offset: insertOffset },
      },
      newText: ' BTCPP_format="4"',
    });
    editsByUri.set(document.uri, existing);
    sourceByUri.set(document.uri, diagnostic);
  }

  const candidates: FixCandidate[] = [];
  for (const [uri, edits] of editsByUri) {
    const diagnostic = sourceByUri.get(uri);
    if (!diagnostic) continue;
    candidates.push(
      buildCandidate({
        id: `BT002:${uri}`,
        uri,
        diagnostic,
        safety: "safe",
        title: 'Insert BTCPP_format="4"',
        edits,
      }),
    );
  }
  return candidates;
}

function getDeleteDefinitionCandidate(diagnostic: Diagnostic): FixCandidate | undefined {
  if (diagnostic.code !== "BT121_UNUSED_MODEL_DEFINITION") return undefined;
  const data = diagnostic.data;
  if (!data || typeof data !== "object") return undefined;

  const fix = (data as { fix?: unknown }).fix;
  if (!fix || typeof fix !== "object") return undefined;
  const deleteFix = fix as {
    kind?: string;
    uri?: string;
    range?: TextEdit["range"];
  };
  if (deleteFix.kind !== "delete-definition") return undefined;
  if (!deleteFix.uri || !deleteFix.range) return undefined;

  return buildCandidate({
    id: `BT121:${deleteFix.uri}:${deleteFix.range.start.offset}:${deleteFix.range.end.offset}`,
    uri: deleteFix.uri,
    diagnostic,
    safety: "unsafe",
    title: "Remove unused inline model definition",
    edits: [{ range: deleteFix.range, newText: "" }],
  });
}

function getDeleteDuplicateDefinitionCandidates(diagnostic: Diagnostic): FixCandidate[] {
  if (diagnostic.code !== "BT122_DUPLICATE_MODEL_DEFINITION") return [];
  const data = diagnostic.data;
  if (!data || typeof data !== "object") return [];

  const fix = (data as { fix?: unknown }).fix;
  if (!fix || typeof fix !== "object") return [];
  const duplicateFix = fix as {
    kind?: string;
    delete?: Array<{ uri?: string; range?: TextEdit["range"] }>;
  };
  if (duplicateFix.kind !== "delete-non-canonical-definitions") return [];

  const editsByUri = new Map<string, TextEdit[]>();
  for (const target of duplicateFix.delete ?? []) {
    if (!target.uri || !target.range) continue;
    const list = editsByUri.get(target.uri) ?? [];
    list.push({ range: target.range, newText: "" });
    editsByUri.set(target.uri, list);
  }

  const candidates: FixCandidate[] = [];
  for (const [uri, edits] of editsByUri) {
    const ranges = edits
      .map((edit) => `${edit.range.start.offset}-${edit.range.end.offset}`)
      .join(",");
    candidates.push(
      buildCandidate({
        id: `BT122:${uri}:${ranges}`,
        uri,
        diagnostic,
        safety: "safe",
        title: "Remove non-canonical duplicate model definitions",
        edits,
      }),
    );
  }

  return candidates;
}

function collectMissingLocalModelsByUri(diagnostics: Diagnostic[]):
  | Map<string, { models: FixableModel[]; diagnostic: Diagnostic }>
  | undefined {
  const definitionsByUri = new Map<string, { models: FixableModel[]; diagnostic: Diagnostic }>();

  for (const diagnostic of diagnostics) {
    if (diagnostic.code !== "BT123_MISSING_LOCAL_MODEL_DEFINITION") continue;

    const data = diagnostic.data;
    if (!data || typeof data !== "object") continue;
    const fix = (data as { fix?: unknown }).fix;
    if (!fix || typeof fix !== "object") continue;

    const addFix = fix as {
      kind?: string;
      uri?: string;
      model?: FixableModel;
      nodeId?: string;
    };
    if (addFix.kind !== "add-local-definition") continue;
    if (!addFix.uri || !addFix.model || !addFix.nodeId) continue;

    const entry = definitionsByUri.get(addFix.uri) ?? { models: [], diagnostic };
    if (!entry.models.some((model) => model.id === addFix.nodeId)) {
      entry.models.push(addFix.model);
    }
    definitionsByUri.set(addFix.uri, entry);
  }

  return definitionsByUri.size > 0 ? definitionsByUri : undefined;
}

function createAppendToExistingTreeNodesModelEdit(
  uri: string,
  document: BtDocument,
  treeNodesModel: BtXmlElement,
  models: FixableModel[],
): TextEdit | undefined {
  const parentIndent = getLineIndent(document.originalText, treeNodesModel.openTagRange.start.offset);
  const childIndent = `${parentIndent}  `;
  const serialized = models.map((model) => serializeTreeNodeModelDefinition(model, childIndent)).join("\n");

  if (treeNodesModel.closeTagRange) {
    return {
      range: {
        start: { line: 0, character: 0, offset: treeNodesModel.closeTagRange.start.offset },
        end: { line: 0, character: 0, offset: treeNodesModel.closeTagRange.start.offset },
      },
      newText: `\n${serialized}\n${parentIndent}`,
    };
  }

  if (treeNodesModel.selfClosing) {
    const openTagEnd = treeNodesModel.openTagRange.end.offset;
    if (openTagEnd < 2) return undefined;

    return {
      range: {
        start: { line: 0, character: 0, offset: openTagEnd - 2 },
        end: { line: 0, character: 0, offset: openTagEnd },
      },
      newText: `>\n${serialized}\n${parentIndent}</TreeNodesModel>`,
    };
  }

  return undefined;
}

function createInsertTreeNodesModelBlockEdit(
  document: BtDocument,
  models: FixableModel[],
): TextEdit | undefined {
  if (document.root?.name !== "root" || !document.root.closeTagRange) {
    return undefined;
  }

  const rootIndent = getLineIndent(document.originalText, document.root.openTagRange.start.offset);
  const treeIndent = `${rootIndent}  `;
  const modelIndent = `${treeIndent}  `;
  const serialized = models.map((model) => serializeTreeNodeModelDefinition(model, modelIndent)).join("\n");

  return {
    range: {
      start: { line: 0, character: 0, offset: document.root.closeTagRange.start.offset },
      end: { line: 0, character: 0, offset: document.root.closeTagRange.start.offset },
    },
    newText: `\n\n${treeIndent}<TreeNodesModel>\n${serialized}\n${treeIndent}</TreeNodesModel>`,
  };
}

function getMissingLocalModelFixCandidates(input: {
  diagnostics: Diagnostic[];
  documents: BtDocument[];
}): FixCandidate[] {
  const definitionsByUri = collectMissingLocalModelsByUri(input.diagnostics);
  if (!definitionsByUri) return [];

  const candidates: FixCandidate[] = [];

  for (const [uri, { models, diagnostic }] of definitionsByUri) {
    if (models.length === 0) continue;

    const document = input.documents.find((entry) => entry.uri === uri);
    if (!document?.root) continue;

    const treeNodesModel = getTreeNodesModelElement(document);
    let edit: TextEdit | undefined;
    if (treeNodesModel) {
      edit = createAppendToExistingTreeNodesModelEdit(uri, document, treeNodesModel, models);
    }
    if (!edit) {
      edit = createInsertTreeNodesModelBlockEdit(document, models);
    }
    if (!edit) continue;

    candidates.push(
      buildCandidate({
        id: `BT123:${uri}:${models
          .map((model) => model.id)
          .sort((left, right) => left.localeCompare(right))
          .join(",")}`,
        uri,
        diagnostic,
        safety: "unsafe",
        title: "Add missing local model definition",
        edits: [edit],
      }),
    );
  }

  return candidates;
}

export function getLintFixCandidates(input: {
  documents: BtDocument[];
  diagnostics: Diagnostic[];
}): FixCandidate[] {
  const modelConvention = input.diagnostics.flatMap((diagnostic) => {
    const bt121 = getDeleteDefinitionCandidate(diagnostic);
    return [...(bt121 ? [bt121] : []), ...getDeleteDuplicateDefinitionCandidates(diagnostic)];
  });

  return [
    ...getBtcppFormatFixCandidates(input),
    ...modelConvention,
    ...getMissingLocalModelFixCandidates({ diagnostics: input.diagnostics, documents: input.documents }),
  ];
}

export function mergeFixCandidatesToWorkspaceEdits(candidates: FixCandidate[]): WorkspaceEdit[] {
  const byUri = new Map<string, TextEdit[]>();

  for (const candidate of candidates) {
    const list = byUri.get(candidate.uri) ?? [];
    list.push(...candidate.edits);
    byUri.set(candidate.uri, list);
  }

  return [...byUri.entries()].map(([uri, edits]) => ({
    uri,
    edits: [...edits].sort((left, right) => right.range.start.offset - left.range.start.offset),
  }));
}
