import * as GitHub from "@/GitHub";
import * as Provider from "@/Provider";
import * as Test from "@/Test/Alchemy";
import { expect } from "alchemy-test";
import * as Effect from "effect/Effect";
import { MinimumLogLevel } from "effect/References";

const { test } = Test.make({ providers: GitHub.providers() });

const logLevel = Effect.provideService(
  MinimumLogLevel,
  process.env.DEBUG ? "Debug" : "Info",
);

// Creating a real repository + milestone requires an owner the token can
// write to — the dedicated test org (never a real one). Set
// GITHUB_TEST_OWNER="" to skip.
const owner = process.env.GITHUB_TEST_OWNER ?? "alchemy-run-test";
const repo = process.env.GITHUB_TEST_REPOSITORY ?? "test-repo";

test.provider.skipIf(!owner)(
  "list enumerates the deployed milestone",
  (stack) =>
    Effect.gen(function* () {
      // Clean up any leftovers from a previous run before deploying.
      yield* stack.destroy();

      yield* stack.deploy(
        Effect.gen(function* () {
          // `Repository` defaults to `retain`, so we intentionally do NOT pipe
          // `destroy()` here: the test only needs a repo to host the milestone,
          // and deleting it would require `delete_repo`/admin rights. The repo
          // is created once and reused (reconcile is idempotent).
          const repository = yield* GitHub.Repository("Repo", {
            owner,
            name: repo,
            description: "alchemy-effect milestone list test",
            visibility: "private",
            autoInit: true,
          });

          return yield* GitHub.Milestone("TestMilestone", {
            owner,
            repository: repo,
            title: "Alchemy Test Milestone",
            description: "Milestone for testing",
            dueOn: "2026-12-31T23:59:59Z",
          });
        }),
      );

      // Resolve the provider with the typed helper so `list()`'s element type
      // is the resource's `Attributes` (no `any`).
      const provider = yield* Provider.findProvider(GitHub.Milestone);
      const all = yield* provider.list();

      // `list()` enumerates every milestone across all repos the token can see.
      // The milestone we just deployed guarantees at least one row.
      expect(all.length).toBeGreaterThan(0);
      expect(all.every((m) => typeof m.milestoneId === "number")).toBe(true);
      expect(all.every((m) => typeof m.number === "number")).toBe(true);
      expect(all.every((m) => m.state === "open" || m.state === "closed")).toBe(
        true,
      );

      yield* stack.destroy();
    }).pipe(logLevel),
  { timeout: 180_000 },
);
