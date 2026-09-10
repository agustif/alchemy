/**
 * Example: GitHub Issues and Pull Requests Management
 *
 * This example demonstrates how to use the GitHub provider to:
 * 1. Create and manage issues declaratively
 * 2. Create and manage pull requests declaratively
 * 3. Query existing issues and PRs (observation layer)
 * 4. Implement two-way sync patterns
 *
 * Run with:
 *   GITHUB_TEST_OWNER=your-org GITHUB_TEST_REPO=your-repo bun run examples/github-issues-prs.ts
 */

import * as Alchemy from "../packages/alchemy/src/index.ts"
import * as GitHub from "../packages/alchemy/src/GitHub/index.ts"
import * as Effect from "effect/Effect"
import * as Output from "../packages/alchemy/src/Output.ts"

const owner = process.env.GITHUB_TEST_OWNER || "my-org"
const repository = process.env.GITHUB_TEST_REPO || "my-repo"

// Example 1: Create and manage issues declaratively
const IssueManagementStack = Alchemy.Stack(
  "IssueManagement",
  {
    providers: GitHub.providers(),
    state: Alchemy.LocalState(),
  },
  Effect.gen(function* () {
    // Create a bug report issue
    const bugIssue = yield* GitHub.Issue("critical-bug", {
      owner,
      repository,
      title: "Critical: Application fails to start",
      body: `
        ## Description
        The application fails to start after the latest deployment.

        ## Steps to Reproduce
        1. Deploy the latest version
        2. Attempt to start the application
        3. Observe the error

        ## Expected Behavior
        Application should start successfully.

        ## Actual Behavior
        Application crashes with error code 1.
      `,
      labels: ["bug", "critical", "production"],
      assignees: ["team-lead"],
      milestone: 1,
    })

    // Create a feature request issue
    const featureIssue = yield* GitHub.Issue("dark-mode-feature", {
      owner,
      repository,
      title: "Feature Request: Dark Mode",
      body: "Users have requested dark mode support for better accessibility.",
      labels: ["enhancement", "ui", "accessibility"],
      state: "open",
    })

    // Create an infrastructure tracking issue
    const infraIssue = yield* GitHub.Issue("infra-status", {
      owner,
      repository,
      title: "Infrastructure Deployment Status",
      body: Output.interpolate`
        ## Current Deployment

        **Bug Issue**: ${bugIssue.htmlUrl}
        **Feature Issue**: ${featureIssue.htmlUrl}

        All issues tracked and managed via Alchemy IaC.
      `,
      labels: ["infrastructure", "tracking"],
    })

    return {
      bugIssue: bugIssue.issueNumber,
      featureIssue: featureIssue.issueNumber,
      infraIssue: infraIssue.issueNumber,
    }
  }),
)

// Example 2: Create and manage pull requests declaratively
const PullRequestManagementStack = Alchemy.Stack(
  "PullRequestManagement",
  {
    providers: GitHub.providers(),
    state: Alchemy.LocalState(),
  },
  Effect.gen(function* () {
    // Create a draft PR for work in progress
    const draftPR = yield* GitHub.PullRequest("feature-wip", {
      owner,
      repository,
      title: "WIP: Implement dark mode",
      body: `
        ## Changes
        - Add dark mode theme support
        - Update UI components
        - Add theme toggle

        ## Status
        🚧 Work in progress - not ready for review
      `,
      head: "feature/dark-mode",
      base: "main",
      draft: true,
      labels: ["wip", "enhancement"],
    })

    // Create a ready-for-review PR
    const readyPR = yield* GitHub.PullRequest("bugfix-ready", {
      owner,
      repository,
      title: "Fix: Application startup crash",
      body: `
        ## Changes
        - Fix initialization order
        - Add error handling
        - Update tests

        ## Testing
        ✅ All tests passing
        ✅ Manually verified on staging
      `,
      head: "fix/startup-crash",
      base: "main",
      draft: false,
      reviewers: ["code-reviewer-1", "code-reviewer-2"],
      teamReviewers: ["platform-team"],
      labels: ["bug", "ready-for-review"],
      assignees: ["developer-1"],
    })

    return {
      draftPR: draftPR.prNumber,
      readyPR: readyPR.prNumber,
    }
  }),
)

// Example 3: Query existing issues (observation layer)
const ObserveIssuesExample = Effect.gen(function* () {
  console.log("\n=== Querying Existing Issues ===\n")

  // Query all open bugs
  const openBugs = yield* GitHub.queryIssues(owner, repository, {
    state: "open",
    labels: ["bug"],
    sort: "updated",
    direction: "desc",
  })

  console.log(`Found ${openBugs.length} open bugs:`)
  openBugs.slice(0, 5).forEach((bug) => {
    console.log(`  #${bug.number}: ${bug.title}`)
    console.log(`    Labels: ${bug.labels.join(", ")}`)
    console.log(`    Updated: ${bug.updatedAt}`)
  })

  // Query recently updated issues
  const recentlyUpdated = yield* GitHub.queryIssues(owner, repository, {
    state: "all",
    sort: "updated",
    direction: "desc",
    since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
  })

  console.log(`\n${recentlyUpdated.length} issues updated in the last 7 days`)

  // Get a specific issue
  if (openBugs.length > 0) {
    const issueNumber = openBugs[0]!.number
    const issue = yield* GitHub.getIssue(owner, repository, issueNumber)
    console.log(`\nIssue #${issue.number} details:`)
    console.log(`  Title: ${issue.title}`)
    console.log(`  State: ${issue.state}`)
    console.log(`  Assignees: ${issue.assignees.join(", ") || "none"}`)
  }
})

// Example 4: Query existing pull requests (observation layer)
const ObservePullRequestsExample = Effect.gen(function* () {
  console.log("\n=== Querying Existing Pull Requests ===\n")

  // Query open PRs to main branch
  const openPRs = yield* GitHub.queryPullRequests(owner, repository, {
    state: "open",
    base: "main",
    sort: "updated",
    direction: "desc",
  })

  console.log(`Found ${openPRs.length} open PRs to main:`)
  openPRs.slice(0, 5).forEach((pr) => {
    console.log(`  #${pr.number}: ${pr.title}`)
    console.log(`    ${pr.head} → ${pr.base}`)
    console.log(`    Draft: ${pr.draft}`)
    console.log(`    Labels: ${pr.labels.join(", ")}`)
  })

  // Query all PRs from a specific branch pattern
  const featurePRs = yield* GitHub.queryPullRequests(owner, repository, {
    state: "all",
    head: `${owner}:feature/*`,
  })

  console.log(`\n${featurePRs.length} PRs from feature branches`)

  // Get a specific PR
  if (openPRs.length > 0) {
    const prNumber = openPRs[0]!.number
    const pr = yield* GitHub.getPullRequest(owner, repository, prNumber)
    console.log(`\nPR #${pr.number} details:`)
    console.log(`  Title: ${pr.title}`)
    console.log(`  State: ${pr.state}`)
    console.log(`  Merged: ${pr.merged}`)
    console.log(`  Reviewers: ${pr.reviewers.join(", ") || "none"}`)
  }
})

// Example 5: Two-way sync pattern - observe and declare
const TwoWaySyncExample = Effect.gen(function* () {
  console.log("\n=== Two-Way Sync Pattern ===\n")

  // 1. Observe existing issues
  const existingIssues = yield* GitHub.queryIssues(owner, repository, {
    state: "open",
    labels: ["infrastructure"],
  })

  console.log(
    `Found ${existingIssues.length} existing infrastructure issues`,
  )

  // 2. Declare desired state (create or update)
  const stack = yield* Alchemy.Stack(
    "TwoWaySync",
    {
      providers: GitHub.providers(),
      state: Alchemy.LocalState(),
    },
    Effect.gen(function* () {
      // Ensure a status tracking issue exists
      const statusIssue = yield* GitHub.Issue("infra-status-sync", {
        owner,
        repository,
        title: "Infrastructure Status Dashboard",
        body: `
          ## Observed State
          - ${existingIssues.length} tracked infrastructure issues
          - Last sync: ${new Date().toISOString()}

          ## Managed Resources
          This issue is managed via Alchemy IaC.
        `,
        labels: ["infrastructure", "tracking", "automated"],
      })

      return { statusIssue: statusIssue.issueNumber }
    }),
  )

  const deployed = yield* stack.pipe(Alchemy.deploy)

  console.log(
    `Synced: Status issue #${deployed.statusIssue.as<number>()} is up to date`,
  )
})

// Run examples
const main = Effect.gen(function* () {
  console.log("GitHub Issues & Pull Requests Management Examples\n")
  console.log("=" .repeat(50))

  // Run observation examples (read-only, safe to run always)
  yield* ObserveIssuesExample.pipe(Effect.provide(GitHub.providers()))
  yield* ObservePullRequestsExample.pipe(Effect.provide(GitHub.providers()))

  // Uncomment to run declarative management examples (will create resources):
  // yield* IssueManagementStack.pipe(Alchemy.deploy)
  // yield* PullRequestManagementStack.pipe(Alchemy.deploy)
  // yield* TwoWaySyncExample

  console.log("\n" + "=".repeat(50))
  console.log("\nExamples completed successfully!")
})

// Execute
Effect.runPromise(main).catch((error) => {
  console.error("Error running examples:", error)
  process.exit(1)
})
