import * as Effect from "effect/Effect";
import { isResolved } from "../Diff.ts";
import * as Provider from "../Provider.ts";
import { Resource } from "../Resource.ts";
import { gitHubBaseUrlChanged, Octokit, octokitFor } from "./Octokit.ts";
import type * as GitHub from "./Providers.ts";

export interface LabelProps {
  /**
   * Repository owner (user or organization).
   */
  owner: string;

  /**
   * Repository name.
   */
  repository: string;

  /**
   * Label name (e.g. `bug`, `enhancement`, `documentation`).
   */
  name: string;

  /**
   * Label description.
   */
  description?: string;

  /**
   * Label color as a hex code without the leading `#` (e.g. `d73a4a`).
   * @default "ededed"
   */
  color?: string;

  /**
   * Override the GitHub host or API base URL for this resource only (e.g.
   * `github.example.com` for GitHub Enterprise). Falls back to
   * `GitHub.providers({ baseUrl })`, then to the host resolved by the auth
   * provider. Changing it replaces the resource — the same name on a
   * different GitHub instance is a different physical resource.
   */
  baseUrl?: string;
}

export interface Label extends Resource<
  "GitHub.Label",
  LabelProps,
  {
    /**
     * Numeric ID of the label in GitHub.
     */
    labelId: number;

    /**
     * GraphQL node ID of the label.
     */
    nodeId: string;

    /**
     * API URL to access the label.
     */
    url: string;

    /**
     * Label color as a hex code.
     */
    color: string;

    /**
     * Whether this is a default label.
     */
    default: boolean;
  },
  never,
  GitHub.Providers
> {}

/**
 * A GitHub repository label.
 *
 * `Label` manages the lifecycle of a repository label used to categorize
 * issues and pull requests. Labels are created on first deploy and updated
 * in place on subsequent deploys. The resource defaults to **retain** on
 * removal — destroying the stack does NOT delete the label on GitHub,
 * preserving historical categorization on issues.
 *
 * Authentication is resolved via the `GitHubCredentials` service supplied
 * by `GitHub.providers()` (env, stored PAT, `gh` CLI, or OAuth). The token
 * needs `repo` scope for private repositories or `public_repo` for public
 * ones.
 * ### Creating a Label
 * **Example:** Basic Label
 * ```typescript
 * yield* GitHub.Label("bug", {
 *   owner: "my-org",
 *   repository: "my-repo",
 *   name: "bug",
 *   description: "Something isn't working",
 *   color: "d73a4a",
 * });
 * ```
 *
 * **Example:** Multiple Labels
 * ```typescript
 * yield* GitHub.Label("enhancement", {
 *   owner: "my-org",
 *   repository: "my-repo",
 *   name: "enhancement",
 *   description: "New feature or request",
 *   color: "a2eeef",
 * });
 *
 * yield* GitHub.Label("documentation", {
 *   owner: "my-org",
 *   repository: "my-repo",
 *   name: "documentation",
 *   description: "Improvements or additions to documentation",
 *   color: "0075ca",
 * });
 * ```
 *
 * ### Wiring with Repository
 * A common pattern is defining labels alongside the repository so the entire
 * configuration lives in one program.
 *
 * **Example:** Labels for a New Repository
 * ```typescript
 * const repo = yield* GitHub.Repository("api", {
 *   owner: "my-org",
 *   name: "api",
 *   autoInit: true,
 * });
 *
 * yield* GitHub.Label("bug", {
 *   owner: "my-org",
 *   repository: repo.name!,
 *   name: "bug",
 *   color: "d73a4a",
 * });
 * ```
 *
 * @resource
 */
export const Label = Resource<Label>("GitHub.Label", {
  defaultRemovalPolicy: "retain",
});

export const LabelProvider = () =>
  Provider.succeed(Label, {
    stables: ["labelId", "nodeId"],

    // A label belongs to (host, owner, repository) and is keyed by name — GitHub
    // has no rename API for labels, so changing any of these identity fields
    // replaces the resource: the engine creates the new label first, then `delete`
    // removes the old one. Replacement is safe here — a label is declarative config
    // that is fully re-creatable from props.
    diff: Effect.fn(function* ({ news, olds }) {
      if (!isResolved(news)) return;
      if (olds === undefined) return;
      if (
        news.owner !== olds.owner ||
        news.repository !== olds.repository ||
        news.name !== olds.name ||
        (yield* gitHubBaseUrlChanged(olds, news))
      ) {
        return { action: "replace" };
      }
    }),

    reconcile: Effect.fn(function* ({ news, olds }) {
      const octokit = yield* octokitFor(news.baseUrl);

      // Observe — probe for the live label by name. GitHub returns 404 when
      // the label doesn't exist (deleted out-of-band, or never created).
      const observed = yield* Effect.tryPromise({
        try: async () => {
          try {
            const { data } = await octokit.rest.issues.getLabel({
              owner: news.owner,
              repo: news.repository,
              name: news.name,
            });
            return data;
          } catch (error: any) {
            if (error.status === 404) return undefined;
            throw error;
          }
        },
        catch: (e) => e as Error,
      });

      // Ensure — POST creates the label when it does not exist.
      if (observed === undefined) {
        const { data } = yield* Effect.tryPromise(() =>
          octokit.rest.issues.createLabel({
            owner: news.owner,
            repo: news.repository,
            name: news.name,
            description: news.description,
            color: news.color ?? "ededed",
          }),
        );
        return toAttrs(data);
      }

      // Sync — PATCH updates the label's mutable attributes (description, color).
      // Only issue the update when something actually changed to keep the API quiet.
      const desiredColor = news.color ?? "ededed";
      const desiredDescription = news.description ?? "";
      if (
        observed.color !== desiredColor ||
        (observed.description ?? "") !== desiredDescription
      ) {
        const { data } = yield* Effect.tryPromise(() =>
          octokit.rest.issues.updateLabel({
            owner: news.owner,
            repo: news.repository,
            name: news.name,
            description: news.description,
            color: desiredColor,
          }),
        );
        return toAttrs(data);
      }

      return toAttrs(observed);
    }),

    // GitHub labels are repo-scoped. Enumerate every repository the authenticated
    // token can see, then list each repo's labels.
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
                const labels = await octokit.paginate(
                  octokit.rest.issues.listLabelsForRepo,
                  {
                    owner: repo.owner.login,
                    repo: repo.name,
                    per_page: 100,
                  },
                );
                return labels.map(toAttrs);
              } catch (error: any) {
                // Repos with Issues disabled, or where the token lacks the
                // `repo`/`issues` scope, reject the labels endpoint with
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

    delete: Effect.fn(function* ({ olds }) {
      const octokit = yield* octokitFor(olds.baseUrl);

      yield* Effect.tryPromise(async () => {
        try {
          await octokit.rest.issues.deleteLabel({
            owner: olds.owner,
            repo: olds.repository,
            name: olds.name,
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
  node_id: string;
  url: string;
  color: string;
  default: boolean;
}): Label["Attributes"] => ({
  labelId: data.id,
  nodeId: data.node_id,
  url: data.url,
  color: data.color,
  default: data.default,
});
