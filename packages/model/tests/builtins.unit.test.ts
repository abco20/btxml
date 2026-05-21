import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_BTCPP_V4_MODEL_SET,
  SUPPORTED_BUILTIN_MODEL_SETS,
  getBuiltinNodeModel,
  getGenericSubTreePorts,
  getInvalidPortNameReason,
  isReservedAttribute,
  isReservedPortName,
  listBuiltinNodeModels,
  listChildCapableBuiltinNodeIds,
} from "@btxml/model";

test("Parallel ports match BT.CPP export", () => {
  const parallel = getBuiltinNodeModel("Parallel");
  assert.ok(parallel);
  const ports = new Map((parallel?.ports ?? []).map((p) => [p.name, p]));
  assert.equal(ports.get("success_count")?.direction, "input");
  assert.equal(ports.get("success_count")?.type, "int");
  assert.equal(ports.get("success_count")?.defaultValue, "-1");
  assert.equal(ports.get("failure_count")?.direction, "input");
  assert.equal(ports.get("failure_count")?.type, "int");
  assert.equal(ports.get("failure_count")?.defaultValue, "1");
  assert.equal(ports.has("success_threshold"), false);
  assert.equal(ports.has("failure_threshold"), false);
});

test("SetBlackboard ports match BT.CPP export", () => {
  const node = getBuiltinNodeModel("SetBlackboard");
  assert.ok(node);
  const ports = new Map((node?.ports ?? []).map((p) => [p.name, p]));
  assert.equal(ports.get("output_key")?.direction, "inout");
  assert.equal(ports.get("output_key")?.type, "BT::AnyTypeAllowed");
  assert.equal(ports.get("value")?.direction, "input");
  assert.equal(ports.get("value")?.type, "BT::AnyTypeAllowed");
});

test("Delay description is preserved", () => {
  const delay = getBuiltinNodeModel("Delay");
  assert.ok(delay);
  const port = (delay?.ports ?? []).find((p) => p.name === "delay_msec");
  assert.ok(port);
  assert.equal(port.description, "Tick the child after a few milliseconds");
});

test("LoopString uses the default versioned builtin type", () => {
  const node = getBuiltinNodeModel("LoopString");
  assert.ok(node);
  const port = (node?.ports ?? []).find((p) => p.name === "queue");
  assert.ok(port);
  assert.equal(port.type, "BT::AnyTypeAllowed");
});

test("generated SubTree split: generic model exists and normal builtins do not contain SubTree", async () => {
  const mod = await import("@btxml/model/generated/btcpp-v4-builtins.js");
  assert.equal(mod.btcppV4GenericSubTreeModel.id, "SubTree");
  assert.equal(mod.btcppV4GenericSubTreeModel.kind, "SubTree");
  assert.ok(
    (mod.btcppV4GenericSubTreeModel.ports as readonly { name: string }[]).some(
      (p) => p.name === "_autoremap",
    ),
  );
  assert.ok(
    !mod.btcppV4BuiltinModels.some(
      (m: { id: string; kind: string }) => m.id === "SubTree" && m.kind === "SubTree",
    ),
  );
});

test("isReservedAttribute recognises all BT.CPP v4 precondition and postcondition attributes", () => {
  // precondition attributes
  assert.equal(isReservedAttribute("_skipIf"), true);
  assert.equal(isReservedAttribute("_failureIf"), true);
  assert.equal(isReservedAttribute("_successIf"), true);
  assert.equal(isReservedAttribute("_while"), true);
  // postcondition attributes
  assert.equal(isReservedAttribute("_onSuccess"), true);
  assert.equal(isReservedAttribute("_onFailure"), true);
  assert.equal(isReservedAttribute("_onHalted"), true);
  assert.equal(isReservedAttribute("_post"), true);
  // structural attributes
  assert.equal(isReservedAttribute("ID"), true);
  assert.equal(isReservedAttribute("name"), true);
  assert.equal(isReservedAttribute("_name"), true);
  assert.equal(isReservedAttribute("_autoremap"), true);
  // normal port names are not reserved
  assert.equal(isReservedAttribute("goal"), false);
  assert.equal(isReservedAttribute("target"), false);
});

test("port-name helpers reject reserved and invalid names used in model definitions", () => {
  assert.equal(isReservedPortName("_autoremap"), true);
  assert.equal(isReservedPortName("_description"), true);
  assert.equal(isReservedPortName("goal"), false);

  assert.equal(getInvalidPortNameReason("request.name"), "port names must not contain `.`");
  assert.equal(getInvalidPortNameReason("1target"), "port names must not start with a digit");
  assert.equal(getInvalidPortNameReason("ID"), "`ID` is a reserved attribute name");
  assert.equal(getInvalidPortNameReason("bad name"), "port names must not contain whitespace");
  assert.equal(getInvalidPortNameReason("target"), undefined);
});

test("generated BT.CPP v4 models include known exported models", async () => {
  const mod = await import("@btxml/model/generated/btcpp-v4-builtins.js");
  const ids = new Set(mod.btcppV4BuiltinModels.map((m: { id: string }) => m.id));
  assert.ok(ids.has("AlwaysFailure"));
  assert.ok(ids.has("AlwaysSuccess"));
  assert.ok(ids.has("Parallel"));
  assert.ok(ids.has("SetBlackboard"));
  assert.ok(ids.has("Script"));
  assert.ok(ids.has("ScriptCondition"));
  assert.ok(ids.has("Switch6"));
});

test("btcpp-v4 resolves to the default versioned model set", () => {
  assert.equal(DEFAULT_BTCPP_V4_MODEL_SET, "btcpp-v4.9.0");

  const legacy = getBuiltinNodeModel("Sequence", "btcpp-v4");
  const versioned = getBuiltinNodeModel("Sequence", "btcpp-v4.9.0");
  assert.deepEqual(legacy, versioned);

  const legacyPorts = getGenericSubTreePorts("btcpp-v4");
  const versionedPorts = getGenericSubTreePorts("btcpp-v4.9.0");
  assert.deepEqual(legacyPorts, versionedPorts);
  assert.ok(legacyPorts.some((port) => port.name === "_autoremap"));
});

test("versioned model set is accepted by listBuiltinNodeModels", () => {
  const models = listBuiltinNodeModels("btcpp-v4.9.0");
  assert.ok(models.some((model) => model.id === "Sequence"));
  assert.ok(models.some((model) => model.id === "Fallback"));
  assert.ok(models.some((model) => model.id === "Parallel"));
  assert.ok(models.some((model) => model.id === "TryCatch"));
});

test("supported builtin model sets include versioned entries", () => {
  assert.deepEqual(SUPPORTED_BUILTIN_MODEL_SETS, [
    "btcpp-v4",
    "btcpp-v4.6.2",
    "btcpp-v4.8.2",
    "btcpp-v4.9.0",
  ]);
});

test("child-capable builtin ids come from generated builtin catalog", () => {
  const ids = new Set(listChildCapableBuiltinNodeIds());
  assert.equal(ids.has("Sequence"), true);
  assert.equal(ids.has("Fallback"), true);
  assert.equal(ids.has("RetryUntilSuccessful"), true);
  assert.equal(ids.has("AlwaysSuccess"), false);
  assert.equal(ids.has("SubTree"), false);
});
