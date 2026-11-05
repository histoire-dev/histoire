# 25 — Visual polish: plugin detail

Status: **complete**. Wave 12 (parallel with 24, 26, 27). Follow the shared rules in [24](24-polish-browse.md#shared-rules-for-slices-2427). Board: `4A-DetailPage.dc.html`.

## Owned files

`APP/components/marketplace/detail/**` (not `InstallSplitButton`, removed earlier).

## Fixes

1. Single breadcrumb "All plugins / <Category>" (links: All plugins view, category filter); the modal's global back row is removed by 24. Content `max-width: 1080px` centered.
2. Header per 4A: 64px tile (14px radius), 28px extra-bold title + Official chip, muted line `<mono package> · by <publisher>`, Install split action (`WorkbenchPanelAction` + `overlayTarget`, keep) and a 32px icon button to the docs URL when present.
3. Tabs: underline tab row (bottom border, 22px gap, selected = text color + 2px accent underline), proper `tablist`/`tab` roles and keyboard behavior kept.
4. Overview: summary 14px body text, max 640px. "Adds to your workbench" heading 14px extra-bold + 3-column cards (bold kind title + muted text); empty state only when there are no adds.
5. Meta column: a card (`flex: 1 1 260px`, 18px padding) with a `<dl>` (Version mono, Updated only when known, License, Requires mono, Frameworks chips with the detected one accent, else "Any"), divider, "Access" list, "Repository" accent link.
6. Options/Changelog/Versions tabs: same card and typography language; Versions rows show incompatible reason muted.

## Acceptance

- Vue detail specs pass; styling guard; ESLint clean.
