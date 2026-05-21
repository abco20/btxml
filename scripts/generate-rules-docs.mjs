import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { RuleMetadataBySlug, listRuleSlugs } from "@btxml/analyzer/rules";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "docs", "rules.md");

function codeGroup(code) {
  const n = Number(code.slice(2, 5));
  if (n < 100) return "BehaviorTree Structure";
  if (n < 300) return "BehaviorTree Usage";
  if (n < 350) return "Project Structure";
  return "Suppressions";
}

function genericConfigExample(slug) {
  return `{"linter":{"rules":{"${slug}":"warn"}}}`;
}

function genericInvalidExample(metadata) {
  return metadata.invalidExample || "See rule description.";
}

function genericValidExample(metadata) {
  return metadata.validExample || metadata.fix || "Adjust the XML or config so the rule no longer triggers.";
}

function renderRule(slug, metadata) {
  const lines = [
    `## ${slug}`,
    "",
    `**Title:** ${metadata.title}`,
    `**Diagnostic code:** \`${metadata.code}\``,
    `**Default severity:** ${metadata.defaultSeverity}`,
    "",
    "### Description",
    "",
    metadata.description,
    "",
    "### Why this matters",
    "",
    "Violations can break runtime resolution, hide project issues, or reduce editor and CI signal.",
    "",
    "### Invalid example",
    "",
    "```xml",
    genericInvalidExample(metadata),
    "```",
    "",
    "### Valid example / fix",
    "",
    "```xml",
    genericValidExample(metadata),
    "```",
    "",
    "### Config override",
    "",
    "```json",
    metadata.configExample || genericConfigExample(slug),
    "```",
  ];

  const behaviorNotes = ruleBehaviorNotes(slug);
  if (behaviorNotes.length > 0) {
    lines.push("", "### Behavior", "", ...behaviorNotes);
  }

  if (metadata.options?.length) {
    lines.push("", "### Options", "");
    for (const option of metadata.options) {
      const defaultText = option.default ? ` Default: \`${option.default}\`.` : "";
      lines.push(`- \`${option.name}\` (${option.type}): ${option.description}${defaultText}`);
    }
  }

  if (metadata.suppressible) {
    lines.push(
      "",
      "### Suppression",
      "",
      "```xml",
      `<!-- btxml-disable-next-line ${metadata.code} reason: ... -->`,
      "```",
    );
  } else {
    lines.push("", "### Suppression", "", "Not suppressible.");
  }

  return lines.join("\n");
}

function ruleBehaviorNotes(slug) {
  if (slug === "suppression/no-unused") {
    return [
      "Default severity is `warn`.",
      "Set `linter.rules[\"suppression/no-unused\"]` to override it.",
      "When `strict: true` is enabled, the effective default becomes `error` unless overridden by `linter.rules`.",
    ];
  }

  if (slug === "suppression/require-reason") {
    return [
      "Default severity is `off`.",
      "Set `linter.rules[\"suppression/require-reason\"]` to override it.",
      "When `strict: true` is enabled, the effective default becomes `warn` unless overridden by `linter.rules`.",
    ];
  }

  return [];
}

export function renderRulesMarkdown() {
  const slugs = listRuleSlugs();
  const groups = new Map();
  for (const slug of slugs) {
    const metadata = RuleMetadataBySlug[slug];
    if (!metadata) continue;
    const group = codeGroup(metadata.code);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ slug, metadata });
  }

  const lines = [
    "# Diagnostic Rules",
    "",
    "Generated from `RuleMetadataBySlug`. Run `pnpm docs:rules` to regenerate this file.",
    "",
  ];

  for (const [group, rules] of groups) {
    lines.push(`## ${group}`, "");
    for (const { slug, metadata } of rules) {
      lines.push(renderRule(slug, metadata), "");
    }
  }

  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

export function main(argv = process.argv.slice(2)) {
  const check = argv.includes("--check");
  const content = renderRulesMarkdown();
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
  if (check) {
    if (current !== content) {
      process.stderr.write("docs/rules.md is out of date\n");
      process.exitCode = 1;
    }
    return;
  }
  fs.writeFileSync(OUT, content, "utf8");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
