# Less is more: COVID-19 severity panel (data story)

Scrollytelling data story for ADA 2026, Group 27. It covers the path from the patient, through CITE-seq, to a small flow-cytometry panel.

## Structure

| File | Purpose |
|---|---|
| `index.html` | Story content (chapters, step texts). Uses `layout: story`. |
| `_layouts/story.html` | Page shell: fonts, CSS, d3 (cdnjs), `story.js`. |
| `assets/css/story.css` | All styles for the story. |
| `assets/js/story.js` | Scroll engine and one `init*` function per chapter. |

Graphics marked *illustrative*, *simulated* or *placeholder* are generated in the browser for storytelling. Replace them with real results as the analysis is finalised. The real numbers used so far (76 patients, 53/23 split, 188 proteins, preliminary AUROCs) come from the project README.

## Local preview

GitHub Pages builds the site automatically from `master`. To preview locally you need Jekyll (`bundle install && bundle exec jekyll serve`).
