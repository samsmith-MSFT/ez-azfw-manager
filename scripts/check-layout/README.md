# Electron layout check

Phase 0 runs the real Vite-built renderer in the repository's Electron binary. It uses a hidden `BrowserWindow`, an isolated/sandboxed test preload, deterministic in-memory IPC data, and no browser or screenshot dependency.

## Run

Run the complete 17-entry size/zoom matrix across every tab, key view, and large overlay:

```sh
npm run check:layout
```

Run a focused view, window content size, or zoom:

```sh
npm run check:layout -- --view logs
npm run check:layout -- --view logs-details --size 1100x680 --zoom 200
npm run check:layout -- --size 1440x900 --zoom 150
npm run check:layout -- --list-views
```

Sizes are Electron **content** sizes in DIP, not the outside window frame. Zoom accepts either a percent (`200`) or factor (`2`). Focus flags must match an entry in the plan's matrix.

## Modes and output

The default is report/baseline mode. It records the current findings and exits successfully after the runner itself completes.

```sh
npm run check:layout -- --view rules --size 1100x680 --zoom 200 --baseline
```

Assertion mode makes the command exit nonzero when overlap, invalid clipping, inaccessible overflow, fixed-cell, minimum-text, target-size, contrast, or zoom/viewport guard rails fail:

```sh
npm run check:layout -- --assert
```

The generated output is under the ignored `out/layout-check/` directory:

- `results.json`: machine-readable measurements and findings
- `screenshots/`: one PNG per completed view/size/zoom scenario
- `renderer/`: temporary production renderer bundle
- `electron-user-data/`: isolated Electron test profile

Use `--skip-screenshots` for a faster measurement-only pass.

## Linux and graphical sessions

Electron creates a real hidden Chromium window, so Linux needs X11 or Wayland. An existing desktop session is preferred. A bare SSH shell without `DISPLAY` or `WAYLAND_DISPLAY` exits with an explanation:

```text
No Linux display was found ... use `xvfb-run -a npm run check:layout`
```

Linux CI can use a memory-only display; no second monitor is needed:

```sh
xvfb-run -a npm run check:layout
```

Windows and macOS graphical runners do not need Xvfb.

## What it checks

The DOM analysis distinguishes meaningful text-box overlap from text that is ellipsized or clipped by `overflow:hidden`/`clip`; modal runs are scoped to the open dialog so the scrim and underlying application are ignored for overlap checks. It also reports page and element overflow, horizontal scroll regions, relevant log-grid fixed cells (including Time and Port), Finding 6's Name/source-to-next-column gaps on large viewports, rendered text below 12 CSS px, interactive targets below 24×24 CSS px, and text contrast on computed backgrounds.

Expected ellipsis/truncation and intentional scroll regions are retained separately in the JSON. Assertion mode intentionally still fails on the current application; Phase 0 does not change styling to silence those findings.

## Finding 6 hardware confirmation for the final PR

The 3440×1440 and 5120×1440 Electron rows are exact **CSS content-size checks**, not confirmation on a physical 21:9/32:9 panel. The final PR must label automated coverage and real-hardware confirmation separately; do not claim the latter from a screenshot or virtual Electron window.

Ask the maintainer with the 5120×1440 monitor to maximise the app, then scale it down through the 3440-wide and normal-window sizes. At each size, confirm on Firewalls, Policies, Rules, and Firewall logs that row data stays close to the row's name/source and that the left-aligned empty area is acceptable. Also repeat at 100% and 150% zoom where the matrix calls for it, and record the monitor/OS display scaling as well as the app zoom. The final PR should name who performed this physical check and whether the curved-screen result was confirmed.

## Known limitations

- Screenshots and accessibility checks are Chromium/DOM approximations. Electron title-bar overlay geometry, operating-system scaling, traffic lights, screen readers, and real multi-monitor behavior still need platform-specific manual checks.
- Contrast analysis reads computed solid/translucent backgrounds but cannot model arbitrary images, gradients, selection states, or every pseudo-element.
- Data tables can expose an intentional horizontal scroll region. That is reported separately rather than treated as the same class of failure as hidden page overflow.
- The runner covers the common and largest views/wizards in the plan, not every possible resource-settings, cleanup, confirmation, dropdown, or runtime error state.
- The full cross-product creates hundreds of screenshots and can take several minutes. Focus flags are intended for local iteration.
