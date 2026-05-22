import { type Diagnostic, DiagnosticSeverity, createDiagnostic } from "@btxml/foundation";
import type { BtDocument, BtXmlElement } from "@btxml/syntax";
import { makeBlackboardIdentity, parsePortBlackboardReference } from "./blackboard-reference.js";
import type {
  ExtractedBehaviorTreeDef,
  ExtractedBlackboardReference,
  ExtractedDocumentModel,
  ExtractedPortDef,
  ExtractedSubTreeReference,
  ExtractedTreeNodeModelDef,
} from "./extracted-types.js";
import type {
  AttributeValueRef,
  BehaviorTreeDef,
  BtDocumentModel,
  DocumentBlackboardReference,
  NodeModelSourceKind,
  PortDef,
  SubTreeReference,
  TreeNodeModelDef,
} from "./public-types.js";

const BTCPP_DIAGNOSTIC_CODES = {
  DuplicateNodeModelId: "BT006_DUPLICATE_NODE_MODEL_ID",
} as const;

export type BuildDocumentModelOptions = {
  readonly uri?: string;
  readonly path?: string;
};

export type BuildDocumentModelResult = {
  readonly model: BtDocumentModel;
  readonly diagnostics: readonly Diagnostic[];
};

function toDocumentModelKind(document: BtDocument): BtDocumentModel["kind"] {
  if (document.kind === "bt-document") return "bt-xml";
  if (document.kind === "model-document") return "model-xml";
  return "unknown";
}

function getAttr(element: BtXmlElement, name: string) {
  return element.attributes.find((attr) => attr.name === name);
}

function isAllowedTreeNodeKind(name: string): name is TreeNodeModelDef["kind"] {
  return (
    name === "Action" ||
    name === "Condition" ||
    name === "Control" ||
    name === "Decorator" ||
    name === "SubTree"
  );
}

function cloneAttributeValueRef(ref: AttributeValueRef | undefined): AttributeValueRef | undefined {
  if (!ref) return undefined;
  return {
    uri: ref.uri,
    range: ref.range,
    value: ref.value,
  };
}

function toPortSource(
  document: BtDocument,
  fallback: NodeModelSourceKind = "inline-tree-nodes-model",
): NodeModelSourceKind {
  if (document.kind === "model-document") return "external-tree-nodes-model";
  return fallback;
}

function collectBlackboardReferences(
  element: BtXmlElement,
  refs: ExtractedBlackboardReference[],
  uri: string,
) {
  for (const attr of element.attributes || []) {
    const valueRange = attr.valueContentRange ?? attr.valueRange;
    const rawValue = String(attr.value);

    const collectParsedReference = (input: {
      parsedRaw: string;
      parsedOffset: number;
    }) => {
      const parsed = parsePortBlackboardReference({
        portName: attr.name,
        rawValue: input.parsedRaw,
      });
      if (!parsed.ok) return;

      const referenceLength = parsed.reference.raw.length;
      refs.push({
        raw: parsed.reference.raw,
        key: parsed.reference.key,
        scope: parsed.reference.scope,
        identity: makeBlackboardIdentity(parsed.reference),
        syntax: parsed.reference.syntax,
        attributeName: attr.name,
        element,
        uri,
        range: {
          start: {
            ...valueRange.start,
            character: valueRange.start.character + input.parsedOffset,
            offset: valueRange.start.offset + input.parsedOffset,
          },
          end: {
            ...valueRange.start,
            character: valueRange.start.character + input.parsedOffset + referenceLength,
            offset: valueRange.start.offset + input.parsedOffset + referenceLength,
          },
        },
      });
    };

    const parsedWhole = parsePortBlackboardReference({
      portName: attr.name,
      rawValue,
    });
    if (parsedWhole.ok) {
      const parsedOffset = Math.max(0, rawValue.indexOf(parsedWhole.reference.raw));
      collectParsedReference({
        parsedRaw: parsedWhole.reference.raw,
        parsedOffset,
      });
      continue;
    }

    for (const match of rawValue.matchAll(/\{[^}]*\}/g)) {
      const parsedRaw = match[0];
      const parsedOffset = match.index ?? 0;
      collectParsedReference({ parsedRaw, parsedOffset });
    }
  }
  for (const child of element.children || []) {
    if (child.kind === "element") collectBlackboardReferences(child, refs, uri);
  }
}

function extractTreeNodesModel(
  element: BtXmlElement,
  uri: string,
  source: NodeModelSourceKind,
  editable: boolean,
): ExtractedTreeNodeModelDef[] {
  const models: ExtractedTreeNodeModelDef[] = [];
  for (const node of element.children || []) {
    if (node.kind !== "element" || !isAllowedTreeNodeKind(node.name)) continue;
    const idAttr = getAttr(node, "ID");
    if (!idAttr) continue;
    const ports: ExtractedPortDef[] = [];
    for (const port of node.children || []) {
      if (port.kind !== "element") continue;
      if (port.name !== "input_port" && port.name !== "output_port" && port.name !== "inout_port") {
        continue;
      }
      const nameAttr = getAttr(port, "name");
      const typeAttr = getAttr(port, "type");
      const defaultAttr = getAttr(port, "default") || getAttr(port, "default_value");
      const enumAttr = getAttr(port, "enum");
      const desc =
        (port.children || [])
          .filter((c) => c.kind === "text")
          .map((c) => c.text)
          .join("")
          .trim() || undefined;
      const direction =
        port.name === "input_port" ? "input" : port.name === "output_port" ? "output" : "inout";
      const required =
        (direction === "input" || direction === "inout") && defaultAttr === undefined;
      ports.push({
        source,
        direction,
        name: nameAttr ? nameAttr.value : "",
        type: typeAttr?.value || undefined,
        defaultValue: defaultAttr?.value || undefined,
        description: desc,
        required,
        element: port,
        uri,
        range: port.range,
        nameRange: nameAttr?.range,
        enum: enumAttr?.value ? enumAttr.value.split(";") : undefined,
      });
    }
    models.push({
      id: idAttr.value,
      kind: node.name,
      source,
      sourceMeta: {
        sourceKind: source,
        file: uri,
        range: node.range,
      },
      editable,
      ports,
      element: node,
      uri,
      range: node.range,
      elementRange: node.range,
      idRange: idAttr.range,
    });
  }
  return models;
}

function extractBehaviorTrees(root: BtXmlElement, uri: string): ExtractedBehaviorTreeDef[] {
  const trees: ExtractedBehaviorTreeDef[] = [];
  for (const child of root.children || []) {
    if (child.kind !== "element" || child.name !== "BehaviorTree") continue;
    const idAttr = getAttr(child, "ID");
    if (idAttr) {
      trees.push({
        id: idAttr.value,
        kind: "BehaviorTree",
        uri,
        element: child,
        range: child.range,
        elementRange: child.range,
        idRange: idAttr.range,
      });
    }
  }
  return trees;
}

function extractSubTreeReferences(root: BtXmlElement, uri: string): ExtractedSubTreeReference[] {
  const refs: ExtractedSubTreeReference[] = [];
  const walk = (node: BtXmlElement, parentBehaviorTreeId?: string, inTreeNodesModel = false) => {
    if (inTreeNodesModel) return;
    const currentBehaviorTreeId =
      node.name === "BehaviorTree"
        ? (getAttr(node, "ID")?.value ?? parentBehaviorTreeId)
        : parentBehaviorTreeId;
    const nextInTreeNodesModel = node.name === "TreeNodesModel";
    if (node.name === "SubTree") {
      const idAttr = getAttr(node, "ID");
      if (idAttr) {
        refs.push({
          id: idAttr.value,
          uri,
          element: node,
          range: node.range,
          elementRange: node.range,
          idRange: idAttr.range,
          parentBehaviorTreeId: currentBehaviorTreeId,
          attributes: node.attributes,
        });
      }
    }
    for (const child of node.children || []) {
      if (child.kind === "element") walk(child, currentBehaviorTreeId, nextInTreeNodesModel);
    }
  };
  if (root.name === "TreeNodesModel") return refs;
  for (const child of root.children || []) {
    if (child.kind === "element") walk(child);
  }
  return refs;
}

function stripBehaviorTreeAst(def: ExtractedBehaviorTreeDef): BehaviorTreeDef {
  return {
    id: def.id,
    kind: def.kind,
    uri: def.uri,
    range: def.range,
    elementRange: def.elementRange,
    idRange: def.idRange,
  };
}

function stripPortAst(def: ExtractedPortDef): PortDef {
  return {
    source: def.source,
    direction: def.direction,
    name: def.name,
    type: def.type,
    defaultValue: def.defaultValue,
    description: def.description,
    required: def.required,
    uri: def.uri,
    range: def.range,
    nameRange: def.nameRange,
    enum: def.enum ? [...def.enum] : undefined,
  };
}

function stripTreeNodeModelAst(def: ExtractedTreeNodeModelDef): TreeNodeModelDef {
  return {
    id: def.id,
    kind: def.kind,
    editable: def.editable,
    ports: def.ports.map(stripPortAst),
    source: def.source,
    sourceMeta: def.sourceMeta
      ? {
          sourceKind: def.sourceMeta.sourceKind,
          file: def.sourceMeta.file,
          range: def.sourceMeta.range,
        }
      : undefined,
    uri: def.uri,
    range: def.range,
    elementRange: def.elementRange,
    idRange: def.idRange,
  };
}

function stripSubTreeReferenceAst(def: ExtractedSubTreeReference): SubTreeReference {
  return {
    id: def.id,
    uri: def.uri,
    range: def.range,
    elementRange: def.elementRange,
    idRange: def.idRange,
    parentBehaviorTreeId: def.parentBehaviorTreeId,
  };
}

function stripBlackboardReferenceAst(
  def: ExtractedBlackboardReference,
): DocumentBlackboardReference {
  return {
    raw: def.raw,
    key: def.key,
    scope: def.scope,
    identity: def.identity,
    syntax: def.syntax,
    attributeName: def.attributeName,
    uri: def.uri,
    range: def.range,
  };
}

function toPublicDocumentModel(input: {
  uri: string;
  path?: string;
  isBtXml: boolean;
  kind: BtDocumentModel["kind"];
  behaviorTrees: readonly ExtractedBehaviorTreeDef[];
  subtreeReferences: readonly ExtractedSubTreeReference[];
  blackboardReferences: readonly ExtractedBlackboardReference[];
  treeNodesModel: readonly ExtractedTreeNodeModelDef[];
  genericSubTreePorts: readonly ExtractedPortDef[];
  rootMainTreeToExecute?: AttributeValueRef;
}): BtDocumentModel {
  return {
    uri: input.uri,
    path: input.path,
    isBtXml: input.isBtXml,
    kind: input.kind,
    behaviorTrees: input.behaviorTrees.map(stripBehaviorTreeAst),
    subtreeReferences: input.subtreeReferences.map(stripSubTreeReferenceAst),
    blackboardReferences: input.blackboardReferences.map(stripBlackboardReferenceAst),
    treeNodesModel: input.treeNodesModel.map(stripTreeNodeModelAst),
    genericSubTreePorts: input.genericSubTreePorts.map(stripPortAst),
    rootMainTreeToExecute: cloneAttributeValueRef(input.rootMainTreeToExecute),
  };
}

function addTreeNodeModelToCollections(input: {
  node: ExtractedTreeNodeModelDef;
  treeNodesModel: ExtractedTreeNodeModelDef[];
  genericSubTreePorts: ExtractedPortDef[];
}): boolean {
  if (input.node.kind === "SubTree" && input.node.id === "SubTree") {
    input.genericSubTreePorts.push(...input.node.ports);
    return true;
  }
  input.treeNodesModel.push(input.node);
  return false;
}

function createDuplicateNodeModelDiagnostic(model: ExtractedTreeNodeModelDef): Diagnostic {
  return createDiagnostic(
    BTCPP_DIAGNOSTIC_CODES.DuplicateNodeModelId,
    DiagnosticSeverity.Error,
    `duplicate node model ID \`${model.id}\``,
    model.idRange || model.range,
    model.uri,
    {
      primaryLabel: "this node model ID is already defined in the same model source",
      help: "merge the duplicate definitions or rename one of them",
    },
  );
}

function extractDocumentModel(
  document: BtDocument,
  options?: BuildDocumentModelOptions,
): { extracted: ExtractedDocumentModel; diagnostics: readonly Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const uri = options?.uri || document.uri;
  const root = document.root;
  const isBtXml = document.isBtXml;
  const kind = toDocumentModelKind(document);
  const source = toPortSource(document);
  const editable =
    (Boolean(options?.path ?? document.path) || uri === "") && document.kind === "model-document"
      ? true
      : document.kind !== "model-document";
  const behaviorTrees =
    root && document.kind !== "model-document" ? extractBehaviorTrees(root, uri) : [];
  const treeNodesModel: ExtractedTreeNodeModelDef[] = [];
  const genericSubTreePorts: ExtractedPortDef[] = [];
  const treeNodesModelElements = root
    ? root.name === "TreeNodesModel"
      ? [root]
      : root.children.filter(
          (child): child is BtXmlElement =>
            child.kind === "element" && child.name === "TreeNodesModel",
        )
    : [];
  for (const block of treeNodesModelElements) {
    const blockModels = extractTreeNodesModel(block, uri, source, editable);
    const seenInBlock = new Map<string, ExtractedTreeNodeModelDef>();
    for (const model of blockModels) {
      if (
        addTreeNodeModelToCollections({
          node: model,
          treeNodesModel,
          genericSubTreePorts,
        })
      ) {
        continue;
      }
      if (seenInBlock.has(model.id)) diagnostics.push(createDuplicateNodeModelDiagnostic(model));
      else seenInBlock.set(model.id, model);
    }
  }
  const subtreeReferences = root ? extractSubTreeReferences(root, uri) : [];
  const blackboardReferences = root
    ? (() => {
        const refs: ExtractedBlackboardReference[] = [];
        collectBlackboardReferences(root, refs, uri);
        return refs;
      })()
    : [];
  const rootMainTreeToExecute = root ? getAttr(root, "main_tree_to_execute") : undefined;
  const publicModel = toPublicDocumentModel({
    uri,
    path: options?.path ?? document.path,
    isBtXml,
    kind,
    behaviorTrees,
    subtreeReferences,
    blackboardReferences,
    treeNodesModel,
    genericSubTreePorts,
    rootMainTreeToExecute: rootMainTreeToExecute
      ? {
          uri,
          range: rootMainTreeToExecute.range,
          value: rootMainTreeToExecute.value,
        }
      : undefined,
  });

  return {
    extracted: {
      publicModel,
      extractedBehaviorTrees: behaviorTrees,
      extractedTreeNodesModel: treeNodesModel,
      extractedSubTreeReferences: subtreeReferences,
      extractedBlackboardReferences: blackboardReferences,
    },
    diagnostics,
  };
}

export function buildDocumentModelResult(
  document: BtDocument,
  options?: BuildDocumentModelOptions,
): BuildDocumentModelResult {
  const { extracted, diagnostics } = extractDocumentModel(document, options);
  return {
    model: extracted.publicModel,
    diagnostics,
  };
}

export function buildDocumentModel(
  document: BtDocument,
  options?: BuildDocumentModelOptions,
): BuildDocumentModelResult {
  return buildDocumentModelResult(document, options);
}
