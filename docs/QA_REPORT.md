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

## Pass 3 (Mon 16 Nov, 05:00 PKT): judge review after the design pass
- Fixed: Minerals card ignored the selected site. It now (a) says how far the site is from the only rover-chemistry site (Gale, Rocknest), and (b) opens the spectrum of the CRISM reference detection nearest the site, with every option labelled by distance (Jezero: Fe-olivine at Nili Fossae, 230 km; Phoenix: north polar gypsum, 715 km; Opportunity: Fe-smectite at Mawrth Vallis, 1,789 km).
- Fixed: switching targets quickly could stack two heatmaps and threw "Cannot read properties of null (reading 'res')". Heatmap drawing now discards a layer that finished loading after a newer request.
- Swept all 12 Mars and 8 Moon sites again after the redesign: 0 JavaScript errors, cards appear in the right tabs, temperature warning shows for Phoenix, all Apollo sites and the Tranquillitatis pit.
- Data weight on first load: ~23 MB uncompressed in dev (scores 4.3 MB, Earth grid 5.6 MB, Mars grid 3.2 MB); Cloudflare compresses JSON, so roughly 4-6 MB over the wire.

## Pass 4: load and judge-suggested improvements

- Smoother first load: the splash now waits for both globes' first tiles (at most 4 s, forced after 12 s), then the two panes open from the seam; the side drawer and dock stay hidden until then. Verified in the browser: `body.ready` set, splash removed, heatmap drawn.
- Lazy tabs: Science and Explore cards render only when their tab is opened (always on phones, where all cards stack).
- Top places: new "Closest / Spread worldwide" toggle. Spread keeps each pick at least 2,000 km from the ones above it. Jezero: Kunlun, Gobi (China), Iceland, Patagonia, Iran, Altiplano.
- Sky card for click-anywhere Mars spots uses the nearest modelled point within 1,500 km and says so.
- Fixed: Sky card showed coordinates instead of the Earth place name when it rendered before place names loaded.
- Minerals: Jezero and Perseverance now show Perseverance's own SuperCam chemistry of the Máaz crater floor (SiO2 48-50, Al2O3 9.3-10, FeO 18-19 wt%). Only the oxides the paper reports are shown; no full PIXL table was found, so none is invented.
