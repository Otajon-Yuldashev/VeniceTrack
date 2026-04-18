import asyncio
import json
import os
import websockets
import httpx
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv("AISSTREAM_API_KEY")

VENICE_BBOX = [[[45.20, 12.20], [45.55, 12.55]]]

# store static ship data in memory, merges with position reports
ship_static = {}

async def connect():
    url = "wss://stream.aisstream.io/v0/stream"
    while True:
        try:
            async with websockets.connect(url) as ws:
                print(f"[{now()}] Connected to aisstream.io")
                await ws.send(json.dumps({
                    "APIKey": API_KEY,
                    "BoundingBoxes": VENICE_BBOX,
                    "FilterMessageTypes": ["PositionReport", "ShipStaticData"]
                }))
                async for raw in ws:
                    await handle(json.loads(raw))
        except Exception as e:
            print(f"[{now()}] Disconnected: {e} — reconnecting in 5s")
            await asyncio.sleep(5)

async def handle(msg):
    meta = msg.get("MetaData", {})
    mmsi = str(meta.get("MMSI", ""))
    msg_type = msg.get("MessageType", "")

    if msg_type == "ShipStaticData":
        static = msg["Message"]["ShipStaticData"]
        ship_static[mmsi] = {
            "ship_name": meta.get("ShipName", "").strip(),
            "ship_type": static.get("Type", 0),
            "destination": static.get("Destination", "").strip(),
            "call_sign": static.get("CallSign", "").strip(),
            "dim_a": static.get("Dimension", {}).get("A", 0),
            "dim_b": static.get("Dimension", {}).get("B", 0),
        }
        print(f"[{now()}] Static data stored for {ship_static[mmsi]['ship_name']} (MMSI {mmsi})")
        return

    if msg_type == "PositionReport":
        pos = msg["Message"]["PositionReport"]
        static = ship_static.get(mmsi, {})

        event = {
            "mmsi": mmsi,
            "ship_name": meta.get("ShipName", "").strip() or static.get("ship_name", "Unknown"),
            "latitude": meta.get("latitude"),
            "longitude": meta.get("longitude"),
            "sog": pos.get("Sog"),           # speed over ground in knots
            "cog": pos.get("Cog"),           # course over ground in degrees
            "true_heading": pos.get("TrueHeading"),
            "nav_status": pos.get("NavigationalStatus"),
            "ship_type": static.get("ship_type", 0),
            "destination": static.get("destination", ""),
            "call_sign": static.get("call_sign", ""),
            "length": static.get("dim_a", 0) + static.get("dim_b", 0),
            "timestamp": now()
        }

        print(f"[{now()}] {event['ship_name']:<22} | "
              f"{event['sog']} kn | "
              f"{event['latitude']:.4f}N {event['longitude']:.4f}E | "
              f"→ {event['destination'] or 'unknown'}")

def now():
    return datetime.now(timezone.utc).strftime("%H:%M:%S")

if __name__ == "__main__":
    asyncio.run(connect())

    