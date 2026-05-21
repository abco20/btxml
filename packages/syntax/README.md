# @btxml/syntax

BTXML syntax parsing and formatting primitives.

## Dialect scope

`@btxml/syntax` parses and formats the BTXML dialect used by this repository.
It targets BT.CPP-style XML documents used in editor and static-analysis workflows,
but it is not a full TinyXML2-compatible XML runtime parser.

### Supported focus

- BTXML / BT.CPP-style element + attribute trees
- XML declaration (`<?xml ...?>`)
- Deterministic formatting for tooling workflows

### Explicitly unsupported constructs

- `CDATA` sections
- `DOCTYPE`
- arbitrary processing instructions (other than XML declaration)

These limits are intentional to keep parser behavior deterministic, secure, and easy to reason
about in IDE tooling and CI.
