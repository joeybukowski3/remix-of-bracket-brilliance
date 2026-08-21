# Decision registry

This file records accepted, durable repository-level decisions. It is not a sports-model methodology reference, implementation diary, audit log, or substitute for feature documentation.

## Status definitions

- **Accepted:** current repository direction until superseded by a higher-authority instruction or a later recorded decision
- **Superseded:** retained for provenance but no longer current
- **Open:** unresolved question; not authority for choosing an outcome

## Registry

| ID | Date | Status | Decision |
| --- | --- | --- | --- |
| KS-001 | 2026-08-21 | Accepted | Repository context follows the authority hierarchy recorded below. |
| KS-002 | 2026-08-21 | Accepted | Routine startup uses `AGENTS.md` and task-routed durable documentation; `SOUL.md`, `USER.md`, and daily `memory/` files are not mandatory startup context. |
| KS-003 | 2026-08-21 | Accepted | Documentation/implementation conflicts must be investigated and reported, never silently resolved. |
| KS-004 | 2026-08-21 | Accepted | Historical plans, audits, migrations, memory, and PR history remain provenance but do not automatically describe current authority. |
| KS-005 | 2026-08-21 | Accepted | Generated artifacts are changed through their producers unless artifact-level editing is explicitly authorized; unclear ownership must be investigated. |
| KS-006 | 2026-08-21 | Accepted | Automated browser work must use the repository analytics-blocking setup and must not send Google Analytics or Google Tag Manager traffic. |

## KS-001: authority hierarchy

Use this order when sources conflict:

1. Current explicit user instruction
2. Approved active plan
3. `docs/DECISIONS.md`
4. Relevant current model documentation
5. Relevant current feature documentation
6. Project, architecture, data, and brand documentation
7. Current implementation and tests
8. Completed plans, audits, migrations, memory, and PR history
9. Chat history

Higher authority does not make contradictory evidence disappear. Apply KS-003 whenever documentation and implementation disagree.

## Open questions

| ID | Date | Status | Question |
| --- | --- | --- | --- |
| OPEN-001 | 2026-08-21 | Open | Which configured deployment mechanism is authoritative for production? |

See `docs/ARCHITECTURE.md` for the observed evidence. Obtain current evidence or explicit direction before resolving the question.

## Adding decisions

Add an entry only when a repository-level choice has been explicitly approved or is already established by authoritative evidence. Keep entries concise, link detailed feature or model documentation instead of copying it, and mark replaced entries **Superseded** rather than deleting them.
