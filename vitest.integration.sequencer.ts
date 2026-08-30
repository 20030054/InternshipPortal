import { BaseSequencer, type TestSpecification } from "vitest/node";

/**
 * Lives at the project root, not under `tests/`, deliberately:
 * `.dockerignore` excludes `tests` from the Docker build context, but
 * `vitest.integration.config.ts` (a root-level file) still gets pulled
 * into Next's own build-time type-check via `tsconfig.json`'s
 * `include: ["**\/*.ts"]` — an import reaching back into `tests/` from
 * there resolves fine locally (the real files exist on disk) but fails
 * inside the Docker build, where `tests/` was never copied in. Found for
 * real while building M07.
 *
 * Vitest's default sequencer orders files by cached duration (for
 * shard-balancing), not by name — fine for a parallel, isolated suite,
 * but wrong here: `fileParallelism: false` (vitest.integration.config.ts)
 * exists specifically because these tests share one live database, and
 * this suite's own fixture files (BR01/BR02/M03's semester ranges, M05's
 * offer-fixtures.ts, etc.) all document and rely on a documented
 * "which file runs before which" ordering to keep one file's leftover
 * data from polluting another's. The default sequencer's duration-based
 * order isn't stable across runs (it shifts as the duration cache
 * changes, e.g. whenever files are added/removed) — confirmed by a
 * second real, reproduced failure while building M07:
 * M03_semester_open_close_exclusivity.test.ts (which closes a semester
 * carrying an uncontrolled, high sequenceNumber) ran *before*
 * M03_eligibility_route_ownership.test.ts in one run, silently inflating
 * its count, despite the two filenames sorting the other way
 * alphabetically.
 *
 * Forcing plain filename order makes the suite's existing "each file
 * reserves a numeric block, low blocks run first" comments actually
 * true, deterministically, every run.
 */
export default class AlphabeticalSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]): Promise<TestSpecification[]> {
    return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  }
}
