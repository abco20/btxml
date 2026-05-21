import type { RuleName } from "@btxml/analyzer/rules";
import type { SourceRange } from "@btxml/foundation";

export type IncludeIssueKind =
  | "missing-path"
  | "not-found"
  | "outside-root"
  | "external-used"
  | "cycle"
  | "depth-exceeded"
  | "too-many-files"
  | "unresolved-variable"
  | "ros-package-resolver-missing"
  | "ros-package-not-found";

export type IncludeIssue =
  | {
      kind: "missing-path";
      uri: string;
      range?: SourceRange;
      message: string;
    }
  | {
      kind: "not-found";
      uri: string;
      path: string;
      range?: SourceRange;
      message: string;
    }
  | {
      kind: "cycle";
      uri: string;
      path: string;
      cycle: string[];
      range?: SourceRange;
      message: string;
    }
  | {
      kind: "outside-root";
      uri: string;
      path: string;
      range?: SourceRange;
      message: string;
    }
  | {
      kind: "external-used";
      uri: string;
      path: string;
      range?: SourceRange;
      message: string;
    }
  | {
      kind: "unresolved-variable";
      uri: string;
      variable: string;
      range?: SourceRange;
      message: string;
    }
  | {
      kind: "depth-exceeded";
      uri: string;
      path: string;
      range?: SourceRange;
      message: string;
    }
  | {
      kind: "too-many-files";
      uri: string;
      path: string;
      range?: SourceRange;
      message: string;
    }
  | {
      kind: "ros-package-resolver-missing";
      uri: string;
      packageName: string;
      range?: SourceRange;
      message: string;
    }
  | {
      kind: "ros-package-not-found";
      uri: string;
      packageName: string;
      path: string;
      range?: SourceRange;
      message: string;
    };

export type SuppressionIssueKind = "missing-reason" | "unused";

export type SuppressionIssue =
  | {
      kind: "unused";
      uri: string;
      rule?: RuleName;
      code?: string;
      range?: SourceRange;
      message: string;
    }
  | {
      kind: "missing-reason";
      uri: string;
      rule?: RuleName;
      code?: string;
      range?: SourceRange;
      message: string;
    };

export type ProjectFacts = {
  includeIssuesByUri: Map<string, IncludeIssue[]>;
  suppressionIssuesByUri: Map<string, SuppressionIssue[]>;
};

export function emptyProjectFacts(): ProjectFacts {
  return { includeIssuesByUri: new Map(), suppressionIssuesByUri: new Map() };
}
