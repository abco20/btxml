import assert from "node:assert/strict";
import test from "node:test";
import { parseModelAugmentationFile } from "@btxml/model";

test("parseModelAugmentationFile: parses valid augmentation JSON", () => {
  const result = parseModelAugmentationFile(
    JSON.stringify({
      version: 1,
      types: {
        Pose2D: {
          kind: "opaque",
          canonical: "my_robot/Pose2D",
          validate: {
            kind: "tuple",
            separator: ";",
            items: ["double", "double", "double"],
          },
        },
      },
      augment: {
        MoveTo: {
          ports: {
            target: {
              typeRefinement: {
                from: "std::string",
                to: "Pose2D",
              },
              required: true,
              enum: ["a", "b"],
              description: "Target pose",
            },
          },
        },
      },
      script: {
        enums: {
          RED: 1,
          GREEN: 2,
        },
      },
    }),
    { path: "btxml.model-augment.json", uri: "file:///tmp/btxml.model-augment.json" },
  );

  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("expected parse success");
  assert.equal(result.data.version, 1);
  assert.equal(result.data.types?.Pose2D?.kind, "opaque");
  assert.equal(result.data.augment?.MoveTo?.ports?.target?.typeRefinement?.to, "Pose2D");
  assert.equal(result.data.script?.enums?.RED, 1);
});

test("parseModelAugmentationFile: reports invalid JSON", () => {
  const result = parseModelAugmentationFile('{"version": 1,', {
    path: "btxml.model-augment.json",
  });

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected parse failure");
  assert.equal(result.issues.length, 1);
  assert.equal(result.issues[0]?.kind, "json");
});

test("parseModelAugmentationFile: reports schema issues with paths", () => {
  const result = parseModelAugmentationFile(
    JSON.stringify({
      version: 1,
      augment: {
        MoveTo: {
          ports: {
            target: {
              required: "yes",
            },
          },
        },
      },
    }),
    { path: "btxml.model-augment.json" },
  );

  assert.equal(result.ok, false);
  if (result.ok) throw new Error("expected schema failure");
  assert.equal(result.issues[0]?.kind, "schema");
  assert.equal(result.issues[0]?.path, "augment.MoveTo.ports.target.required");
});
