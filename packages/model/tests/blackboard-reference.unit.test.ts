import assert from "node:assert/strict";
import test from "node:test";
import {
  formatBlackboardReference,
  formatScriptBlackboardIdentifier,
  makeBlackboardIdentity,
  parsePortBlackboardReference,
  parseScriptBlackboardIdentifier,
} from "@btxml/model";

test("parsePortBlackboardReference parses valid port remaps", () => {
  assert.deepEqual(parsePortBlackboardReference({ portName: "value", rawValue: "{foo}" }), {
    ok: true,
    reference: {
      scope: "local",
      key: "foo",
      raw: "{foo}",
      syntax: "braced",
    },
  });

  assert.deepEqual(parsePortBlackboardReference({ portName: "value", rawValue: "{@foo}" }), {
    ok: true,
    reference: {
      scope: "global",
      key: "foo",
      raw: "{@foo}",
      syntax: "braced",
    },
  });

  assert.deepEqual(parsePortBlackboardReference({ portName: "value", rawValue: "{=}" }), {
    ok: true,
    reference: {
      scope: "local",
      key: "value",
      raw: "{=}",
      syntax: "shorthand",
    },
  });

  assert.deepEqual(parsePortBlackboardReference({ portName: "value", rawValue: "=" }), {
    ok: true,
    reference: {
      scope: "local",
      key: "value",
      raw: "=",
      syntax: "shorthand",
    },
  });

  assert.deepEqual(parsePortBlackboardReference({ portName: "value", rawValue: " {@foo} " }), {
    ok: true,
    reference: {
      scope: "global",
      key: "foo",
      raw: "{@foo}",
      syntax: "braced",
    },
  });

  assert.deepEqual(parsePortBlackboardReference({ portName: "value", rawValue: "{ @foo }" }), {
    ok: true,
    reference: {
      scope: "global",
      key: "foo",
      raw: "{ @foo }",
      syntax: "braced",
    },
  });

  assert.deepEqual(parsePortBlackboardReference({ portName: "value", rawValue: " {=} " }), {
    ok: true,
    reference: {
      scope: "local",
      key: "value",
      raw: "{=}",
      syntax: "shorthand",
    },
  });
});

test("parsePortBlackboardReference rejects invalid port remaps", () => {
  for (const rawValue of ["{@}", "{ @ }", "{@@foo}", "{foo@bar}", "{", "}", "{foo", "foo}"]) {
    assert.equal(parsePortBlackboardReference({ portName: "value", rawValue }).ok, false, rawValue);
  }
});

test("parseScriptBlackboardIdentifier parses valid global identifiers", () => {
  assert.deepEqual(parseScriptBlackboardIdentifier({ rawName: "@foo" }), {
    ok: true,
    reference: {
      scope: "global",
      key: "foo",
      raw: "@foo",
      syntax: "script",
    },
  });
});

test("parseScriptBlackboardIdentifier rejects invalid global identifiers", () => {
  for (const rawName of ["@", "@@foo", "@1foo", "@foo@bar"]) {
    assert.equal(parseScriptBlackboardIdentifier({ rawName }).ok, false, rawName);
  }
});

test("blackboard formatter helpers preserve scope", () => {
  assert.equal(formatBlackboardReference({ scope: "local", key: "foo" }), "{foo}");
  assert.equal(formatBlackboardReference({ scope: "global", key: "foo" }), "{@foo}");
  assert.equal(formatScriptBlackboardIdentifier({ scope: "local", key: "foo" }), "foo");
  assert.equal(formatScriptBlackboardIdentifier({ scope: "global", key: "foo" }), "@foo");
  assert.equal(makeBlackboardIdentity({ scope: "local", key: "foo" }), "local:foo");
  assert.equal(makeBlackboardIdentity({ scope: "global", key: "foo" }), "global:foo");
});
