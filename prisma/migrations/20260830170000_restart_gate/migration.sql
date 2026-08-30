-- M10: the restart gate closes a real hardening gap left by M01, the
-- same shape as M09's fix for grade_reversals (D-060). Escalation's own
-- doc comment already claims finality ("no further transition anywhere
-- in the system reads or updates an escalation row once written") but
-- the init migration never enforced it at the privilege level.
REVOKE UPDATE, DELETE ON "escalations" FROM scit_app;
