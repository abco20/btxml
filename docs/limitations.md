# Limitations

btxml v0.1 intentionally focuses on BehaviorTree.CPP / Groot XML workflows and does not aim to be a general-purpose XML formatter.

## Unsupported XML constructs

- CDATA sections
- DOCTYPE declarations
- XML Processing Instructions, except the XML declaration
- Unknown XML entities

## Behavioral limitations

- btxml formatter is Groot-style, not a general XML formatter.
- Formatting is deterministic and Groot-oriented, not a general XML pretty-printer.
- Encoding is UTF-8 only.
- Line ending is LF only.
- Port value validation is static and conservative. btxml checks documented XML-facing value shapes, but it does not emulate arbitrary user-defined BehaviorTree.CPP `convertFromString<T>` runtime conversions.
- Numeric literal validation intentionally requires full-string matches. This is stricter than some current BehaviorTree.CPP `std::from_chars` call sites, which may accept parseable numeric prefixes.
- Blackboard analysis is conservative and only infers what the XML and config make explicit.
- Blackboard type mismatch checking defaults to BT.CPP-compatible `std::string` entry tolerance. You can disable that compatibility in `model/no-blackboard-type-mismatch` if you prefer stricter static checking.
- The VS Code extension should avoid interfering with ordinary XML files that are not BT XML.
- btxml validates child counts for built-in BT.CPP node kinds and selected special builtins, but it cannot infer custom runtime child-count constraints that are not represented in XML/model data.
- C++ type strings exported by BT.CPP are compared as strings. btxml does not normalize C++ type aliases or ABI-specific type names.

## Unsupported XML features

- `<![CDATA[` elements are unsupported and will emit `XML010_UNSUPPORTED_CDATA`.
- `<!DOCTYPE` elements are unsupported and will emit `XML011_UNSUPPORTED_DOCTYPE`.
- Processing instructions like `<?xml-stylesheet ?>` are unsupported emitting `XML012_UNSUPPORTED_PROCESSING_INSTRUCTION`.
- Custom unknown entities `&custom;` will emit `XML013_UNKNOWN_ENTITY`.
- Invalid numeric entities `&#x110000;` will emit `XML014_INVALID_NUMERIC_ENTITY`.
- Text nodes mixed with elements outside ports emit `XML015_UNSUPPORTED_MIXED_CONTENT`.
