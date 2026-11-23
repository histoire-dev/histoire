# Troubleshooting

## Dev console falls back to plain output

The interactive panel needs a TTY for stdin and stdout, raw input, and at least 40 columns by 10 rows. On non-Windows systems it also needs a usable `TERM`. CI and an attached Node inspector disable automatic activation. Match your setup to one of these cases.

- Piped output or a task runner without a TTY: run the command in a real terminal.
- Small window: enlarge it. The panel returns by itself.
- CI or debugger: pass `--tui` to force the panel. This does not bypass a missing TTY or small terminal.
- Panel unwanted: pass `--no-tui` or set `HISTOIRE_TUI=plain`.

Invalid `HISTOIRE_TUI` values fail at startup; use `plain`, `auto` or `1`.

Copy shortcuts (`y`, `Y`) use `pbcopy`, `clip`, `wl-copy`, `xclip` or `xsel` when available. Otherwise Histoire sends an OSC 52 request on an interactive terminal; the terminal must allow it (over SSH or tmux you may need to enable clipboard passthrough). Very large copies can exceed the OSC 52 size limit. If copying fails, the console says so and nothing is copied.

Terminal behavior is verified on Linux only.

### Retention limits

The console keeps the latest 2,000 log entries (2 MiB), 500 HTTP requests and 20 completed test runs (8 MiB). Older entries are dropped and the views show how many were omitted. Test results from a run that finished before a restart stay readable as historical; pages not fetched before the old runtime ended are unavailable, and Histoire does not rerun tests to recover them.

## Chrome tabs crash on Linux with Flatpak

A Histoire tab can become blank or unresponsive during repeated canvas scrolling or panning if Flatpak Chrome's sandboxed processes inherit a low file descriptor limit. The browser window can remain open after the tab's renderer exits. A debugger may report `Render process gone`.

As you move around the canvas, Histoire mounts and unmounts story frames. This creates IPC sockets and shared-memory handles. Switching variants within one story can reuse the primary frame and create fewer handles.

These symptoms alone do not establish descriptor exhaustion. Check the inherited limits before applying this workaround.

### Check inherited file descriptor limits

Run these commands on the host, outside the Flatpak sandbox:

```bash
flatpak info com.google.Chrome
systemctl --user show flatpak-portal.service \
  --property=MainPID --property=LimitNOFILE --property=LimitNOFILESoft

portal_pid=$(systemctl --user show flatpak-portal.service --property=MainPID --value)
ps -p "$portal_pid" -o user=,comm=,args=
readlink "/proc/$portal_pid/exe"
prlimit --pid "$portal_pid" --nofile
```

The confirmed failure had a portal soft limit of **1024** and hard limit of **524288**. Flatpak Chrome's sandboxed zygote and renderer processes inherited the soft limit. The browser's main process had a higher limit, so checking only that process missed the problem.

For a Chrome child process, inspect its **host PID**:

```bash
# Replace 12345 with the host PID being inspected.
chrome_pid=12345
ps -p "$chrome_pid" -o user=,comm=,args=
readlink "/proc/$chrome_pid/exe"
cat "/proc/$chrome_pid/cgroup"
prlimit --pid "$chrome_pid" --nofile
```

Use a host process viewer such as `ps -u "$(id -u)" -o pid,ppid,args --forest` to find candidates. Verify your UID, Chrome executable, and the stable app's `app-flatpak-com.google.Chrome-*.scope` cgroup. Zypak sandbox children can retain `--type=zygote` in their command line; searching only for `--type=renderer` misses them. PIDs reported inside Chrome's sandbox may differ from host PIDs. The `NSpid` line in `/proc/<host-pid>/status` shows the namespace mapping.

In an advanced renderer IPC trace, the confirmed failure reached descriptor **1023**, then recorded `recvmsg` with `MSG_CTRUNC`, followed by `exit_group(0)`. No OOM or fatal signal was required. Linux closes excess descriptors received through `SCM_RIGHTS` when they would exceed `RLIMIT_NOFILE`; see [`unix(7)`](https://man7.org/linux/man-pages/man7/unix.7.html).

### Raise the portal limit

Inspect existing service overrides with `systemctl --user cat flatpak-portal.service`. Create `~/.config/systemd/user/flatpak-portal.service.d/90-nofile.conf` without replacing an existing file:

```ini
[Service]
LimitNOFILE=65536:524288
```

Use the observed hard limit after the colon; **524288** is the tested value. Keep an already higher soft limit. If the current hard limit is below **65536**, this example cannot be applied without separately raising that ceiling.

The `soft:hard` form preserves the high ceiling. A single value would set both limits to that value. See [`systemd.exec(5)`](https://man7.org/linux/man-pages/man5/systemd.exec.5.html).

```bash
systemctl --user daemon-reload
systemctl --user show flatpak-portal.service \
  --property=LimitNOFILE --property=LimitNOFILESoft --property=DropInPaths
```

`daemon-reload` updates service configuration, but does not change the running portal's limits. For immediate activation, resolve the current PID again and verify it still belongs to your user and runs the Flatpak portal:

```bash
portal_pid=$(systemctl --user show flatpak-portal.service --property=MainPID --value)
ps -p "$portal_pid" -o user=,comm=,args=
readlink "/proc/$portal_pid/exe"
prlimit --pid "$portal_pid" --nofile

# Run only after verifying the process and a soft limit below 65536.
prlimit --pid "$portal_pid" --nofile=65536:
prlimit --pid "$portal_pid" --nofile
```

The trailing colon leaves the hard limit unchanged; see [`prlimit(1)`](https://man7.org/linux/man-pages/man1/prlimit.1.html). This service override also affects future sandboxed processes launched through the Flatpak portal. Changing shell `ulimit -n` alone does not update the independently running portal.

Save your work, fully quit Chrome, and reopen it so its zygotes and renderers inherit the new limit. Closing only the failed tab leaves existing zygotes alive. Do not restart the portal while Flatpak apps are running. A normal future portal start will use the saved drop-in.

### Verify and undo

Check the **live** portal and new Chrome child limits with `prlimit --nofile`. Configured systemd values alone do not prove that running processes have the new limit. Repeat canvas scrolling, panning, and variant switching with normal asset loading, then check that the tab remains responsive.

The reproduced case used Flatpak Chrome **154.0.8037.97**. A soft limit of **1024** failed after approximately 10–15 native wheel events. Raising it to **65536** survived **200 events**, plus manual dragging, scrolling, and variant switching. Reducing the live-preview budget or deferring preview admission did not resolve the low-limit failure.

The higher limit resolved this reproduced failure. It does not establish that native descriptor retention stays bounded during longer sessions, or that every Chrome crash has this cause. If failures continue with verified higher child limits, collect Chrome version, installation type, live limits, reproduction steps, and relevant browser logs for a separate diagnosis.

Histoire keeps existing canvas frames mounted while you move, then updates them after pointer release or 150 ms without wheel or zoom input. [`ui.frameBudget`](../reference/config.md#ui-framebudget) defaults to **6** and caps live frames. If you confirmed a low inherited descriptor limit, apply the limit fix above.

To undo, remove only the drop-in added for this workaround and reload service configuration:

```bash
rm -- ~/.config/systemd/user/flatpak-portal.service.d/90-nofile.conf
systemctl --user daemon-reload
```

An immediate portal rollback can restore its recorded previous soft limit with `prlimit --pid "$portal_pid" --nofile=1024:` after resolving and verifying its current PID again. Use your recorded value if it differed from **1024**. Do not lower active Chrome processes' limits while they may hold descriptors above the old ceiling; they revert through normal process exit.
