# DishDeals tenets

Tenets are priorities, not rules. When two good options conflict, pick the one that serves the higher tenet. Rules live in `AGENTS.md`; the spec is the plan.

1. **A working demo beats more features.** The judged moment is a signed-in member posting a deal from a phone (T-07, checkpoint A) and seeing it in the feed. Work that unblocks that path comes first; anything else waits or gets cut.
2. **Build for hackathon scale.** Expect a few hundred users and one Convex deployment. Do not add caching layers, queues, background workers, retries beyond the plan's, or abstractions for features that are not on the task board.
3. **Smallest change that passes.** Prefer the shortest diff that meets the ticket's Done-when. Small PRs are easier to test, review and merge. If a ticket grows past one function or one screen plus its tests, split it and say so in the handoff.
4. **Legible over clever.** A fresh agent given only the file and its tests should be able to explain what the code does and why. If it could not, rewrite it plainly. Comments explain *why*, not *what*.
5. **Contracts are stable.** Table fields, function names, `lat`/`lng` and `DealResult` are shared with human teammates. Adapt your code to the contract; change the contract only through a human and a decision record.
6. **Honest evidence over a green status.** A blocked ticket with an exact blocker is more useful than a pass built on mocks, guesses or unrun commands.
