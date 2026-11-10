import * as Issues from "@distilled.cloud/github/issues";
import * as Pulls from "@distilled.cloud/github/pulls";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { IssueNotFound, PullRequestNotFound } from "./Errors.ts";

/**
 * Query filters for GitHub Issues.
 */
export interface IssueQueryFilters {
  /**
   * Filter by issue state.
   * @default "open"
   */
  state?: "open" | "closed" | "all";

  /**
   * Filter by labels. Issues must have ALL specified labels.
   */
  labels?: string[];

  /**
   * Filter by assignee login.
   */
  assignee?: string;

  /**
   * Filter by creator login.
   */
  creator?: string;

  /**
   * Filter by mentioned user login.
   */
  mentioned?: string;

  /**
   * Filter by milestone number.
   */
  milestone?: number | "none" | "*";

  /**
   * Sort field.
   * @default "created"
   */
  sort?: "created" | "updated" | "comments";

  /**
   * Sort direction.
   * @default "desc"
   */
  direction?: "asc" | "desc";

  /**
   * Only issues updated after this timestamp (ISO-8601).
   */
  since?: string;
}

/**
 * Query filters for GitHub Pull Requests.
 */
export interface PullRequestQueryFilters {
  /**
   * Filter by PR state.
   * @default "open"
   */
  state?: "open" | "closed" | "all";

  /**
   * Filter by head branch (source branch).
   */
  head?: string;

  /**
   * Filter by base branch (target branch).
   */
  base?: string;

  /**
   * Sort field.
   * @default "created"
   */
  sort?: "created" | "updated" | "popularity" | "long-running";

  /**
   * Sort direction.
   * @default "desc"
   */
  direction?: "asc" | "desc";
}

/**
 * Result shape for queried issues.
 */
export interface QueriedIssue {
  number: number;
  nodeId: string;
  title: string;
  body: string | null;
  state: "open" | "closed";
  labels: string[];
  assignees: string[];
  milestone: number | null;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

/**
 * Result shape for queried pull requests.
 */
export interface QueriedPullRequest {
  number: number;
  nodeId: string;
  title: string;
  body: string | null;
  state: "open" | "closed";
  head: string;
  base: string;
  draft: boolean;
  merged: boolean;
  labels: string[];
  assignees: string[];
  reviewers: string[];
  milestone: number | null;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  mergedAt: string | null;
}

const labelNames = (labels: ReadonlyArray<string | { name?: string | null }>): string[] =>
  labels
    .map((label) => (typeof label === "string" ? label : (label.name ?? "")))
    .filter((name) => name !== "");

const assigneeLogins = (assignees: ReadonlyArray<{ login: string }> | null | undefined): string[] =>
  assignees?.map((assignee) => assignee.login) ?? [];

const toQueriedIssue = (issue: Issues.Issue): QueriedIssue => ({
  number: issue.number,
  nodeId: issue.node_id,
  title: issue.title,
  body: issue.body ?? null,
  state: issue.state as "open" | "closed",
  labels: labelNames(issue.labels),
  assignees: assigneeLogins(issue.assignees),
  milestone: issue.milestone?.number ?? null,
  htmlUrl: issue.html_url,
  createdAt: issue.created_at,
  updatedAt: issue.updated_at,
  closedAt: issue.closed_at ?? null,
});

const toQueriedPullRequest = (
  pull: Pulls.PullRequest | Pulls.PullRequestSimple,
  reviewers: string[],
): QueriedPullRequest => ({
  number: pull.number,
  nodeId: pull.node_id,
  title: pull.title,
  body: pull.body ?? null,
  state: pull.state as "open" | "closed",
  head: pull.head.ref,
  base: pull.base.ref,
  draft: pull.draft ?? false,
  merged: "merged" in pull ? (pull.merged ?? false) : pull.merged_at != null,
  labels: labelNames(pull.labels),
  assignees: assigneeLogins(pull.assignees),
  reviewers,
  milestone: pull.milestone?.number ?? null,
  htmlUrl: pull.html_url,
  createdAt: pull.created_at,
  updatedAt: pull.updated_at,
  closedAt: pull.closed_at ?? null,
  mergedAt: pull.merged_at ?? null,
});

const requestedReviewers = (owner: string, repository: string, pullNumber: number) =>
  Pulls.listRequestedReviewers({
    owner,
    repo: repository,
    pull_number: pullNumber,
  }).pipe(Effect.map((data) => data.users.map((user) => user.login)));

/**
 * Query issues from a repository with optional filters.
 *
 * This is the observation/read side of the GitHub provider, enabling queries
 * against existing issues without declaring them as managed resources. It
 * paginates the full result set and omits pull requests (which the issues
 * list API includes). For single-page or runtime (Worker/Action) access, use
 * {@link ListIssues} / `ListIssuesHttp` instead.
 *
 * **Example:** Query Open Issues with Label
 * ```typescript
 * const openBugs = yield* GitHub.queryIssues("my-org", "my-repo", {
 *   state: "open",
 *   labels: ["bug"],
 * });
 * ```
 *
 * **Example:** Query Recently Updated Issues
 * ```typescript
 * const recent = yield* GitHub.queryIssues("my-org", "my-repo", {
 *   sort: "updated",
 *   direction: "desc",
 *   since: "2026-11-03T00:00:00Z",
 * });
 * ```
 */
export const queryIssues = (owner: string, repository: string, filters?: IssueQueryFilters) =>
  Stream.runCollect(
    Issues.listForRepo.items({
      owner,
      repo: repository,
      state: filters?.state ?? "open",
      sort: filters?.sort ?? "created",
      direction: filters?.direction ?? "desc",
      per_page: 100,
      ...(filters?.labels !== undefined ? { labels: filters.labels.join(",") } : {}),
      ...(filters?.assignee !== undefined ? { assignee: filters.assignee } : {}),
      ...(filters?.creator !== undefined ? { creator: filters.creator } : {}),
      ...(filters?.mentioned !== undefined ? { mentioned: filters.mentioned } : {}),
      ...(filters?.milestone !== undefined ? { milestone: String(filters.milestone) } : {}),
      ...(filters?.since !== undefined ? { since: filters.since } : {}),
    }),
  ).pipe(
    Effect.map((issues) =>
      Array.from(issues)
        .filter((issue) => issue.pull_request === undefined)
        .map(toQueriedIssue),
    ),
  );

/**
 * Query pull requests from a repository with optional filters.
 *
 * This is the observation/read side of the GitHub provider, enabling queries
 * against existing PRs without declaring them as managed resources. It
 * paginates the full result set and fetches requested reviewers for each PR.
 * For single-page or runtime (Worker/Action) access, use
 * {@link ListPullRequests} / `ListPullRequestsHttp` instead.
 *
 * **Example:** Query Open PRs to Main
 * ```typescript
 * const openPRs = yield* GitHub.queryPullRequests("my-org", "my-repo", {
 *   state: "open",
 *   base: "main",
 * });
 * ```
 *
 * **Example:** Query PRs from Feature Branches
 * ```typescript
 * const featurePRs = yield* GitHub.queryPullRequests("my-org", "my-repo", {
 *   head: "my-org:feature/*",
 *   state: "all",
 * });
 * ```
 */
export const queryPullRequests = (
  owner: string,
  repository: string,
  filters?: PullRequestQueryFilters,
) =>
  Stream.runCollect(
    Pulls.list.items({
      owner,
      repo: repository,
      state: filters?.state ?? "open",
      sort: filters?.sort ?? "created",
      direction: filters?.direction ?? "desc",
      per_page: 100,
      ...(filters?.head !== undefined ? { head: filters.head } : {}),
      ...(filters?.base !== undefined ? { base: filters.base } : {}),
    }),
  ).pipe(
    Effect.flatMap((pulls) =>
      Effect.forEach(
        pulls,
        (pull) =>
          requestedReviewers(owner, repository, pull.number).pipe(
            Effect.map((reviewers) => toQueriedPullRequest(pull, reviewers)),
          ),
        { concurrency: 5 },
      ),
    ),
  );

/**
 * Get a single issue by number. A missing issue fails with the typed
 * {@link IssueNotFound}.
 *
 * For runtime (Worker/Action) access, use {@link GetIssue} / `GetIssueHttp`.
 *
 * **Example:** Get Specific Issue
 * ```typescript
 * const issue = yield* GitHub.getIssue("my-org", "my-repo", 123)
 * ```
 */
export const getIssue = (owner: string, repository: string, issueNumber: number) =>
  Issues.get({
    owner,
    repo: repository,
    issue_number: issueNumber,
  }).pipe(
    Effect.map(toQueriedIssue),
    Effect.catchTag("NotFound", () =>
      Effect.fail(
        new IssueNotFound({
          owner,
          repository,
          number: issueNumber,
        }),
      ),
    ),
  );

/**
 * Get a single pull request by number, including requested reviewers. A
 * missing pull request fails with the typed {@link PullRequestNotFound}.
 *
 * For runtime (Worker/Action) access, use {@link GetPullRequest} /
 * `GetPullRequestHttp`.
 *
 * **Example:** Get Specific PR
 * ```typescript
 * const pr = yield* GitHub.getPullRequest("my-org", "my-repo", 456)
 * ```
 */
export const getPullRequest = (owner: string, repository: string, prNumber: number) =>
  Pulls.get({
    owner,
    repo: repository,
    pull_number: prNumber,
  }).pipe(
    Effect.flatMap((pull) =>
      requestedReviewers(owner, repository, prNumber).pipe(
        Effect.map((reviewers) => toQueriedPullRequest(pull, reviewers)),
      ),
    ),
    Effect.catchTag("NotFound", () =>
      Effect.fail(
        new PullRequestNotFound({
          owner,
          repository,
          number: prNumber,
        }),
      ),
    ),
  );
