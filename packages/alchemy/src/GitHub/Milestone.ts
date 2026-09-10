import * as Effect from "effect/Effect";
import { isResolved } from "../Diff.ts";
import * as Provider from "../Provider.ts";
import { Resource } from "../Resource.ts";
import { gitHubBaseUrlChanged, Octokit, octokitFor } from "./Octokit.ts";
import type * as GitHub from "./Providers.ts";

export interface MilestoneProps {
  /**
   * Repository owner (user or organization).
   */
  owner: string;

  /**
   * Repository name.
   */
  repository: string;

  /**
   * Milestone title (e.g. `v1.0`, `Sprint 1`, `Q1 2026`).
   */
  title: string;

  /**
   * Milestone description.
   */
  description?: string;

  /**
   * Due date as an ISO-8601 timestamp (e.g. `2026-12-31T23:59:59Z`).
   */
  dueOn?: string;

  /**
   * Milestone state.
   * @default "open"
   */
  state?: "open" | "closed";

  /**
   * Override the GitHub host or API base URL for this resource only (e.g.
   * `github.example.com` for GitHub Enterprise). Falls back to
   * `GitHub.providers({ baseUrl })`, then to the host resolved by the auth
   * provider. Changing it replaces the resource — the same name on a
   * different GitHub instance is a different physical resource.
   */
  baseUrl?: string;
}

export interface Milestone extends Resource<
  "GitHub.Milestone",
  MilestoneProps,
  {
    /**
     * Numeric ID of the milestone in GitHub.
     */
    milestoneId: number;

    /**
     * Milestone number (sequential per repository).
     */
    number: number;

    /**
     * GraphQL node ID of the milestone.
     */
    nodeId: string;

    /**
     * API URL to access the milestone.
     */
    url: string;

    /**
     * Web URL to view the milestone in a browser.
     */
    htmlUrl: string;

    /**
     * Number of open issues in this milestone.
     */
    openIssues: number;

    /**
     * Number of closed issues in this milestone.
     */
    closedIssues: number;

    /**
     * Current state of the milestone.
     */
    state: "open" | "closed";

    /**
     * ISO-8601 timestamp of when the milestone was created.
     */
    createdAt: string;

    /**
     * ISO-8601 timestamp of the last update.
     */
    updatedAt: string;

    /**
     * ISO-8601 timestamp of the due date, if set.
     */
    dueOn: string | undefined;

    /**
     * ISO-8601 timestamp of when the milestone was closed, if closed.
     */
    closedAt: string | undefined;
  },
  never,
  GitHub.Providers
> {}

/**
 * A GitHub repository milestone.
 *
 * `Milestone` manages the lifecycle of a repository milestone used to track
 * progress on groups of issues and pull requests. Milestones are created on
 * first deploy and updated in place on subsequent deploys. The resource
 * defaults to **retain** on removal — destroying the stack does NOT delete
 * the milestone on GitHub, preserving historical tracking data.
 *
 * Authentication is resolved via the `GitHubCredentials` service supplied
 * by `GitHub.providers()` (env, stored PAT, `gh` CLI, or OAuth). The token
 * needs `repo` scope for private repositories or `public_repo` for public
 * ones.
 * ### Creating a Milestone
 * **Example:** Basic Milestone
 * ```typescript
 * yield* GitHub.Milestone("v1", {
 *   owner: "my-org",
 *   repository: "my-repo",
 *   title: "v1.0",
 *   description: "First stable release",
 *   dueOn: "2026-12-31T23:59:59Z",
 * });
 * ```
 *
 * **Example:** Sprint Milestones
 * ```typescript
 * yield* GitHub.Milestone("sprint-1", {
 *   owner: "my-org",
 *   repository: "my-repo",
 *   title: "Sprint 1",
 *   description: "January 2026 sprint",
 *   dueOn: "2026-01-31T23:59:59Z",
 * });
 *
 * yield* GitHub.Milestone("sprint-2", {
 *   owner: "my-org",
 *   repository: "my-repo",
 *   title: "Sprint 2",
 *   description: "February 2026 sprint",
 *   dueOn: "2026-02-28T23:59:59Z",
 * });
 * ```
 *
 * ### Closing a Milestone
 * **Example:** Mark a Milestone as Complete
 * ```typescript
 * yield* GitHub.Milestone("v1", {
 *   owner: "my-org",
 *   repository: "my-repo",
 *   title: "v1.0",
 *   state: "closed",
 * });
 * ```
 *
 * ### Wiring with Repository
 * A common pattern is defining milestones alongside the repository so the
 * entire configuration lives in one program.
 *
 * **Example:** Milestones for a New Repository
 * ```typescript
 * const repo = yield* GitHub.Repository("api", {
 *   owner: "my-org",
 *   name: "api",
 *   autoInit: true,
 * });
 *
 * yield* GitHub.Milestone("beta", {
 *   owner: "my-org",
 *   repository: repo.name!,
 *   title: "Beta Release",
 *   dueOn: "2026-06-30T23:59:59Z",
 * });
 * ```
 *
 * @resource
 */
export const Milestone = Resource<Milestone>("GitHub.Milestone", {
  defaultRemovalPolicy: "retain",
});

export const MilestoneProvider = () =>
  Provider.succeed(Milestone, {
    stables: ["milestoneId", "nodeId", "number"],

    // A milestone belongs to (host, owner, repository) and GitHub assigns the
    // number server-side. The title can be updated in place, so changing only
    // the title is an update (handled in reconcile), not a replacement. Changing
    // owner, repository, or host replaces the resource — the engine creates the
    // new milestone first, then `delete` removes the old one.
    diff: Effect.fn(function* ({ news, olds }) {
      if (!isResolved(news)) return;
      if (olds === undefined) return;
      if (
        news.owner !== olds.owner ||
        news.repository !== olds.repository ||
        (yield* gitHubBaseUrlChanged(olds, news))
      ) {
        return { action: "replace" };
      }
    }),

    reconcile: Effect.fn(function* ({ news, output, olds }) {
      const octokit = yield* octokitFor(news.baseUrl);

      // Observe — GitHub assigns the milestone number server-side. Probe for
      // live state via the cached number if we have it; otherwise search by
      // title (on a rename or first create). A 404 (deleted out-of-band, or
      // never created) collapses to "no observed milestone" so we converge by
      // creating a fresh one.
      let observed: any = undefined;
      if (output?.number !== undefined) {
        observed = yield* Effect.tryPromise({
          try: async () => {
            try {
              const { data } = await octokit.rest.issues.getMilestone({
                owner: news.owner,
                repo: news.repository,
                milestone_number: output.number,
              });
              return data;
            } catch (error: any) {
              if (error.status === 404) return undefined;
              throw error;
            }
          },
          catch: (e) => e as Error,
        });
      }

      // If we don't have a cached number or it 404'd, search by title to
      // handle renames (the logical ID stayed the same but the title changed).
      if (observed === undefined) {
        const all = yield* Effect.tryPromise({
          try: () =>
            octokit.paginate(octokit.rest.issues.listMilestones, {
              owner: news.owner,
              repo: news.repository,
              state: "all",
              per_page: 100,
            }),
          catch: (e) => e as Error,
        });

        // Check both the current title and the old title (if we're renaming)
        observed = all.find(
          (m) =>
            m.title === news.title ||
            (olds?.title !== undefined && m.title === olds.title),
        );
      }

      // Ensure — POST creates the milestone when it does not exist.
      if (observed === undefined) {
        const { data } = yield* Effect.tryPromise(() =>
          octokit.rest.issues.createMilestone({
            owner: news.owner,
            repo: news.repository,
            title: news.title,
            description: news.description,
            due_on: news.dueOn,
            state: news.state,
          }),
        );
        return toAttrs(data);
      }

      // Sync — PATCH updates the milestone's mutable attributes (title,
      // description, due date, state). Only issue the update when something
      // actually changed to keep the API quiet.
      const desiredState = news.state ?? "open";
      const desiredDescription = news.description ?? "";
      const desiredDueOn = news.dueOn ?? null;
      if (
        observed.title !== news.title ||
        (observed.description ?? "") !== desiredDescription ||
        observed.state !== desiredState ||
        (observed.due_on ?? null) !== desiredDueOn
      ) {
        const { data } = yield* Effect.tryPromise(() =>
          octokit.rest.issues.updateMilestone({
            owner: news.owner,
            repo: news.repository,
            milestone_number: observed.number,
            title: news.title,
            description: news.description,
            due_on: news.dueOn,
            state: desiredState,
          }),
        );
        return toAttrs(data);
      }

      return toAttrs(observed);
    }),

    // GitHub milestones are repo-scoped. Enumerate every repository the
    // authenticated token can see, then list each repo's milestones (both
    // open and closed).
    list: Effect.fn(function* () {
      const octokit = yield* Octokit;

      // `octokit.paginate` walks every page and flattens to a single array.
      const repos = yield* Effect.tryPromise({
        try: () =>
          octokit.paginate(octokit.rest.repos.listForAuthenticatedUser, {
            per_page: 100,
          }),
        catch: (e) => e as Error,
      });

      const perRepo = yield* Effect.forEach(
        repos,
        (repo) =>
          Effect.tryPromise({
            try: async () => {
              try {
                const milestones = await octokit.paginate(
                  octokit.rest.issues.listMilestones,
                  {
                    owner: repo.owner.login,
                    repo: repo.name,
                    state: "all",
                    per_page: 100,
                  },
                );
                return milestones.map(toAttrs);
              } catch (error: any) {
                // Repos with Issues disabled, or where the token lacks the
                // `repo`/`issues` scope, reject the milestones endpoint with
                // 403/404 — skip them per the per-item not-found rule rather
                // than failing the whole enumeration.
                if (error.status === 403 || error.status === 404) {
                  return [];
                }
                throw error;
              }
            },
            catch: (e) => e as Error,
          }),
        { concurrency: 10 },
      );

      return perRepo.flat();
    }),

    delete: Effect.fn(function* ({ olds, output }) {
      const octokit = yield* octokitFor(olds.baseUrl);

      yield* Effect.tryPromise(async () => {
        try {
          await octokit.rest.issues.deleteMilestone({
            owner: olds.owner,
            repo: olds.repository,
            milestone_number: output.number,
          });
        } catch (error: any) {
          if (error.status !== 404) {
            throw error;
          }
        }
      });
    }),
  });

const toAttrs = (data: {
  id: number;
  number: number;
  node_id: string;
  url: string;
  html_url: string;
  state: "open" | "closed";
  open_issues: number;
  closed_issues: number;
  created_at: string;
  updated_at: string;
  due_on?: string | null;
  closed_at?: string | null;
}): Milestone["Attributes"] => ({
  milestoneId: data.id,
  number: data.number,
  nodeId: data.node_id,
  url: data.url,
  htmlUrl: data.html_url,
  openIssues: data.open_issues,
  closedIssues: data.closed_issues,
  state: data.state,
  createdAt: data.created_at,
  updatedAt: data.updated_at,
  dueOn: data.due_on ?? undefined,
  closedAt: data.closed_at ?? undefined,
});
