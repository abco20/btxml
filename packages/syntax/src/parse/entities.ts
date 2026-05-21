import { DiagnosticSeverity } from "@btxml/foundation";
import type { SourcePosition } from "@btxml/foundation";
import { positionAt } from "../position.js";

type AddDiagnostic = (
  code: string,
  severity: DiagnosticSeverity,
  message: string,
  start: SourcePosition,
  end: SourcePosition,
  details?: { primaryLabel?: string; help?: string; notes?: string[] },
) => void;

export function validateXmlEntities(
  rawValue: string,
  baseOffset: number,
  text: string,
  addDiagnostic: AddDiagnostic,
): void {
  for (let i = 0; i < rawValue.length; i++) {
    if (rawValue[i] !== "&") continue;

    const remaining = rawValue.slice(i + 1);
    const offset = i;

    if (remaining.startsWith("amp;")) {
      i += 4;
      continue;
    }
    if (remaining.startsWith("lt;")) {
      i += 3;
      continue;
    }
    if (remaining.startsWith("gt;")) {
      i += 3;
      continue;
    }
    if (remaining.startsWith("quot;")) {
      i += 5;
      continue;
    }
    if (remaining.startsWith("apos;")) {
      i += 5;
      continue;
    }

    if (remaining.startsWith("#")) {
      let j = 1;

      if (remaining[j] === "x" || remaining[j] === "X") {
        j++;
        let hex = "";
        while (j < remaining.length && /[0-9a-fA-F]/.test(remaining[j])) {
          hex += remaining[j];
          j++;
        }
        if (j < remaining.length && remaining[j] === ";") {
          j++;
          const entity = rawValue.slice(offset, offset + 1 + j);
          const start = positionAt(text, baseOffset + offset);
          const end = positionAt(text, baseOffset + offset + entity.length);
          if (hex) {
            const cp = Number.parseInt(hex, 16);
            if (cp > 0 && cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff)) {
              i += j - 1;
              continue;
            }
            addDiagnostic(
              "XML014_INVALID_NUMERIC_ENTITY",
              DiagnosticSeverity.Error,
              `invalid numeric XML entity \`${entity}\``,
              start,
              end,
              {
                primaryLabel: "this numeric entity is outside the valid Unicode range",
                help: "replace it with a valid Unicode code point or normal text",
              },
            );
            i += j - 1;
            continue;
          }
          addDiagnostic(
            "XML001_INVALID_SYNTAX",
            DiagnosticSeverity.Error,
            `malformed numeric XML entity \`${entity}\``,
            start,
            end,
            {
              primaryLabel: "this entity is incomplete",
              help: "use a valid numeric entity such as `&#10;` or escape the ampersand as `&amp;`",
            },
          );
          i += j - 1;
          continue;
        }
        const entity = rawValue.slice(offset, offset + 1 + j);
        const start = positionAt(text, baseOffset + offset);
        const end = positionAt(text, baseOffset + offset + entity.length);
        addDiagnostic(
          "XML001_INVALID_SYNTAX",
          DiagnosticSeverity.Error,
          `malformed numeric XML entity \`${entity}\``,
          start,
          end,
          {
            primaryLabel: "this entity is incomplete",
            help: "use a valid numeric entity such as `&#10;` or escape the ampersand as `&amp;`",
          },
        );
        i += j - 1;
        continue;
      }
      let dec = "";
      while (j < remaining.length && /[0-9]/.test(remaining[j])) {
        dec += remaining[j];
        j++;
      }
      if (j < remaining.length && remaining[j] === ";") {
        j++;
        const entity = rawValue.slice(offset, offset + 1 + j);
        const start = positionAt(text, baseOffset + offset);
        const end = positionAt(text, baseOffset + offset + entity.length);
        if (dec) {
          const cp = Number.parseInt(dec, 10);
          if (cp > 0 && cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff)) {
            i += j - 1;
            continue;
          }
          addDiagnostic(
            "XML014_INVALID_NUMERIC_ENTITY",
            DiagnosticSeverity.Error,
            `invalid numeric XML entity \`${entity}\``,
            start,
            end,
            {
              primaryLabel: "this numeric entity is outside the valid Unicode range",
              help: "replace it with a valid Unicode code point or normal text",
            },
          );
          i += j - 1;
          continue;
        }
        addDiagnostic(
          "XML001_INVALID_SYNTAX",
          DiagnosticSeverity.Error,
          `malformed numeric XML entity \`${entity}\``,
          start,
          end,
          {
            primaryLabel: "this entity is incomplete",
            help: "use a valid numeric entity such as `&#10;` or escape the ampersand as `&amp;`",
          },
        );
        i += j - 1;
        continue;
      }
      const entity = rawValue.slice(offset, offset + 1 + j);
      const start = positionAt(text, baseOffset + offset);
      const end = positionAt(text, baseOffset + offset + entity.length);
      addDiagnostic(
        "XML001_INVALID_SYNTAX",
        DiagnosticSeverity.Error,
        `malformed numeric XML entity \`${entity}\``,
        start,
        end,
        {
          primaryLabel: "this entity is incomplete",
          help: "use a valid numeric entity such as `&#10;` or escape the ampersand as `&amp;`",
        },
      );
      i += j - 1;
      continue;
    }

    const namedMatch = remaining.match(/^[a-zA-Z][a-zA-Z0-9]*;/);
    if (namedMatch) {
      const entity = `&${namedMatch[0]}`;
      const start = positionAt(text, baseOffset + offset);
      const end = positionAt(text, baseOffset + offset + entity.length);
      addDiagnostic(
        "XML013_UNKNOWN_ENTITY",
        DiagnosticSeverity.Error,
        `unknown XML entity \`${entity}\``,
        start,
        end,
        {
          primaryLabel: "this entity is not one of XML's predefined entities",
          help: "use one of `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`, or a valid numeric entity",
        },
      );
      i += entity.length - 1;
      continue;
    }

    const unterminatedMatch = remaining.match(/^[a-zA-Z][a-zA-Z0-9]*/);
    if (unterminatedMatch) {
      const entity = `&${unterminatedMatch[0]}`;
      const start = positionAt(text, baseOffset + offset);
      const end = positionAt(text, baseOffset + offset + entity.length);
      addDiagnostic(
        "XML001_INVALID_SYNTAX",
        DiagnosticSeverity.Error,
        "bare ampersand in XML content",
        start,
        end,
        {
          primaryLabel: "escape `&` as `&amp;`",
          help: "replace `&` with `&amp;` unless this is a valid XML entity",
        },
      );
      i += entity.length - 1;
      continue;
    }

    const start = positionAt(text, baseOffset + offset);
    const end = positionAt(text, baseOffset + offset + 1);
    addDiagnostic(
      "XML001_INVALID_SYNTAX",
      DiagnosticSeverity.Error,
      "bare ampersand in XML content",
      start,
      end,
      {
        primaryLabel: "escape `&` as `&amp;`",
        help: "replace `&` with `&amp;` unless this is a valid XML entity",
      },
    );
  }
}

export function decodeXmlEntities(rawValue: string): string {
  return rawValue
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex) => {
      const cp = Number.parseInt(hex, 16);
      if (cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
        return _match;
      }
      return String.fromCodePoint(cp);
    })
    .replace(/&#([0-9]+);/g, (_match, dec) => {
      const cp = Number.parseInt(dec, 10);
      if (cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) {
        return _match;
      }
      return String.fromCodePoint(cp);
    });
}

export function decodeXmlEntitiesWithOffsets(rawValue: string): {
  value: string;
  offsets: number[];
} {
  let value = "";
  const offsets = [0];

  for (let index = 0; index < rawValue.length; ) {
    const entity = matchEntity(rawValue, index);
    if (!entity) {
      value += rawValue[index] ?? "";
      index += 1;
      offsets.push(index);
      continue;
    }

    value += entity.value;
    index = entity.end;
    offsets.push(index);
  }

  return { value, offsets };
}

function matchEntity(rawValue: string, start: number): { value: string; end: number } | undefined {
  const slice = rawValue.slice(start);
  const named =
    slice.startsWith("&quot;") ||
    slice.startsWith("&apos;") ||
    slice.startsWith("&lt;") ||
    slice.startsWith("&gt;") ||
    slice.startsWith("&amp;");
  if (named) {
    const entity = slice.startsWith("&quot;")
      ? "&quot;"
      : slice.startsWith("&apos;")
        ? "&apos;"
        : slice.startsWith("&lt;")
          ? "&lt;"
          : slice.startsWith("&gt;")
            ? "&gt;"
            : "&amp;";
    return { value: decodeXmlEntities(entity), end: start + entity.length };
  }

  const hex = /^&#x([0-9a-fA-F]+);/.exec(slice);
  if (hex) {
    const entity = hex[0];
    return { value: decodeXmlEntities(entity), end: start + entity.length };
  }

  const dec = /^&#([0-9]+);/.exec(slice);
  if (dec) {
    const entity = dec[0];
    return { value: decodeXmlEntities(entity), end: start + entity.length };
  }

  return undefined;
}
