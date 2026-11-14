# TwinWorlds 🌍🔴🌕

**Which parts of the Moon and Mars can we rehearse on Earth, and which can't we?**

TwinWorlds scores places on Earth by how closely they match real lunar and
Martian sites, using measurements taken the same way on both worlds. It helps
mission planners find, compare, and understand terrestrial analog sites for
future Moon bases and Mars landings.

Built for **NASA Space Apps Challenge 2026** (NYC Local Event, virtual).

🔗 **Live site:** _coming soon_
🎬 **30-second demo:** _coming soon_

---

## The Problem

Teams test rovers, habitats, and procedures on Earth before flying them to the
Moon or Mars. But known analog sites are few, mostly described in words rather
than measured, and rarely compared on the conditions that actually matter.

## What TwinWorlds Does

- **Twin Globes:** pick a site on the Moon or Mars, see its best matches on Earth.
- **Analog Fingerprint:** per-dimension match scores (terrain, temperature,
  mineralogy, dust...) plus what Earth can't simulate.
- **Mission Lenses:** rescore Earth for a specific goal, like a lunar base or a
  rover test.
- _More features added as we build._

## How It Works

1. Pull matching measurements for Earth and for Moon/Mars target sites.
2. Normalize each feature to a common scale.
3. Score similarity per dimension, then combine with mission-specific weights.
4. Validate by checking whether the method rediscovers well-known analog sites.

## Data Sources

**NASA:** _list each dataset used, e.g. MODIS land surface temperature, LRO LOLA, MOLA_
**Space agency partners:** _e.g. ESA Mars Express, ISRO Chandrayaan-2, JAXA Kaguya_
**Other:** _e.g. Microsoft Planetary Computer, Open-Meteo / Meteomatics_

Full download links and versions: [`data/SOURCES.md`](data/SOURCES.md)

## Limitations

No place on Earth reproduces reduced gravity, the lunar vacuum, the thin Martian
atmosphere, or their radiation environments. TwinWorlds shows these as
permanent gaps on every site rather than hiding them.

## Tech Stack

_Fill in as you build: e.g. Python, FastAPI, globe.gl, Tiger Data, Gemini API, Vultr_

## Run It Locally

```bash
git clone https://github.com/ibrhaimsadat123/twinworlds.git
cd twinworlds
python -m venv .venv
# Windows: .venv\Scripts\Activate.ps1   |   Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
# copy .env.example to .env and add your own API keys
```

_Exact run commands added once the app is ready._

## Use of AI Tools

_Describe honestly, e.g. "Claude and GitHub Copilot were used to assist with code
and to critique our initial concept. AI-assisted code is marked in comments."_

## Team

- **Ibrahim Sadat**
- **Zohaib Riaz**
- _Teammates_

## References

_Every library, dataset, image, and code source used. Required by Space Apps._
