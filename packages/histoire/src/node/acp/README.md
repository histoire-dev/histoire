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

Full registry and model catalogs use dev-only HTTP routes, separate from 64 KB HMR
preference snapshots. Catalog refresh cannot change opt-ins or commands. Managed
presets retain stable local IDs and refer to server-resolved registry IDs; archive
URLs, distribution environment and resolved cache paths never enter user settings.
Validated registry cache lasts 24 hours; failed fetches retain last valid catalog.

Managed launch preparation captures an abort signal before fetching/installing.
Configuration retirement aborts preparation before awaiting writes. Binary installs
use content-addressed directories and temporary extraction; executable publication
is atomic and older versions remain intact. ZIP and TAR paths/links must stay inside
extraction root. Advertised archive SHA-256 is verified before extraction.

Discovery uses separate temporary runtimes, at most two concurrently. It sends no
prompt, advertises no MCP servers, denies permission requests and stops owned
process tree in finally. Cache keys include configuration/environment and discovery
generation; retired requests cannot publish choices for replacement runtime.

Session creation keeps configOptions. Saved model applies before effort, using
returned configuration after each request. Rejected preferences continue with
accepted configuration and public warning. Literal model `default` is never sent
as override. Idle config_option_update notifications update retained session state
before prompt-specific reply filtering.
