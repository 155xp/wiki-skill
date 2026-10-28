# Note reads in Obsidian

The Markdown itself must read cleanly in Obsidian: properties, callouts, footnotes, tables, embedded figures, and `[[links]]` resolving through `aliases`.

## Sub-features
Titles double as link targets, so they avoid `: / \ # ^ [ ] |`.

## How to get to it (user POV)
Copy the note and its `figures/` into a vault and open it in reading view.

## Driving it with Obsidian on Xvfb
Start `Xvfb :43 -screen 0 1440x1000x24` and record its PID, launch the Obsidian AppImage with `DISPLAY=:43` and a vault whose `.obsidian/workspace.json` opens the note in preview, then capture with `import -window root` and scroll with `xdotool click 5`. Kill Obsidian and Xvfb by their PIDs.

## Gotchas
Obsidian shows the nested `infobox` map as raw JSON in the properties panel. The list form (`- "Label: value"`) displays as a list.
