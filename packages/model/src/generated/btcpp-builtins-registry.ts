// Generated from packages/model/resources/btcpp/versions.json.
// Do not edit manually. Run `pnpm generate:btcpp-builtins --all`.

import {
  btcppV4_6_2BuiltinModels,
  btcppV4_6_2GenericSubTreeModel,
} from "./btcpp-v4.6.2-builtins.js";
import {
  btcppV4_8_2BuiltinModels,
  btcppV4_8_2GenericSubTreeModel,
} from "./btcpp-v4.8.2-builtins.js";
import {
  btcppV4_9_0BuiltinModels,
  btcppV4_9_0GenericSubTreeModel,
} from "./btcpp-v4.9.0-builtins.js";

export const generatedBtcppBuiltinVersions = ["4.6.2", "4.8.2", "4.9.0"] as const;
export type GeneratedBtcppBuiltinVersion = (typeof generatedBtcppBuiltinVersions)[number];
export type GeneratedBuiltinModelSet = "btcpp-v4.6.2" | "btcpp-v4.8.2" | "btcpp-v4.9.0";

export const generatedDefaultBtcppBuiltinVersion = "4.9.0" as const;

export const generatedBtcppBuiltinCatalogs = {
  "4.6.2": {
    models: btcppV4_6_2BuiltinModels,
    genericSubTreeModel: btcppV4_6_2GenericSubTreeModel,
  },
  "4.8.2": {
    models: btcppV4_8_2BuiltinModels,
    genericSubTreeModel: btcppV4_8_2GenericSubTreeModel,
  },
  "4.9.0": {
    models: btcppV4_9_0BuiltinModels,
    genericSubTreeModel: btcppV4_9_0GenericSubTreeModel,
  },
} as const;
