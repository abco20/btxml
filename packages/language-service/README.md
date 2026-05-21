# @btxml/language-service

Language service primitives for BTXML editors and servers.

Root exports are browser-safe.

External editor integrations should prefer the stable facade exports from `btxml/editor` and `btxml/editor/node`.

Use `@btxml/language-service` directly only when working on internal monorepo layers or lower-level integrations.

In public documentation, use `BtEditorService` as the canonical service name.

Facade example:

```ts
import { createBtEditorService } from "btxml/editor";
import { createBtProjectEditorService } from "btxml/editor/node";

const memoryService = createBtEditorService();
const nodeService = createBtProjectEditorService({ cwd: process.cwd() });
```

Internal low-level example:

```ts
import { createWorkspaceService, type BtEditorService } from "@btxml/language-service";
import {
  createNodeWorkspaceService,
  type BtProjectEditorService,
} from "@btxml/language-service/node";

const memoryService: BtEditorService = createWorkspaceService();
const nodeService: BtProjectEditorService = createNodeWorkspaceService({ cwd: process.cwd() });
```

The low-level package exports `BtEditorService` and `BtProjectEditorService` as the public service interfaces.
