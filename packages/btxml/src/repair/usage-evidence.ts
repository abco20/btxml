import type { BtDocument, BtXmlElement } from "@btxml/syntax";
import type {
  NodeModelUsageEvidence,
  PortUsageEvidence,
  SignatureVariant,
  UsageImpact,
} from "./types.ts";

function isBlackboardReference(value: string): boolean {
  return /^\{[^}]+\}$/.test(value.trim());
}

function getUsageNodeId(element: BtXmlElement): string {
  if (element.name === "SubTree") {
    const idAttribute = element.attributes.find((attribute) => attribute.name === "ID");
    return idAttribute?.value ?? element.name;
  }
  return element.name;
}

function collectUsageForElement(
  element: BtXmlElement,
  nodeId: string,
  candidatePorts: string[],
  evidence: Map<string, PortUsageEvidence>,
): number {
  let count = 0;
  if (getUsageNodeId(element) === nodeId) {
    count++;
    for (const portName of candidatePorts) {
      let portEvidence = evidence.get(portName);
      if (!portEvidence) {
        portEvidence = {
          providedCount: 0,
          omittedCount: 0,
          literalValues: {},
          blackboardReferenceCount: 0,
        };
        evidence.set(portName, portEvidence);
      }
      const attribute = element.attributes.find((entry) => entry.name === portName);
      if (attribute) {
        portEvidence.providedCount++;
        if (isBlackboardReference(attribute.value)) {
          portEvidence.blackboardReferenceCount++;
        } else {
          portEvidence.literalValues[attribute.value] =
            (portEvidence.literalValues[attribute.value] || 0) + 1;
        }
      } else {
        portEvidence.omittedCount++;
      }
    }
  }
  for (const child of element.children) {
    if (child.kind === "element") {
      count += collectUsageForElement(child, nodeId, candidatePorts, evidence);
    }
  }
  return count;
}

export function collectNodeModelUsageEvidence(input: {
  nodeId: string;
  documents: BtDocument[];
  candidatePorts: string[];
}): NodeModelUsageEvidence {
  const evidence = new Map<string, PortUsageEvidence>();
  let totalUsages = 0;

  for (const document of input.documents) {
    if (!document.root) continue;
    for (const child of document.root.children) {
      if (child.kind === "element" && child.name === "TreeNodesModel") continue;
      if (child.kind === "element") {
        totalUsages += collectUsageForElement(child, input.nodeId, input.candidatePorts, evidence);
      }
    }
  }

  const byPort: Record<string, PortUsageEvidence> = {};
  for (const portName of input.candidatePorts) {
    byPort[portName] = evidence.get(portName) || {
      providedCount: 0,
      omittedCount: 0,
      literalValues: {},
      blackboardReferenceCount: 0,
    };
  }

  return {
    nodeId: input.nodeId,
    totalUsages,
    byPort,
  };
}

export function computeUsageImpact(input: {
  signature: SignatureVariant;
  usageEvidence: NodeModelUsageEvidence;
}): UsageImpact {
  const impact: UsageImpact = {
    signatureId: input.signature.id,
    newMissingRequiredPorts: [],
    removedPortsUsedByUsages: [],
    directionChanges: [],
  };

  const allPortNames = new Set(Object.keys(input.usageEvidence.byPort));

  for (const portName of allPortNames) {
    const evidence = input.usageEvidence.byPort[portName];
    const signaturePort = input.signature.definitions[0]?.model.ports.find(
      (port) => port.name === portName,
    );

    if (signaturePort?.required && evidence.omittedCount > 0) {
      impact.newMissingRequiredPorts.push({ portName, omittedCount: evidence.omittedCount });
    }

    if (!signaturePort && evidence.providedCount > 0) {
      impact.removedPortsUsedByUsages.push({ portName, providedCount: evidence.providedCount });
    }
  }

  return impact;
}
