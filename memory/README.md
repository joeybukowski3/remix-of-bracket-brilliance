# memory/ — chronological provenance

`memory/YYYY-MM-DD.md` files are a dated log of what was learned or done on a
given day. They are **provenance, not authority**.

- **Not routine startup context.** Normal startup uses [`AGENTS.md`](../AGENTS.md)
  and task-routed durable docs only (`DECISIONS.md` KS-002).
- **Lower authority than current durable docs.** In the authority hierarchy
  (`AGENTS.md` / `DECISIONS.md` KS-001) daily memory sits at level 8, alongside
  completed plans, audits, migrations, and PR history — below current model,
  feature, project, and architecture documentation.
- **When to read one:** only when tracing the history of a decision, or
  investigating a documentation/implementation conflict, and you need to know
  what was believed or changed on a specific date.
- Each file reflects what was true **when written**; verify any file/flag/command
  it names against the current tree before acting on it.

Do not rewrite these files to look current. Add new dated entries; leave old ones
as the record.
