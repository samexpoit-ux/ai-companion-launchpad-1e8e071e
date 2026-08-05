import { transform } from "@babel/standalone";

import { mergeArtifactProjects, parseArtifacts } from "./artifact";

const CODE_FILE_RE = /\.(?:[cm]?[jt]sx?)$/i;

export interface DeliverySyntaxIssue {
  path: string;
  line?: number;
  message: string;
}

/**
 * Parse and compile every generated source file before a build is allowed to
 * reach the browser preview. This deliberately checks syntax only: an
 * iterative artifact can import an unchanged file from an earlier turn that
 * is not repeated in the current response.
 */
export function validateBuildDeliverySyntax(content: string): DeliverySyntaxIssue[] {
  const project = mergeArtifactProjects(parseArtifacts(content));
  if (!project) {
    return [{ path: "artifact", message: "No parseable project artifact was returned" }];
  }

  const issues: DeliverySyntaxIssue[] = [];
  for (const [path, source] of Object.entries(project.files)) {
    if (path.endsWith(".json")) {
      try {
        JSON.parse(source);
      } catch (error) {
        issues.push({
          path,
          message: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
      continue;
    }
    if (!CODE_FILE_RE.test(path)) continue;

    try {
      transform(source, {
        filename: path,
        presets: [["react", { runtime: "classic" }], "typescript"],
        plugins: ["transform-modules-commonjs"],
      });
    } catch (error) {
      const parsed = error as Error & { loc?: { line?: number } };
      issues.push({
        path,
        line: parsed.loc?.line,
        message: parsed.message.replace(/^unknown file:\s*/i, "").split("\n")[0],
      });
    }
  }

  return issues;
}