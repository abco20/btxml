import { getDefaultResolvedBtxmlConfig } from "@btxml/config";

export function getSnippetFallbackBuiltinSets(
  config: { readonly models: { readonly builtins: readonly string[] } } | undefined,
) {
  return config ? config.models.builtins : getDefaultResolvedBtxmlConfig().models.builtins;
}
