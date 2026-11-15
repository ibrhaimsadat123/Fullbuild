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
- Acidalia: known analog sites rank poorly (median top 70%). Now explained in the app from the data: famous sites score 0.28 on slope and 0.29 on hilliness vs 0.98 and 0.94 at the best places, because Acidalia is far flatter than the rugged sites used as analogs today (blind_test.json 'why').
- Sky card (dust, water, UV) now covers the three named Mars targets and all 9 NASA Mars mission sites (fixed). Click-anywhere spots have no Sky card.
- Mission sites now show their real landing coordinates, with a note that scoring uses the 1-degree cell that contains them (fixed).
- Rehearsability: verified the map layer loads and is shown on the Mars globe (3D tiles hidden, NASA Trek globe on, map layer ready). The test browser cannot paint Mars, so look once on the live site.

## Also fixed in the second pass
- 'Right now' card showed 'Bad target id' for mission sites; it now shows only for the three named Mars targets the live job covers.
- Sky card now refreshes when you pick a mission, and its dust sentence compares with the actual Earth place instead of always saying Mars is dustier.
