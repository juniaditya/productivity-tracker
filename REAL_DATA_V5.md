# Timeline V5 — Calendar Blocks

V5 focuses the product on the manual Timeline experience.

## Interaction

- Desktop defaults to a 7-day Sunday–Saturday week view.
- Mobile defaults to a single-day view.
- Week / Day can still be toggled manually.
- Click-drag empty calendar space to create an activity block.
- Drag a block vertically to move its time and horizontally to move it to another visible day.
- Drag the top/bottom edge to resize start/end time.
- All interactions snap to 15 minutes.
- Maximum two overlapping activities remains enforced in both UI and Postgres.

## Block detail

Each Timeline block now stores:

- title
- category
- date
- start / end time
- note

Clicking a block opens an editor with Save, Delete, Duplicate, category, date, time, title, and note controls.

## Saving

V5 adds `save_timeline_days(jsonb)` so multiple dirty dates are saved in one database transaction. This matters when a drag moves a block from one day to another: the source and destination day are committed together.

Autosave remains enabled and menu navigation waits for the save queue to finish before leaving Timeline.
