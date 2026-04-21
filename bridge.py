import asyncio
import json
import os
import websockets
from datetime import datetime, timezone
from dotenv import load_dotenv
from azure.eventhub import EventData
from azure.eventhub.aio import EventHubProducerClient

load_dotenv()

API_KEY = os.getenv("AISSTREAM_API_KEY")
CONNECTION_STRING = os.getenv("FABRIC_CONNECTION_STRING")
EVENTHUB_NAME = "es_cb36f7c4-3f9e-428a-aa95-5a97c6dbd748"

VENICE_BBOX = [[[45.20, 12.20], [45.55, 12.55]]]

SHIP_TYPES = {
    0: "Unknown", 20: "Wing in ground", 29: "Wing in ground",
    30: "Fishing", 31: "Towing", 32: "Towing large",
    33: "Dredging", 34: "Diving ops", 35: "Military",
    36: "Sailing", 37: "Pleasure craft", 40: "High speed craft",
    50: "Pilot vessel", 51: "Search and rescue", 52: "Tug",
    53: "Port tender", 54: "Anti-pollution", 55: "Law enforcement",
    60: "Passenger", 61: "Passenger", 62: "Passenger",
    63: "Passenger", 64: "Passenger", 69: "Passenger",
    70: "Cargo", 71: "Cargo", 72: "Cargo",
    73: "Cargo", 74: "Cargo", 79: "Cargo",
    80: "Tanker", 81: "Tanker", 82: "Tanker",
    83: "Tanker", 84: "Tanker", 89: "Tanker",
    90: "Other", 99: "Other"
}

ship_static = {}

async def send_to_fabric(event):
    try:
        async with EventHubProducerClient.from_connection_string(
            conn_str=CONNECTION_STRING,
            eventhub_name=EVENTHUB_NAME
        ) as producer:
            batch = await producer.create_batch()
            batch.add(EventData(json.dumps(event)))
            await producer.send_batch(batch)
    except Exception as e:
        print(f"[{now()}] Fabric send error: {e}")

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
        ship_type_code = static.get("Type", 0)
        dim = static.get("Dimension", {})
        eta = static.get("Eta", {})

        ship_static[mmsi] = {
            "ship_name": meta.get("ShipName", "").strip(),
            "ship_type_code": ship_type_code,
            "ship_type_name": SHIP_TYPES.get(ship_type_code, "Unknown"),
            "destination": static.get("Destination", "").strip(),
            "call_sign": static.get("CallSign", "").strip(),
            "imo": static.get("ImoNumber", 0),
            "draught": static.get("MaximumStaticDraught", 0),
            "dim_a": dim.get("A", 0),
            "dim_b": dim.get("B", 0),
            "dim_c": dim.get("C", 0),
            "dim_d": dim.get("D", 0),
            "eta_month": eta.get("Month", 0),
            "eta_day": eta.get("Day", 0),
            "eta_hour": eta.get("Hour", 0),
            "eta_minute": eta.get("Minute", 0),
        }
        print(f"[{now()}] Static stored for {ship_static[mmsi]['ship_name']} (MMSI {mmsi}) — {ship_static[mmsi]['ship_type_name']}")
        return

    if msg_type == "PositionReport":
        pos = msg["Message"]["PositionReport"]
        static = ship_static.get(mmsi, {})
        ship_type_code = static.get("ship_type_code", 0)

        event = {
            "mmsi": mmsi,
            "ship_name": meta.get("ShipName", "").strip() or static.get("ship_name", "Unknown"),
            "latitude": meta.get("latitude"),
            "longitude": meta.get("longitude"),
            "sog": pos.get("Sog"),
            "cog": pos.get("Cog"),
            "true_heading": pos.get("TrueHeading"),
            "rate_of_turn": pos.get("RateOfTurn"),
            "nav_status": pos.get("NavigationalStatus"),
            "ship_type_code": ship_type_code,
            "ship_type_name": SHIP_TYPES.get(ship_type_code, "Unknown"),
            "destination": static.get("destination", ""),
            "call_sign": static.get("call_sign", ""),
            "imo": static.get("imo", 0),
            "draught": static.get("draught", 0),
            "length": static.get("dim_a", 0) + static.get("dim_b", 0),
            "width": static.get("dim_c", 0) + static.get("dim_d", 0),
            "eta_month": static.get("eta_month", 0),
            "eta_day": static.get("eta_day", 0),
            "eta_hour": static.get("eta_hour", 0),
            "eta_minute": static.get("eta_minute", 0),
            "timestamp": now()
        }

        print(f"[{now()}] {event['ship_name']:<22} | {event['sog']} kn | {event['ship_type_name']} | sending to Fabric...")
        await send_to_fabric(event)

def now():
    return datetime.now(timezone.utc).strftime("%H:%M:%S")

if __name__ == "__main__":
    asyncio.run(connect())
