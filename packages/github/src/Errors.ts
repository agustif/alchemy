import * as Data from "effect/Data";

/** The issue does not exist in the repository. */
export class IssueNotFound extends Data.TaggedError("IssueNotFound")<{
  readonly owner: string;
  readonly repository: string;
  readonly number: number;
}> {}

/** The pull request does not exist in the repository. */
export class PullRequestNotFound extends Data.TaggedError("PullRequestNotFound")<{
  readonly owner: string;
  readonly repository: string;
  readonly number: number;
}> {}
