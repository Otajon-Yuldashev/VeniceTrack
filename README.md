# VeniceTrack 🚢

A real-time maritime intelligence platform for Venice Lagoon. Live AIS vessel positions ingested via a custom WebSocket bridge into Microsoft Fabric's streaming pipeline, transformed through a PySpark medallion architecture, and served through a Flask API to a React frontend — built as a data engineering portfolio project.

---

## What it does

A user opens the live map and sees:

- Every AIS-broadcasting vessel in Venice Lagoon as a directional triangle, colored by vessel type, updated every 15 seconds
- Speed violation alerts (⚠) for vessels exceeding 5 knots with pulsing ring indicators
- Vessel detail panel showing name, type, speed, destination, ETA, dimensions, draught, nav status, and a direct link to MarineTraffic
- Analytics dashboard with hourly violation distribution, vessel type activity breakdown, and repeat offender leaderboard

---

## Architecture — Kappa

VeniceTrack implements Kappa architecture: a single streaming pipeline serves as both the real-time and historical data source. There is no separate batch ingestion path. PySpark reads from the same immutable event log that feeds the live UI, replaying history as needed.

```
AIS Transponder (ship broadcasts position every 2–10s)
    ↓
aisstream.io (WebSocket aggregator)
    ↓
bridge.py (Python — GCP e2-micro VM, runs 24/7 via nohup)
    ↓ Event Hub protocol
Fabric Eventstream · AIS_Venice_Stream
    ↓ fan-out to two sinks
    ├──→ KQL Eventhouse · venice_ais · vessels-data table
    │       (hot path — millisecond queries, 3,650-day retention)
    └──→ Lakehouse · venicetrack_lakehouse · bronze.vessels (Delta)
            (cold path — open format, PySpark reads natively)
                ↓ hourly · Data Factory pipeline
            silver.vessels_clean
            (deduplicated, validated, is_violation flag, vessel_category)
                ↓ daily · Data Factory pipeline
            gold.repeat_offenders
            gold.peak_hours
            gold.vessel_type_stats
                ↓
            Flask API · api.py (GCP VM, port 5000)
            (authenticates to OneLake via storage token, serves JSON)
                ↓
            React UI · Vite · Leaflet · Recharts
```

---

## Ideal Production Architecture

In the ideal deployment with Microsoft Entra service principal authentication:

```
React UI (Vercel)
    ↓ fetch
Flask API (GCP VM)
    ↓ ClientSecretCredential — OAuth 2.0 client credentials flow
KQL Eventhouse (direct millisecond query)
    vessels-data | summarize arg_max(timestamp, *) by mmsi
```

The service principal authenticates using Client ID + Client Secret + Tenant ID. Token renewal is handled automatically by the Azure SDK — no scheduled notebooks, no manual refresh. React queries KQL directly for live positions (true real-time) and Gold Delta tables for analytics.

---

## Medallion Architecture

| Layer | Location | Written by | Read by | Purpose |
|---|---|---|---|---|
| Bronze | `bronze.vessels` (Delta) | Eventstream | PySpark Silver | Raw immutable event log |
| Silver | `silver.vessels_clean` (Delta) | PySpark hourly | PySpark Gold | Deduplicated, validated, enriched |
| Gold | `gold.*` (Delta) | PySpark daily | Flask API → React | Pre-aggregated analytics |

Silver transformations: duplicate removal by MMSI+timestamp, bounding box validation, impossible speed filtering (SOG > 50 kn), `is_violation` flag (SOG > 5 kn), `vessel_category` enrichment.

Gold tables: `repeat_offenders` (violation count + avg/max speed per vessel), `peak_hours` (violations by hour of day), `vessel_type_stats` (activity and violation breakdown by vessel category).

---

## AIS Data

Each vessel broadcasts two message types over radio:

**PositionReport** — transmitted every 2–10 seconds when underway, every 3 minutes when anchored. Contains: latitude, longitude, SOG (speed over ground in knots), COG (course over ground), true heading, rate of turn, navigational status.

**ShipStaticData** — transmitted every 6 hours. Contains: ship name, MMSI, IMO number, call sign, ship type code, destination, ETA, dimensions (length, width), maximum draught.

bridge.py merges both message types per MMSI in memory, decodes ship type codes to human-readable labels (ITU-R M.1371 standard), and forwards complete events to Fabric Eventstream via the Azure Event Hub protocol.

Venice Lagoon bounding box: `[[45.20, 12.20], [45.55, 12.55]]`

---

## Tech Stack

| Layer | Technology |
|---|---|
| AIS data source | aisstream.io (WebSocket, free tier) |
| Bridge runtime | Python 3.11 — websockets, azure-eventhub |
| Bridge hosting | GCP Compute Engine e2-micro (always-free tier) |
| Streaming ingestion | Microsoft Fabric Eventstream |
| Real-time storage | Microsoft Fabric Eventhouse (KQL Database) |
| Batch storage | Microsoft Fabric Lakehouse (Delta Parquet on OneLake) |
| Batch processing | Apache Spark (PySpark) on Fabric |
| Orchestration | Microsoft Fabric Data Factory (hourly + daily triggers) |
| Serving API | Flask + flask-cors + deltalake (Python) |
| Frontend | React 18 + Vite + Leaflet + Recharts |
| Map tiles | OpenStreetMap base + OpenSeaMap nautical overlay |
| Deployment | Vercel (React) + GCP VM (Flask + bridge) |

---

## Repository Structure

```
VeniceTrack/
├── bridge.py                    # AIS WebSocket bridge → Fabric Eventstream
├── api.py                       # Flask API serving vessel + analytics data
├── notebooks/
│   ├── silver_notebook.ipynb    # PySpark Bronze → Silver transformation
│   ├── gold_notebook.ipynb      # PySpark Silver → Gold aggregation
│   └── token_refresh.ipynb      # OneLake storage token refresh (workaround)
├── schema/
│   ├── kql_schema.kql           # KQL vessels-data table DDL
│   └── lakehouse_schema.sql     # Lakehouse bronze.vessels table DDL
├── ui/
│   ├── src/
│   │   └── App.jsx              # React UI — live map + analytics dashboard
│   ├── package.json
│   └── vite.config.js
├── .gitignore
└── README.md
```

---

## Fabric Infrastructure

| Resource | Details |
|---|---|
| Workspace | VeniceTrack |
| Eventstream | AIS_Venice_Stream — custom endpoint source, 2 destinations |
| Eventhouse | venice_ais — KQL database, vessels-data table (22 columns) |
| Lakehouse | venicetrack_lakehouse — bronze / silver / gold schemas |
| Data Factory pipeline | venicetrack_orchestration — hourly Silver, daily Gold |
| Capacity | F64 trial — ~4–8 CUs utilized out of 64 available |

---

## GCP Infrastructure

| Resource | Details |
|---|---|
| Instance | venicetrack-instance |
| Machine type | e2-micro (1 vCPU, 1 GB RAM) — always-free tier |
| Region | us-central1-a |
| OS | Debian 12 |
| Cost | $0 — covered by GCP always-free tier |
| Processes | bridge.py + api.py running via nohup 24/7 |

---

## Data Volume

Venice Lagoon has 50–200 active AIS vessels at any time. Realistic ingestion rate:

- ~5,000–6,000 rows per day
- ~150,000–180,000 rows per month
- ~50–100 MB per month in Delta Parquet format

Total infrastructure cost: **$0** — aisstream.io free, GCP e2-micro always-free, Fabric F64 trial, Vercel free tier.

---

## Key Design Decisions

**Kappa over Lambda:** A single streaming pipeline handles both real-time ingestion and historical analysis. PySpark replays the Bronze event log rather than maintaining a separate batch ingestion path. Simpler, fewer failure points, same correctness.

**Append-only immutable log:** Every AIS broadcast is a new row — never updated, never deleted. This is event sourcing applied to maritime data. The full vessel history is preserved for replay, time-travel queries, and reprocessing Silver/Gold if transformation logic changes.

**Eventhouse + Lakehouse fan-out:** KQL Eventhouse serves millisecond time-series queries for the live UI. Lakehouse Bronze stores Delta Parquet for PySpark — which cannot read KQL natively. Both receive the same events simultaneously via Eventstream fan-out.

**Separate medallion schemas:** `bronze`, `silver`, `gold` as distinct Lakehouse schemas rather than a single schema. Each layer has independent permissions, clear data contracts, and maps directly to pipeline stages.

**Ship type decoding at ingestion:** AIS ship type codes (ITU-R M.1371) are decoded to human-readable labels in bridge.py before reaching Fabric. Avoids repeated decoding in every downstream query.

---

## Silver Transformations

```python
# Deduplication — same MMSI + timestamp from multiple AIS receivers
df.dropDuplicates(["mmsi", "timestamp"])

# Bounding box enforcement — GPS glitches
df.filter(col("latitude").between(45.20, 45.55))
df.filter(col("longitude").between(12.20, 12.55))

# Data quality — impossible values
df.filter((col("sog") >= 0) & (col("sog") < 50))

# Feature engineering
df.withColumn("is_violation", when(col("sog") > 5.0, True).otherwise(False))
df.withColumn("vessel_category",
    when(col("ship_type_code").between(60, 69), "Passenger")
    .when(col("ship_type_code").between(70, 79), "Cargo")
    .when(col("ship_type_code").between(80, 89), "Tanker")
    .when(col("ship_type_code") == 52, "Tug")
    .when(col("ship_type_code") == 30, "Fishing")
    .when(col("ship_type_code") == 37, "Pleasure craft")
    .otherwise("Other")
)
```

---

## Local Development

Requires an aisstream.io API key and a Microsoft Fabric workspace with Eventstream configured.

```bash
# Bridge
pip install websockets azure-eventhub python-dotenv
cp .env.example .env  # add AISSTREAM_API_KEY and FABRIC_CONNECTION_STRING
python bridge.py

# API
pip install flask flask-cors deltalake pyarrow pandas
python api.py

# UI
cd ui
npm install
npm run dev
```

---

## About

Built as a data engineering portfolio project. Not intended for production maritime safety use.
