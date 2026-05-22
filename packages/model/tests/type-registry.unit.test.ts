import assert from "node:assert/strict";
import test from "node:test";
import {
  areTypesCompatible,
  createTypeRegistry,
  normalizeBuiltinTypeName,
  normalizeTypeName,
  resolveTypeDefinition,
} from "@btxml/model";

test("normalizeBuiltinTypeName canonicalizes built-in aliases", () => {
  assert.equal(normalizeBuiltinTypeName("string"), "std::string");
  assert.equal(normalizeBuiltinTypeName("std::string"), "std::string");
  assert.equal(normalizeBuiltinTypeName("std::int8_t"), "int8_t");
  assert.equal(normalizeBuiltinTypeName("int"), "int32");
  assert.equal(normalizeBuiltinTypeName("long"), "int64_t");
  assert.equal(normalizeBuiltinTypeName("unsigned int"), "uint32");
  assert.equal(normalizeBuiltinTypeName("size_t"), "uint64_t");
  assert.equal(normalizeBuiltinTypeName("std::size_t"), "uint64_t");
  assert.equal(normalizeBuiltinTypeName("NodeStatus"), "BT::NodeStatus");
  assert.equal(normalizeBuiltinTypeName("unknown"), undefined);
});

test("createTypeRegistry resolves canonical names and aliases from augmentations", () => {
  const registry = createTypeRegistry([
    {
      version: 1,
      types: {
        Pose2D: {
          kind: "opaque",
          canonical: "my_robot/Pose2D",
          aliases: ["my_robot::Pose2D", "robot_msgs::Pose2D"],
        },
      },
    },
  ]);

  assert.equal(normalizeTypeName(registry, "Pose2D"), "my_robot/Pose2D");
  assert.equal(normalizeTypeName(registry, "my_robot::Pose2D"), "my_robot/Pose2D");
  assert.equal(normalizeTypeName(registry, "robot_msgs::Pose2D"), "my_robot/Pose2D");

  const resolved = resolveTypeDefinition(registry, "Pose2D");
  assert.equal(resolved?.canonical, "my_robot/Pose2D");
  assert.deepEqual(
    new Set(resolved?.aliases),
    new Set(["Pose2D", "my_robot::Pose2D", "robot_msgs::Pose2D"]),
  );
});

test("areTypesCompatible honors wildcard any and symmetric compatibleWith", () => {
  const registry = createTypeRegistry([
    {
      version: 1,
      types: {
        Pose2D: {
          kind: "opaque",
          canonical: "my_robot/Pose2D",
        },
        StampedPose2D: {
          kind: "opaque",
          canonical: "my_robot/StampedPose2D",
          compatibleWith: ["Pose2D"],
        },
        MyAny: {
          kind: "any",
        },
      },
    },
  ]);

  assert.equal(areTypesCompatible(registry, "Pose2D", "my_robot/Pose2D"), true);
  assert.equal(areTypesCompatible(registry, "StampedPose2D", "Pose2D"), true);
  assert.equal(areTypesCompatible(registry, "Pose2D", "StampedPose2D"), true);
  assert.equal(areTypesCompatible(registry, "BT::AnyTypeAllowed", "Pose2D"), true);
  assert.equal(areTypesCompatible(registry, "MyAny", "std::string"), true);
  assert.equal(areTypesCompatible(registry, "Pose2D", "std::string"), false);
});
