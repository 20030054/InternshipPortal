-- =====================================================================
-- M04: corrects M01's cases_one_nonterminal_per_student partial index.
--
-- Read closely, the restart gate (MASTER_PROMPT.md §5.3) has the failed
-- case's own state progress CLOSED_INCOMPLETE -> RESTART_REQUESTED ->
-- RESTART_AUTHORIZED, at which point a SECOND, new Case row is created
-- (ELIGIBLE, previous_case_id set) for the same student. M01's original
-- terminal-states list for this index did not include
-- RESTART_AUTHORIZED -- meaning the old case, sitting in
-- RESTART_AUTHORIZED, would still count as "non-terminal" and collide
-- with the new case the moment it's created, violating BR-06 by the
-- letter of M01's own constraint. See docs/modules/M04.md "Scope
-- decisions" for the full reasoning, including why this doesn't
-- contradict BR-20's "the failed case remains CLOSED_INCOMPLETE
-- forever" (read as describing the immutable academic record -- the
-- grade row and the case_events audit trail -- not a literal promise
-- about the state column's string value).
--
-- No application code has shipped that relies on the old index
-- definition (M04 is the first module to reach the restart gate at
-- all), so this is a plain drop-and-recreate, not a data migration.
-- =====================================================================

DROP INDEX "cases_one_nonterminal_per_student";

CREATE UNIQUE INDEX "cases_one_nonterminal_per_student"
  ON "cases" ("student_id")
  WHERE "state" NOT IN (
    'CLOSED_PASS', 'CLOSED_INCOMPLETE', 'WITHDRAWN',
    'WAIVER_GRANTED', 'WAIVER_DENIED', 'RESTART_DENIED',
    'RESTART_AUTHORIZED'
  );
