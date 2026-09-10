# GitHub Provider Extension: Issues & Pull Requests

This document describes the new Issue and PullRequest resources added to the GitHub provider, along with query utilities for observation and two-way sync patterns.

## Overview

The GitHub provider now supports bidirectional workflows:

- **Declarative Management** (Apply/Declare): Create and update Issues and PRs as infrastructure resources
- **Observation** (Read/Query): Query existing Issues and PRs without managing them
- **Two-Way Sync**: Combine observation and declaration for sophisticated automation

## Resources

### `GitHub.Issue`

Manages repository issues with full lifecycle support.

**Features:**
- Create, update, and close issues declaratively
- Support for labels, assignees, milestones
- State management (open/closed)
- Retain-on-destroy default (preserves discussion history)
- Automatic body dedenting for template literals

**Example:**

```typescript
const issue = yield* GitHub.Issue("bug-report", {
  owner: "my-org",
  repository: "my-repo",
  title: "Bug: Application crashes on startup",
  body: `
    ## Description
    The application fails to start after deployment.

    ## Steps to Reproduce
    1. Deploy latest version
    2. Start application
    3. Observe crash
  `,
  labels: ["bug", "critical", "production"],
  assignees: ["team-lead"],
  milestone: 1,
  state: "open",
})
```

**Properties:**

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `owner` | `string` | Repository owner (user or org) | Required |
| `repository` | `string` | Repository name | Required |
| `title` | `string` | Issue title | Required |
| `body` | `string?` | Issue body (Markdown) | Optional |
| `state` | `"open" \| "closed"` | Issue state | `"open"` |
| `labels` | `string[]?` | Labels to attach | Optional |
| `assignees` | `string[]?` | User logins to assign | Optional |
| `milestone` | `number \| null?` | Milestone number | Optional |
| `baseUrl` | `string?` | GitHub Enterprise URL | Optional |

**Output Attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `issueNumber` | `number` | GitHub issue number |
| `nodeId` | `string` | GraphQL node ID |
| `htmlUrl` | `string` | Browser URL |
| `state` | `"open" \| "closed"` | Current state |
| `createdAt` | `string` | ISO-8601 timestamp |
| `updatedAt` | `string` | ISO-8601 timestamp |

### `GitHub.PullRequest`

Manages pull requests with draft support and reviewer management.

**Features:**
- Create, update, and close PRs declaratively
- Draft PR support with state transitions
- Reviewer and team reviewer management
- Support for labels, assignees, milestones
- Branch tracking (head/base)
- Retain-on-destroy default

**Example:**

```typescript
const pr = yield* GitHub.PullRequest("feature-pr", {
  owner: "my-org",
  repository: "my-repo",
  title: "Add dark mode",
  body: `
    ## Changes
    - Add dark mode theme
    - Update UI components
    - Add theme toggle

    ## Testing
    ✅ All tests passing
  `,
  head: "feature/dark-mode",
  base: "main",
  draft: false,
  reviewers: ["code-reviewer-1"],
  teamReviewers: ["platform-team"],
  labels: ["enhancement", "ui"],
  assignees: ["developer-1"],
})
```

**Properties:**

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| `owner` | `string` | Repository owner | Required |
| `repository` | `string` | Repository name | Required |
| `title` | `string` | PR title | Required |
| `body` | `string?` | PR body (Markdown) | Optional |
| `head` | `string` | Source branch | Required |
| `base` | `string` | Target branch | Required |
| `state` | `"open" \| "closed"` | PR state | `"open"` |
| `draft` | `boolean?` | Is draft PR | `false` |
| `labels` | `string[]?` | Labels | Optional |
| `assignees` | `string[]?` | Assignees | Optional |
| `reviewers` | `string[]?` | Reviewer logins | Optional |
| `teamReviewers` | `string[]?` | Team slugs | Optional |
| `milestone` | `number \| null?` | Milestone | Optional |
| `baseUrl` | `string?` | GitHub Enterprise URL | Optional |

**Output Attributes:**

| Attribute | Type | Description |
|-----------|------|-------------|
| `prNumber` | `number` | PR number |
| `nodeId` | `string` | GraphQL node ID |
| `htmlUrl` | `string` | Browser URL |
| `state` | `"open" \| "closed"` | Current state |
| `merged` | `boolean` | Is merged |
| `draft` | `boolean` | Is draft |
| `createdAt` | `string` | ISO-8601 timestamp |
| `updatedAt` | `string` | ISO-8601 timestamp |

## Query Utilities (Observation Layer)

Query functions enable reading existing GitHub resources without declaring them as managed infrastructure.

### `queryIssues()`

Query repository issues with comprehensive filtering.

**Example:**

```typescript
// Query open bugs
const openBugs = yield* GitHub.queryIssues("my-org", "my-repo", {
  state: "open",
  labels: ["bug"],
  assignee: "developer-1",
  sort: "updated",
  direction: "desc",
})

// Query recently updated issues
const recent = yield* GitHub.queryIssues("my-org", "my-repo", {
  state: "all",
  sort: "updated",
  since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
})
```

**Filters:**

| Filter | Type | Description | Default |
|--------|------|-------------|---------|
| `state` | `"open" \| "closed" \| "all"` | Issue state | `"open"` |
| `labels` | `string[]?` | Must have ALL labels | Optional |
| `assignee` | `string?` | Assignee login | Optional |
| `creator` | `string?` | Creator login | Optional |
| `mentioned` | `string?` | Mentioned user | Optional |
| `milestone` | `number \| "none" \| "*"?` | Milestone filter | Optional |
| `sort` | `"created" \| "updated" \| "comments"` | Sort field | `"created"` |
| `direction` | `"asc" \| "desc"` | Sort direction | `"desc"` |
| `since` | `string?` | Updated after (ISO-8601) | Optional |

### `queryPullRequests()`

Query repository pull requests with filtering.

**Example:**

```typescript
// Query open PRs to main
const openPRs = yield* GitHub.queryPullRequests("my-org", "my-repo", {
  state: "open",
  base: "main",
  sort: "updated",
})

// Query PRs from feature branches
const featurePRs = yield* GitHub.queryPullRequests("my-org", "my-repo", {
  head: "my-org:feature/*",
  state: "all",
})
```

**Filters:**

| Filter | Type | Description | Default |
|--------|------|-------------|---------|
| `state` | `"open" \| "closed" \| "all"` | PR state | `"open"` |
| `head` | `string?` | Source branch pattern | Optional |
| `base` | `string?` | Target branch | Optional |
| `sort` | `"created" \| "updated" \| "popularity" \| "long-running"` | Sort field | `"created"` |
| `direction` | `"asc" \| "desc"` | Sort direction | `"desc"` |

### `getIssue()` / `getPullRequest()`

Fetch a single issue or PR by number.

**Example:**

```typescript
const issue = yield* GitHub.getIssue("my-org", "my-repo", 123)
const pr = yield* GitHub.getPullRequest("my-org", "my-repo", 456)
```

## Two-Way Sync Patterns

Combine observation and declaration for sophisticated automation workflows.

### Pattern 1: Observe → Declare

Query existing resources, process them, and create new managed resources based on observations.

```typescript
// 1. Observe existing issues
const existingBugs = yield* GitHub.queryIssues(owner, repo, {
  state: "open",
  labels: ["bug"],
})

// 2. Create tracking issue based on observations
const trackingIssue = yield* GitHub.Issue("bug-dashboard", {
  owner,
  repository: repo,
  title: "Bug Tracking Dashboard",
  body: `
    ## Current Status
    - ${existingBugs.length} open bugs
    - Last updated: ${new Date().toISOString()}

    ${existingBugs.map(bug => `- #${bug.number}: ${bug.title}`).join("\n")}
  `,
  labels: ["tracking", "automated"],
})
```

### Pattern 2: Conditional Management

Only manage resources when certain conditions are met.

```typescript
// Query existing PRs
const openPRs = yield* GitHub.queryPullRequests(owner, repo, {
  state: "open",
  base: "main",
})

// Create status issue only if PRs exist
if (openPRs.length > 0) {
  yield* GitHub.Issue("pr-status", {
    owner,
    repository: repo,
    title: "Open PRs Requiring Review",
    body: `${openPRs.length} PRs need review:\n\n` +
      openPRs.map(pr => `- #${pr.number}: ${pr.title}`).join("\n"),
    labels: ["review-needed"],
  })
}
```

### Pattern 3: Sync Managed + Observed

Combine managed resources with observations for comprehensive reporting.

```typescript
// Managed infrastructure issue
const infraIssue = yield* GitHub.Issue("infra-status", {
  owner,
  repository: repo,
  title: "Infrastructure Status",
  labels: ["infrastructure"],
  // ... body with infrastructure details
})

// Observe related issues
const relatedIssues = yield* GitHub.queryIssues(owner, repo, {
  labels: ["infrastructure"],
  state: "all",
})

// Update with combined view
yield* GitHub.Issue("infra-status", {
  owner,
  repository: repo,
  title: "Infrastructure Status",
  body: `
    Managed issue: #${infraIssue.issueNumber.as<number>()}

    Related issues: ${relatedIssues.length}
    ${relatedIssues.slice(0, 10).map(i => `- #${i.number}: ${i.title}`).join("\n")}
  `,
  labels: ["infrastructure"],
})
```

## Design Principles

### Retain-on-Destroy Default

Both `Issue` and `PullRequest` default to `defaultRemovalPolicy: "retain"` to preserve discussion history. Issues and PRs contain valuable context that should not be lost.

**Opt in to closure:**

```typescript
import { destroy } from "alchemy/RemovalPolicy"

yield* GitHub.Issue("temp-issue", {
  // ... props
}).pipe(destroy())
```

### Reconciler Pattern

Both resources follow the observe → ensure → sync reconciler pattern:

1. **Observe**: Fetch current state from GitHub
2. **Ensure**: Create resource if missing
3. **Sync**: Update all mutable properties to match desired state

This enables idempotent deployments and graceful handling of out-of-band changes.

### Query vs. Resource

- **Query functions** (`queryIssues`, `queryPullRequests`) are for **observation only**
- **Resources** (`Issue`, `PullRequest`) are for **declarative management**
- Queries never modify state; resources converge to desired state

## Authentication

All operations use the `GitHubCredentials` service resolved via:

1. `GITHUB_ACCESS_TOKEN` environment variable
2. `GITHUB_TOKEN` environment variable  
3. `gh auth token` CLI command
4. OAuth flow (when configured)

**Required scopes:**
- `repo` for private repositories
- `public_repo` for public repositories

## Examples

See [`examples/github-issues-prs.ts`](../examples/github-issues-prs.ts) for comprehensive examples including:

- Creating and managing issues declaratively
- Creating and managing PRs with drafts and reviewers
- Querying existing issues with filters
- Querying existing PRs with filters
- Two-way sync patterns combining observation and declaration

## Testing

Run tests with:

```bash
GITHUB_TEST_OWNER=your-org GITHUB_TEST_REPO=your-repo pnpm test test/GitHub/Issue.test.ts
GITHUB_TEST_OWNER=your-org GITHUB_TEST_REPO=your-repo pnpm test test/GitHub/PullRequest.test.ts
GITHUB_TEST_OWNER=your-org GITHUB_TEST_REPO=your-repo pnpm test test/GitHub/Query.test.ts
```

## Future Enhancements

Potential extensions for ghfs integration:

- [ ] Import existing issues/PRs into Alchemy state
- [ ] Automatic label/milestone synchronization
- [ ] Comment management as sub-resources
- [ ] Issue/PR templates from repository
- [ ] Automated PR reviews based on rules
- [ ] Issue/PR lifecycle webhooks
