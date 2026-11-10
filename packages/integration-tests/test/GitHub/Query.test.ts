import * as GitHub from "@alchemy.run/github";
import { expect } from "@alchemy.run/test";
import * as Test from "@alchemy.run/test/Alchemy";
import * as Effect from "effect/Effect";

const { test } = Test.make({
  providers: GitHub.providers({ baseUrl: "github.com" }),
});

const testRepoOwner = process.env.GITHUB_TEST_OWNER ?? "agustif";
const testRepoName = process.env.GITHUB_TEST_REPO ?? "alchemy";

test(
  "query issues from repository",
  Effect.gen(function* () {
    const issues = yield* GitHub.queryIssues(testRepoOwner, testRepoName, {
      state: "all",
    });

    expect(Array.isArray(issues)).toBe(true);

    if (issues.length > 0) {
      const issue = issues[0]!;
      expect(issue.number).toBeGreaterThan(0);
      expect(issue.title).toBeDefined();
      expect(issue.state).toMatch(/^(open|closed)$/);
      expect(issue.htmlUrl).toContain("github.com");
    }
  }),
  { tags: ["provider:github", "provider:github:query", "live"], timeout: 120_000 },
);

test(
  "query open issues with filters",
  Effect.gen(function* () {
    const issues = yield* GitHub.queryIssues(testRepoOwner, testRepoName, {
      state: "open",
      sort: "updated",
      direction: "desc",
    });

    expect(Array.isArray(issues)).toBe(true);
    issues.forEach((issue) => {
      expect(issue.state).toBe("open");
    });
  }),
  { tags: ["provider:github", "provider:github:query", "live"], timeout: 120_000 },
);

test(
  "query pull requests from repository",
  Effect.gen(function* () {
    const prs = yield* GitHub.queryPullRequests(testRepoOwner, testRepoName, {
      state: "all",
    });

    expect(Array.isArray(prs)).toBe(true);

    if (prs.length > 0) {
      const pr = prs[0]!;
      expect(pr.number).toBeGreaterThan(0);
      expect(pr.title).toBeDefined();
      expect(pr.state).toMatch(/^(open|closed)$/);
      expect(pr.head).toBeDefined();
      expect(pr.base).toBeDefined();
      expect(pr.htmlUrl).toContain("github.com");
      expect(typeof pr.draft).toBe("boolean");
      expect(typeof pr.merged).toBe("boolean");
    }
  }),
  { tags: ["provider:github", "provider:github:query", "live"], timeout: 120_000 },
);

test(
  "get specific issue by number",
  Effect.gen(function* () {
    const issues = yield* GitHub.queryIssues(testRepoOwner, testRepoName, {
      state: "all",
    });

    if (issues.length === 0) {
      return;
    }

    const issueNumber = issues[0]!.number;

    const issue = yield* GitHub.getIssue(testRepoOwner, testRepoName, issueNumber);

    expect(issue.number).toBe(issueNumber);
    expect(issue.title).toBeDefined();
    expect(issue.state).toMatch(/^(open|closed)$/);
  }),
  { tags: ["provider:github", "provider:github:query", "live"], timeout: 120_000 },
);

test(
  "get specific pull request by number",
  Effect.gen(function* () {
    const prs = yield* GitHub.queryPullRequests(testRepoOwner, testRepoName, {
      state: "all",
    });

    if (prs.length === 0) {
      return;
    }

    const prNumber = prs[0]!.number;

    const pr = yield* GitHub.getPullRequest(testRepoOwner, testRepoName, prNumber);

    expect(pr.number).toBe(prNumber);
    expect(pr.title).toBeDefined();
    expect(pr.head).toBeDefined();
    expect(pr.base).toBeDefined();
  }),
  { tags: ["provider:github", "provider:github:query", "live"], timeout: 120_000 },
);
