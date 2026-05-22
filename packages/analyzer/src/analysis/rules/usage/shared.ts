import type { SourceRange } from "@btxml/foundation";
import {
  type BlackboardReference,
  type PortDef,
  type ResolvedTypeDefinition,
  type TypeRegistry,
  normalizeBuiltinTypeName,
  parsePortBlackboardReference,
  resolveTypeDefinition,
} from "@btxml/model";
import type { BtXmlElement } from "@btxml/syntax";
import AjvModule from "ajv";
import type { RuleContext } from "../../context.js";

type AjvLike = {
  compile(schema: unknown): (data: unknown) => boolean;
};

type CustomLiteralValidator = NonNullable<PortDef["validate"]>;

const AjvCtor = AjvModule as unknown as new () => AjvLike;
const ajv = new AjvCtor();
const nodeStatusLiterals = ["IDLE", "RUNNING", "SUCCESS", "FAILURE", "SKIPPED"] as const;

const builtinIntegerRanges = {
  int8_t: { min: -128n, max: 127n },
  "std::int8_t": { min: -128n, max: 127n },
  int16_t: { min: -32768n, max: 32767n },
  "std::int16_t": { min: -32768n, max: 32767n },
  int32: { min: -2147483648n, max: 2147483647n },
  int32_t: { min: -2147483648n, max: 2147483647n },
  "std::int32_t": { min: -2147483648n, max: 2147483647n },
  int64_t: { min: -9223372036854775808n, max: 9223372036854775807n },
  int64: { min: -9223372036854775808n, max: 9223372036854775807n },
  "std::int64_t": { min: -9223372036854775808n, max: 9223372036854775807n },
  int: { min: -2147483648n, max: 2147483647n },
  long: { min: -9223372036854775808n, max: 9223372036854775807n },
  short: { min: -32768n, max: 32767n },
  uint8_t: { min: 0n, max: 255n },
  "std::uint8_t": { min: 0n, max: 255n },
  uint16_t: { min: 0n, max: 65535n },
  "std::uint16_t": { min: 0n, max: 65535n },
  uint32: { min: 0n, max: 4294967295n },
  uint32_t: { min: 0n, max: 4294967295n },
  "std::uint32_t": { min: 0n, max: 4294967295n },
  uint64_t: { min: 0n, max: 18446744073709551615n },
  uint64: { min: 0n, max: 18446744073709551615n },
  "std::uint64_t": { min: 0n, max: 18446744073709551615n },
  uint: { min: 0n, max: 4294967295n },
  unsigned: { min: 0n, max: 4294967295n },
  "unsigned int": { min: 0n, max: 4294967295n },
  size_t: { min: 0n, max: 18446744073709551615n },
  "std::size_t": { min: 0n, max: 18446744073709551615n },
} as const satisfies Record<string, { min: bigint; max: bigint }>;

const signedIntegerTypes = new Set([
  "int8_t",
  "int16_t",
  "int32",
  "int32_t",
  "std::int32_t",
  "int64_t",
  "int64",
  "std::int64_t",
  "int",
  "long",
  "short",
  "std::int8_t",
  "std::int16_t",
]);

const unsignedIntegerTypes = new Set([
  "uint8_t",
  "uint16_t",
  "uint32",
  "uint32_t",
  "std::uint32_t",
  "uint64_t",
  "uint64",
  "std::uint64_t",
  "uint",
  "unsigned",
  "unsigned int",
  "std::uint8_t",
  "std::uint16_t",
  "size_t",
  "std::size_t",
]);

type LiteralValidationResult = {
  code: string;
  message: string;
  details?: {
    primaryLabel?: string;
    help?: string;
    notes?: readonly string[];
  };
};

export type LiteralValidationInput = {
  port: Pick<PortDef, "name" | "type" | "enum" | "validate">;
  value: string;
  registry: TypeRegistry;
  typeDefinition?: Pick<ResolvedTypeDefinition, "canonical" | "kind" | "validate">;
  allowRemap: boolean;
  diagnosticCode: string;
  customLiteralDiagnosticCode: string;
  portLabel: string;
};

type VectorLiteralItem = { kind: "string"; value: string } | { kind: "json"; value: unknown };

export function getElementChildren(element: BtXmlElement): BtXmlElement[] {
  return element.children.filter((child): child is BtXmlElement => child.kind === "element");
}

export function isStructuralElement(element: BtXmlElement) {
  return (
    element.name === "root" || element.name === "BehaviorTree" || element.name === "TreeNodesModel"
  );
}

export function hasElementChildren(element: BtXmlElement) {
  return element.children.some((child) => child.kind === "element");
}

export function reportLiteralValidation(
  context: RuleContext,
  input: LiteralValidationInput & { range?: SourceRange },
) {
  const result = validateLiteralValue(input);
  if (!result) return;

  context.report({
    code: result.code,
    message: result.message,
    range: input.range,
    details: result.details,
  });
}

export function validateLiteralValue(
  input: LiteralValidationInput,
): LiteralValidationResult | undefined {
  const remappedReference = getExactBlackboardReference(input.port.name, input.value);
  if (input.allowRemap && remappedReference !== undefined) {
    return undefined;
  }
  if (!input.allowRemap && remappedReference !== undefined) {
    return invalidLiteral(input.diagnosticCode, input.value, input.portLabel);
  }

  if (input.port.enum && !input.port.enum.includes(input.value)) {
    return invalidLiteral(input.diagnosticCode, input.value, input.portLabel);
  }

  const validator = input.port.validate ?? input.typeDefinition?.validate;
  if (validator) {
    return validateWithCustomValidator(input.registry, validator, input.value)
      ? undefined
      : invalidLiteral(input.diagnosticCode, input.value, input.portLabel);
  }

  const typeName = input.typeDefinition?.canonical ?? input.port.type;
  if (!typeName) return undefined;

  if (isBuiltinLiteralValid(typeName, input.value)) {
    return undefined;
  }

  if (isBuiltinType(typeName)) {
    return invalidLiteral(input.diagnosticCode, input.value, input.portLabel);
  }

  return {
    code: input.customLiteralDiagnosticCode,
    message: `literal value for custom type \`${typeName}\` requires a validator`,
    details: {
      primaryLabel: `literal value requires a validator for custom type \`${typeName}\``,
      help: `use a blackboard remap such as \`${input.portLabel}="{${input.port.name}}"\`, or define a validator in btxml.model-augment.json`,
    },
  };
}

export function getResolvedPortType(
  port: Pick<PortDef, "effectiveType" | "type">,
): string | undefined {
  return port.effectiveType ?? port.type;
}

export function getResolvedPortTypeDefinition(
  registry: TypeRegistry,
  port: Pick<PortDef, "effectiveType" | "type">,
): ResolvedTypeDefinition | undefined {
  return resolveTypeDefinition(registry, getResolvedPortType(port));
}

export function getExactRemappedKey(portName: string, rawValue: string): string | undefined {
  return getExactBlackboardReference(portName, rawValue)?.key;
}

export function getExactBlackboardReference(
  portName: string,
  rawValue: string,
): BlackboardReference | undefined {
  const parsed = parsePortBlackboardReference({
    portName,
    rawValue: rawValue.trim(),
  });
  return parsed.ok ? parsed.reference : undefined;
}

function invalidLiteral(code: string, literal: string, portLabel: string): LiteralValidationResult {
  return {
    code,
    message: `invalid value \`${literal}\` for port \`${portLabel}\``,
  };
}

function isBuiltinType(typeName: string): boolean {
  const normalizedTypeName = normalizeBuiltinTypeName(typeName) ?? typeName;
  return (
    getVectorElementType(typeName) !== undefined ||
    builtinScalarTypes.has(normalizedTypeName.toLowerCase())
  );
}

function isBuiltinLiteralValid(typeName: string, value: string): boolean {
  const vectorElementType = getVectorElementType(typeName);
  if (vectorElementType) {
    return validateVectorLiteral(vectorElementType, value);
  }

  const normalizedTypeName = (normalizeBuiltinTypeName(typeName) ?? typeName).toLowerCase();
  switch (normalizedTypeName) {
    case "std::string":
    case "string":
    case "bt::any":
    case "bt::anytypeallowed":
    case "bt::anytype":
    case "any":
      return true;
    case "bool":
      return (
        value === "0" ||
        value === "1" ||
        value === "true" ||
        value === "TRUE" ||
        value === "True" ||
        value === "false" ||
        value === "FALSE" ||
        value === "False"
      );
    case "float":
    case "double":
      return /^-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(value);
    case "bt::nodestatus":
    case "nodestatus":
      return nodeStatusLiterals.includes(value as (typeof nodeStatusLiterals)[number]);
    default:
      if (
        signedIntegerTypes.has(normalizedTypeName) ||
        unsignedIntegerTypes.has(normalizedTypeName)
      ) {
        return validateIntegerLiteral(normalizedTypeName, value);
      }
      return false;
  }
}

function getVectorElementType(typeName: string): string | undefined {
  const match = /^std::vector<\s*(.+?)\s*>$/.exec(typeName);
  return match?.[1];
}

function validateVectorLiteral(elementType: string, value: string): boolean {
  const items = parseVectorLiteral(value);
  if (!items) return false;
  return items.every((item) => validateVectorItem(elementType, item));
}

function validateVectorItem(elementType: string, item: VectorLiteralItem): boolean {
  if (item.kind === "string") {
    return isBuiltinLiteralValid(elementType, item.value);
  }

  const normalizedTypeName = (normalizeBuiltinTypeName(elementType) ?? elementType).toLowerCase();
  switch (normalizedTypeName) {
    case "std::string":
      return typeof item.value === "string";
    case "bool":
      return typeof item.value === "boolean";
    case "float":
    case "double":
      return typeof item.value === "number" && Number.isFinite(item.value);
    default:
      if (
        signedIntegerTypes.has(normalizedTypeName) ||
        unsignedIntegerTypes.has(normalizedTypeName)
      ) {
        return (
          typeof item.value === "number" &&
          Number.isInteger(item.value) &&
          validateIntegerLiteral(normalizedTypeName, String(item.value))
        );
      }
      return false;
  }
}

function validateIntegerLiteral(typeName: string, value: string): boolean {
  const range = builtinIntegerRanges[typeName as keyof typeof builtinIntegerRanges];
  if (!range) return false;

  if (signedIntegerTypes.has(typeName)) {
    if (!/^-?\d+$/.test(value)) return false;
  } else if (!/^\d+$/.test(value)) {
    return false;
  }

  try {
    const parsed = BigInt(value);
    return parsed >= range.min && parsed <= range.max;
  } catch {
    return false;
  }
}

function parseVectorLiteral(value: string): VectorLiteralItem[] | undefined {
  if (value.startsWith("json:")) {
    try {
      const parsed = JSON.parse(value.slice(5));
      if (!Array.isArray(parsed)) return undefined;
      return parsed.map((item) => ({ kind: "json", value: item }));
    } catch {
      return undefined;
    }
  }

  return value.split(";").map((item) => ({ kind: "string", value: item }));
}

function validateWithCustomValidator(
  registry: TypeRegistry,
  validator: CustomLiteralValidator,
  value: string,
): boolean {
  switch (validator.kind) {
    case "pattern":
      return new RegExp(`^(?:${validator.pattern})$`).test(value);
    case "enum":
      return validator.values.includes(value);
    case "tuple": {
      const items = value.split(validator.separator);
      if (items.length !== validator.items.length) return false;
      return items.every((item, index) => {
        const itemType = validator.items[index];
        if (!itemType) return false;

        return (
          validateLiteralValue({
            port: {
              name: `tuple[${index}]`,
              type: itemType,
            },
            value: item,
            registry,
            typeDefinition: resolveTypeDefinition(registry, itemType),
            allowRemap: false,
            diagnosticCode: "BT103_INVALID_PORT_VALUE_TYPE",
            customLiteralDiagnosticCode: "BT112_CUSTOM_LITERAL_REQUIRES_VALIDATOR",
            portLabel: `tuple[${index}]`,
          }) === undefined
        );
      });
    }
    case "json-schema": {
      try {
        const parsed = JSON.parse(value);
        return ajv.compile(validator.schema)(parsed) === true;
      } catch {
        return false;
      }
    }
  }
}

const builtinScalarTypes = new Set([
  "std::string",
  "string",
  "bool",
  "int8_t",
  "std::int8_t",
  "int16_t",
  "std::int16_t",
  "int",
  "int32",
  "int32_t",
  "std::int32_t",
  "int64_t",
  "int64",
  "std::int64_t",
  "long",
  "short",
  "uint8_t",
  "std::uint8_t",
  "uint16_t",
  "std::uint16_t",
  "uint",
  "uint32",
  "uint32_t",
  "std::uint32_t",
  "uint64_t",
  "uint64",
  "std::uint64_t",
  "size_t",
  "std::size_t",
  "unsigned",
  "unsigned int",
  "float",
  "double",
  "bt::nodestatus",
  "nodestatus",
  "bt::any",
  "bt::anytypeallowed",
  "bt::anytype",
  "any",
]);
