import { getDefaultResolvedBtxmlConfig } from "@btxml/config";
import {
  type BuiltinModelSet,
  SUPPORTED_BUILTIN_MODEL_SETS,
  getBuiltinNodeModel,
} from "@btxml/model";
import type { XmlClosedStartTag } from "@btxml/syntax";

type ChildCapabilityResponse = {
  capable: boolean;
};

export type ChildCapabilityRequest = (
  uri: string,
  tagName: string,
  attributes?: Readonly<Record<string, string | undefined>>,
) => Promise<ChildCapabilityResponse | undefined>;

export type ChildCapabilityFallbackResolver = (
  uri: string,
  tagName: string,
  attributes?: Readonly<Record<string, string | undefined>>,
) => Promise<boolean>;

let requestChildCapability: ChildCapabilityRequest = async () => undefined;

function isSupportedBuiltinModelSet(value: string): value is BuiltinModelSet {
  return (SUPPORTED_BUILTIN_MODEL_SETS as readonly string[]).includes(value);
}

export function getChildCapabilityFromBuiltinSets(tagName: string, builtinSets: readonly string[]) {
  if (tagName === "BehaviorTree") return true;
  if (tagName === "Control" || tagName === "Decorator") return true;
  if (tagName === "Action" || tagName === "Condition") return false;

  for (const builtinSet of new Set(builtinSets)) {
    if (!isSupportedBuiltinModelSet(builtinSet)) continue;
    const model = getBuiltinNodeModel(tagName, builtinSet);
    if (!model) continue;
    return model.kind === "Control" || model.kind === "Decorator";
  }

  return false;
}

function getDefaultFallbackChildCapability(tagName: string) {
  return getChildCapabilityFromBuiltinSets(
    tagName,
    getDefaultResolvedBtxmlConfig().models.builtins,
  );
}

let resolveFallbackChildCapability: ChildCapabilityFallbackResolver = async (_uri, tagName) =>
  getDefaultFallbackChildCapability(tagName);

export function setChildCapabilityRequest(request: ChildCapabilityRequest) {
  requestChildCapability = request;
}

export function resetChildCapabilityRequest() {
  requestChildCapability = async () => undefined;
}

export function setChildCapabilityFallbackResolver(resolver: ChildCapabilityFallbackResolver) {
  resolveFallbackChildCapability = resolver;
}

export function resetChildCapabilityFallbackResolver() {
  resolveFallbackChildCapability = async (_uri, tagName) =>
    getDefaultFallbackChildCapability(tagName);
}

export async function isChildCapableTag(
  uri: string,
  startTag: Pick<XmlClosedStartTag, "tagName" | "attributes">,
) {
  const result = await requestChildCapability(uri, startTag.tagName, startTag.attributes);
  return (
    result?.capable ??
    (await resolveFallbackChildCapability(uri, startTag.tagName, startTag.attributes))
  );
}

export function buildBlockSnippet(tagName: string) {
  return `\n  $0\n</${tagName}>`;
}
