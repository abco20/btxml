import type { Diagnostic, WorkspaceEdit } from "@btxml/foundation";
import type { BtDocument, BtXmlElement } from "@btxml/syntax";

type TextEdit = WorkspaceEdit["edits"][number];

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

function point(offset: number) {
  return { line: 0, character: 0, offset };
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
  const node = root.children.find(
    (entry): entry is BtXmlElement => entry.kind === "element" && entry.name === "TreeNodesModel",
  );
  return node;
}

function collectMissingLocalModelsByUri(diagnostics: Diagnostic[]): Map<string, FixableModel[]> {
  const definitionsByUri = new Map<string, FixableModel[]>();

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

    const list = definitionsByUri.get(addFix.uri) ?? [];
    if (list.some((entry) => entry.id === addFix.nodeId)) continue;
    list.push(addFix.model);
    definitionsByUri.set(addFix.uri, list);
  }

  return definitionsByUri;
}

function createAppendToExistingTreeNodesModelEdit(
  uri: string,
  document: BtDocument,
  treeNodesModel: BtXmlElement,
  models: FixableModel[],
): WorkspaceEdit | undefined {
  if (!treeNodesModel.closeTagRange) return undefined;

  const parentIndent = getLineIndent(
    document.originalText,
    treeNodesModel.openTagRange.start.offset,
  );
  const childIndent = `${parentIndent}  `;
  const serialized = models
    .map((model) => serializeTreeNodeModelDefinition(model, childIndent))
    .join("\n");

  return {
    uri,
    edits: [
      {
        range: {
          start: point(treeNodesModel.closeTagRange.start.offset),
          end: point(treeNodesModel.closeTagRange.start.offset),
        },
        newText: `\n${serialized}\n${parentIndent}`,
      },
    ],
  };
}

function createInsertTreeNodesModelBlockEdit(
  uri: string,
  document: BtDocument,
  models: FixableModel[],
): WorkspaceEdit | undefined {
  if (document.root?.name !== "root" || !document.root.closeTagRange) {
    return undefined;
  }

  const rootIndent = getLineIndent(document.originalText, document.root.openTagRange.start.offset);
  const treeIndent = `${rootIndent}  `;
  const modelIndent = `${treeIndent}  `;
  const serialized = models
    .map((model) => serializeTreeNodeModelDefinition(model, modelIndent))
    .join("\n");

  return {
    uri,
    edits: [
      {
        range: {
          start: point(document.root.closeTagRange.start.offset),
          end: point(document.root.closeTagRange.start.offset),
        },
        newText: `\n\n${treeIndent}<TreeNodesModel>\n${serialized}\n${treeIndent}</TreeNodesModel>`,
      },
    ],
  };
}

function getMissingLocalModelFixes(input: {
  diagnostics: Diagnostic[];
  documents: BtDocument[];
}): WorkspaceEdit[] {
  const definitionsByUri = collectMissingLocalModelsByUri(input.diagnostics);

  const edits: WorkspaceEdit[] = [];

  for (const [uri, models] of definitionsByUri) {
    if (models.length === 0) continue;

    const document = input.documents.find((entry) => entry.uri === uri);
    if (!document?.root) continue;

    const treeNodesModel = getTreeNodesModelElement(document);
    if (treeNodesModel) {
      const appendEdit = createAppendToExistingTreeNodesModelEdit(
        uri,
        document,
        treeNodesModel,
        models,
      );
      if (appendEdit) {
        edits.push(appendEdit);
        continue;
      }
    }

    const insertEdit = createInsertTreeNodesModelBlockEdit(uri, document, models);
    if (insertEdit) edits.push(insertEdit);
  }

  return edits;
}

function mergeWorkspaceEdits(edits: WorkspaceEdit[]): WorkspaceEdit[] {
  const byUri = new Map<string, TextEdit[]>();

  for (const edit of edits) {
    const list = byUri.get(edit.uri) ?? [];
    list.push(...edit.edits);
    byUri.set(edit.uri, list);
  }

  return [...byUri.entries()].map(([uri, uriEdits]) => ({
    uri,
    edits: [...uriEdits].sort((left, right) => right.range.start.offset - left.range.start.offset),
  }));
}

function getBtcppInsertOffset(document: BtDocument): number | undefined {
  if (document.root?.name !== "root") return undefined;
  if (document.root.attributes.some((attribute) => attribute.name === "BTCPP_format"))
    return undefined;
  if (document.root.nameRange) return document.root.nameRange.end.offset;
  if (document.root.openTagRange) return document.root.openTagRange.start.offset + "<root".length;
  return undefined;
}

function getBtcppFormatFixes(input: {
  documents: BtDocument[];
  diagnostics: Diagnostic[];
}): WorkspaceEdit[] {
  const editsByUri = new Map<string, WorkspaceEdit>();

  for (const diagnostic of input.diagnostics) {
    if (diagnostic.code !== "BT002_MISSING_BTCPP_FORMAT") continue;
    const document = input.documents.find((doc) => doc.uri === diagnostic.uri);
    if (!document) continue;

    const insertOffset = getBtcppInsertOffset(document);
    if (insertOffset === undefined) continue;

    const existing = editsByUri.get(document.uri);
    const edit = {
      range: {
        start: { line: 0, character: 0, offset: insertOffset },
        end: { line: 0, character: 0, offset: insertOffset },
      },
      newText: ' BTCPP_format="4"',
    };

    editsByUri.set(
      document.uri,
      existing
        ? { uri: document.uri, edits: [...existing.edits, edit] }
        : { uri: document.uri, edits: [edit] },
    );
  }

  return [...editsByUri.values()];
}

function getDeleteDefinitionEdit(diagnostic: Diagnostic): WorkspaceEdit | undefined {
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

  return {
    uri: deleteFix.uri,
    edits: [{ range: deleteFix.range, newText: "" }],
  };
}

function getDeleteDuplicateDefinitionEdits(diagnostic: Diagnostic): WorkspaceEdit[] {
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

  const edits: WorkspaceEdit[] = [];
  for (const target of duplicateFix.delete ?? []) {
    if (!target.uri || !target.range) continue;
    edits.push({
      uri: target.uri,
      edits: [{ range: target.range, newText: "" }],
    });
  }
  return edits;
}

function getModelConventionFixes(input: {
  diagnostics: Diagnostic[];
}): WorkspaceEdit[] {
  const edits: WorkspaceEdit[] = [];

  for (const diagnostic of input.diagnostics) {
    const deleteDefinitionEdit = getDeleteDefinitionEdit(diagnostic);
    if (deleteDefinitionEdit) edits.push(deleteDefinitionEdit);
    edits.push(...getDeleteDuplicateDefinitionEdits(diagnostic));
  }

  return edits;
}

export function getSafeLintFixes(input: {
  documents: BtDocument[];
  diagnostics: Diagnostic[];
}): WorkspaceEdit[] {
  return mergeWorkspaceEdits([
    ...getBtcppFormatFixes(input),
    ...getModelConventionFixes({ diagnostics: input.diagnostics }),
    ...getMissingLocalModelFixes({ diagnostics: input.diagnostics, documents: input.documents }),
  ]);
}
