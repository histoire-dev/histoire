# ACP ownership

Preference writes and explicit restarts reserve one control lane synchronously.
Prompt admission rejects while that lane is occupied. Configuration retires old
runtime callbacks before awaiting persistence; old records retain their slots
until teardown completes. Failed persistence leaves previous preferences intact,
but next prompt acquires fresh runtime callback authority.

POSIX adapters launch in private process groups. Stop signals that owned group
with SIGTERM, waits at most one second, then escalates to SIGKILL and observes
termination for another 250 ms. Direct exit observation is bounded by one second;
pipe close is bounded by 250 ms. Inherited pipe holders cannot block shutdown.
Natural adapter exit also retires its group. Workers that deliberately detach
into another process group escape this ownership boundary.

Windows stop uses OS `taskkill.exe /PID <ownedPid> /T /F`, without a shell, with a
two-second command timeout and direct-process fallback. This is not a Job Object:
Windows descendants whose adapter exited before tree termination are outside its
containment guarantee. POSIX descendant cleanup has real subprocess regressions;
Windows process-tree behavior requires native platform validation.

Version 2 user data records field-level overrides over fresh project defaults.
Private environment remains separate; writes preserve other projects. Version 1
snapshots have no reliable intent metadata, so migration conservatively preserves
legacy commands, opt-ins, context and permission policies as explicit overrides.
Migration never infers that an explicit `never` or `allow-src` policy was inherited.

Only server-verified config save receipts retire saved preset/policy overrides.
Preset arrays retire when current value matches submitted project value. Permission
fields retire independently; newer local edits keep ownership. Explicit reset
clears named local fields using current server project defaults, without writing
project config or deleting credentials/context/unrelated overrides.
