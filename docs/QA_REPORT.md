# TwinWorlds judge-style QA report (Sun 15 Nov, 22:00-22:40 PKT)

Tested on the dev build (same code as twinworlds.pages.dev): all 12 Mars and 8 Moon targets and missions, all 7 lenses, What-if, Time travel and "When is it most Mars-like", Time factor, Ask the Planet, Analyst, Field Brief, live "Right now" job, Mission Twin (Perseverance, Curiosity), Nerd Mode, Minerals and spectra, Ground type, Sky, Landsat, match zones, Undiscovered, Rehearsability, Story mode, sun slider, API docs. JavaScript errors during the sweep: 0.

## Fixed
1. InSight landing site was 4.5N 135.9E; corrected to 4.502N 135.623E (NASA).
2. Mare Tranquillitatis pit used Diviner daytime HIGH (127 C) and night LOW (-173 C) while Earth uses 10:30 and 22:30. Now uses Diviner at 10:30 / 22:30 for the same cell (113.9 / -167.9 C), extremes kept in the source note. Scores, sites, blind test and ground type re-run; blind-test medians unchanged.
3. Mars arctic (Phoenix) matched the Sahara with no explanation: its day and night are colder than anywhere on Earth, so temperature cannot vote. New warning on the match card and top list says so and points to chamber testing (also shown for the Moon, hot day / cold night).
4. AI Analyst and Field Brief were sent the rank scores of beyond-Earth dimensions (the Analyst then quoted "0.99 for temperature swing"). Now only voting dimensions are sent.
5. Shackleton rim showed a ground type (718) from a polar cell dominated by the dark crater floor; now "not defined: no regular night here".
6. "Top 0.0% of Earth" in When-is-it-best now reads "the best place on Earth that week".

## Known limits (honest answers for judges)
- Regional concentration: for 120 random Mars spots the best Earth place is in China 35% of the time (Kunlun 23%); for random Moon spots 67%. Cause: high, cold, dry, barren plateaus match best on the measurements Earth can reach, and on the Moon temperature cannot vote at all, so terrain and brightness decide. Variants tested (beyond-Earth values voting at half weight against Earth's extreme, with 1x or 2x width) increased the China share (to 65-75% on Mars) and did not fix Phoenix, so the current rule stays. The blind test still finds known analogs (Jezero: Atacama top 1.4%, Utah MDRS 0.8%).
- Acidalia: known analog sites rank poorly (median top 70%); its night and swing are beyond Earth and it is very dark and flat.
- Sky card (dust, water, UV) covers the three named Mars targets; the Mars Climate Database server stopped answering while fetching the 9 mission sites (script ready: re-run when it is back).
- Mission and click-anywhere spots are scored on the 1-degree grid cell that contains them (InSight shows 4.50N 135.50E, the cell centre).
- Rehearsability colours on the Mars 3D globe could not be checked in the test browser (it does not draw Mars); verify on the live site.
