# Implementation status

What has actually been built and verified in this theme. Maintained by the `scribe` agent, from the
shipped code — not by hand, and not from plans.

**Legend:** ✅ shipped (passed QA) · 🔄 in progress · ⚠️ escalated (failed 2 teams) · ⬜ not started

| Section | Status | Figma (desktop / mobile) | Interactive | Max diff | Rounds | Updated |
|---|---|---|---|---|---|---|
| dev-announcement-bar | ⬜ | 45196:1495 / 44955:1315 | — | — | — | — |
| dev-site-header | ⬜ | 45060:1441 / 45240:2518 | — | — | — | — |
| dev-promo-bar | ⬜ | 45060:1442 / 44796:1888 | — | — | — | — |
| dev-hero | ⬜ | 45031:3637 / 44935:4051 | — | — | — | — |
| *(unnamed — Frame 4)* | ⬜ | 45031:2763 / 44821:5378 | — | — | — | — |
| *(unnamed — Image and text 1)* | ⬜ | 45031:4009 / 44821:5279 | — | — | — | — |
| *(unnamed — Image and text 2)* | ⬜ | 45031:4035 / 44821:5419 | — | — | — | — |
| *(unnamed — Video section 1)* | ⬜ | 45031:4268 / 44821:5480 | — | — | — | — |
| dev-featured-product | ⬜ | 45031:3763 / 44821:5733 | — | — | — | — |
| *(unnamed — Image and Text 3)* | ⬜ | 45031:2800 / 44979:3461 | — | — | — | — |
| *(unnamed — Frame 6564)* | ⬜ | 45031:2809 / 44821:5835 | — | — | — | — |
| *(unnamed — Video section 2)* | ⬜ | 45031:4057 / 44821:1062 | — | — | — | — |
| dev-site-footer | ⬜ | 45060:1514 / 44821:918 | — | — | — | — |

Sections marked *(unnamed)* have no meaningful Figma layer name. The PM names them from their content
on first run and writes the name back into `.claude/figma-shopify.json`.

## Not yet decomposed

PDP, Our Story, Tree Fibre, Delivery & Returns, Contact, Shipping — page nodes are in
`.claude/figma-shopify.json`; their section lists get extracted when their lanes start.

## Components (drawers / modals, not page sections)

Basket, Menu drawer, Size Guide, Seasons/Tog Guide, Review Summary, Compare, Accordions — built after
the pages that use them.
