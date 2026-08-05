import { describe, expect, it } from "vitest";

import { mergeArtifactProjects, parseArtifacts, stripArtifacts } from "@/lib/artifact";

describe("parseArtifacts", () => {
  it("parses a well-formed artifact", () => {
    const project = parseArtifacts(
      `<nexusArtifact id="a" title="A">
<nexusAction type="file" filePath="src/App.tsx">export default function App() { return null; }</nexusAction>
<nexusAction type="file" filePath="src/Item.tsx">export const Item = () => null;</nexusAction>
</nexusArtifact>`,
    )[0];

    expect(project.order).toEqual(["src/App.tsx", "src/Item.tsx"]);
    expect(project.entry).toBe("src/App.tsx");
  });

  it("never leaks protocol tags into a file when a closing tag is missing", () => {
    // Exactly the shape that produced "src/App.tsx: Unexpected token" in prod:
    // the first action is never closed and a second artifact starts mid-file.
    const [first, second] = parseArtifacts(
      `<nexusArtifact id="one" title="One">
<nexusAction type="file" filePath="src/Old.tsx">export const Old = () => <div />;
<nexusArtifact id="dudesnaker-admin-dashboard" title="Dudesnaker Premium Admin Dashboard">
<nexusAction type="file" filePath="src/App.tsx">import React from 'react';
export default function App() { return null; }</nexusAction>
</nexusArtifact>`,
    );

    expect(first.files["src/Old.tsx"]).not.toMatch(/nexus(Artifact|Action)/);
    expect(second.id).toBe("dudesnaker-admin-dashboard");
    expect(second.files["src/App.tsx"]).not.toMatch(/nexus(Artifact|Action)/);
    expect(second.files["src/App.tsx"]).toContain("export default function App");
  });

  it("recovers files from an artifact with no closing tag at all", () => {
    const project = parseArtifacts(
      `Here you go:
<nexusArtifact id="b" title="B">
<nexusAction type="file" filePath="src/App.tsx">export default () => null;</nexusAction>`,
    )[0];

    expect(project.files["src/App.tsx"]).toBe("export default () => null;\n");
  });

  it("keeps a trailing Shop patch when its action closing tag is truncated", () => {
    const project = parseArtifacts(
      `FIX: closed the malformed range input
<nexusArtifact id="autofix" title="Auto-fix">
<nexusAction type="file" filePath="src/pages/Shop.tsx">
export default function Shop() { return <input min="0" max="500" />; }`,
    )[0];

    expect(project.files["src/pages/Shop.tsx"]).toContain('min="0" max="500"');
    expect(project.files["src/pages/Shop.tsx"]).not.toMatch(/nexus(Artifact|Action)/);
  });

  it("strips unterminated artifacts out of the chat prose", () => {
    const prose = stripArtifacts(
      `Building it now.\n<nexusArtifact id="c" title="C">\n<nexusAction type="file" filePath="src/App.tsx">code</nexusAction>`,
    );
    expect(prose).toBe("Building it now.");
  });

  it("keeps the website when a later delivery only adds an admin page", () => {
    const projects = parseArtifacts(`<nexusArtifact id="site" title="Site">
<nexusAction type="file" filePath="src/App.tsx">export default function App(){ return 'home' }</nexusAction>
<nexusAction type="file" filePath="src/pages/Home.tsx">export default function Home(){ return 'home' }</nexusAction>
</nexusArtifact>
<nexusArtifact id="site-admin" title="Site">
<nexusAction type="file" filePath="src/pages/Admin.tsx">export default function Admin(){ return 'admin' }</nexusAction>
</nexusArtifact>`);
    const merged = mergeArtifactProjects(projects);
    expect(merged?.files["src/App.tsx"]).toContain("function App");
    expect(merged?.files["src/pages/Home.tsx"]).toContain("function Home");
    expect(merged?.files["src/pages/Admin.tsx"]).toContain("function Admin");
  });
});
