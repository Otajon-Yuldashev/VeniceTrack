import { useEffect, useState } from "react"
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents } from "react-leaflet"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts"
import "leaflet/dist/leaflet.css"
import L from "leaflet"

const API = "http://34.68.222.125:5000"

const COLORS = {
  Passenger: "#378ADD",
  Cargo: "#F39C12",
  Tanker: "#E74C3C",
  Tug: "#2ECC71",
  Fishing: "#9B59B6",
  "Pleasure craft": "#E91E8C",
  Other: "#95A5A6",
  Unknown: "#95A5A6"
}

const createTriangle = (heading, color, violation) => {
  const angle = (heading === 511 || !heading) ? 0 : heading
  const ring = violation ? `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:26px;height:26px;border-radius:50%;border:2px solid #F39C12;animation:pulse 1.5s ease-out infinite;opacity:0.8;"></div>` : ""
  return L.divIcon({
    className: "",
    html: `<style>@keyframes pulse{0%{transform:translate(-50%,-50%) scale(1);opacity:0.8}100%{transform:translate(-50%,-50%) scale(2.5);opacity:0}}</style><div style="position:relative;width:22px;height:22px;">${ring}<div style="position:absolute;top:50%;left:50%;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:16px solid ${violation ? '#F39C12' : color};transform:translate(-50%,-50%) rotate(${angle}deg);filter:drop-shadow(0 1px 3px rgba(0,0,0,0.6));"></div></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11]
  })
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({ click: onMapClick })
  return null
}

export default function App() {
  const [vessels, setVessels] = useState([])
  const [selected, setSelected] = useState(null)
  const [trails, setTrails] = useState({})
  const [peakHours, setPeakHours] = useState([])
  const [offenders, setOffenders] = useState([])
  const [vesselStats, setVesselStats] = useState([])
  const [view, setView] = useState("live")
  const [lastUpdate, setLastUpdate] = useState(null)
  const [countdown, setCountdown] = useState(3300)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchVessels = async () => {
    try {
      setError(null)
      const res = await fetch(`${API}/api/vessels`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      const valid = data.filter(v => v.latitude && v.longitude)
      setTrails(prev => {
        const updated = { ...prev }
        valid.forEach(v => {
          const pos = [parseFloat(v.latitude), parseFloat(v.longitude)]
          const existing = updated[v.mmsi] || []
          updated[v.mmsi] = [...existing, pos].slice(-8)
        })
        return updated
      })
      const latest = {}
      valid.forEach(v => {
        if (!latest[v.mmsi] || v.timestamp > latest[v.mmsi].timestamp)
          latest[v.mmsi] = v
      })
      setVessels(Object.values(latest))
      setLastUpdate(new Date().toLocaleTimeString())
      setLoading(false)
    } catch (e) {
      setError(e.message)
      setLoading(false)
      console.error("Fetch error:", e)
    }
  }

  const fetchAnalytics = async () => {
    try {
      const [off, hours, stats] = await Promise.all([
        fetch(`${API}/api/offenders`).then(r => r.json()),
        fetch(`${API}/api/peak_hours`).then(r => r.json()),
        fetch(`${API}/api/vessel_stats`).then(r => r.json()),
      ])
      setOffenders(off)
      setPeakHours(hours)
      setVesselStats(stats)
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    fetchVessels()
    fetchAnalytics()
    const interval = setInterval(fetchVessels, 15000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setCountdown(p => p <= 1 ? 3300 : p - 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const formatCountdown = (s) => `${Math.floor(s/60)}:${(s%60).toString().padStart(2,"0")}`
  const violations = vessels.filter(v => parseFloat(v.sog) > 5)

  const bg = "#161B22"
  const bg2 = "#1E242D"
  const border = "#2D3748"
  const text = "#E2E8F0"
  const muted = "#8892A4"

  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", background:bg, color:text, fontFamily:"system-ui,sans-serif" }}>

      {/* Topbar */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", background:bg2, borderBottom:`1px solid ${border}`, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
          <span style={{ fontSize:"16px", fontWeight:700, color:"#fff" }}>VeniceTrack</span>
          <span style={{ fontSize:"11px", background:"#1D9E75", color:"#fff", padding:"2px 9px", borderRadius:"10px", fontWeight:500 }}>● LIVE</span>
        </div>
        <div style={{ display:"flex", gap:"8px" }}>
          {["live","analytics"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding:"5px 16px", borderRadius:"6px", border:"none", cursor:"pointer", background: view===v ? "#378ADD" : border, color:"#fff", fontSize:"12px", fontWeight:500 }}>
              {v === "live" ? "Live map" : "Analytics"}
            </button>
          ))}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"12px" }}>
          {error && <span style={{ fontSize:"11px", color:"#E74C3C" }}>⚠ {error}</span>}
          <button onClick={fetchVessels} style={{ fontSize:"11px", color:"#378ADD", background:"none", border:`1px solid #378ADD`, borderRadius:"4px", padding:"2px 8px", cursor:"pointer" }}>↻ Refresh</button>
          <span style={{ fontSize:"11px", color:muted }}>Updated {lastUpdate || "..."}</span>
        </div>
      </div>

      {view === "live" && (
        <div style={{ flex:1, display:"flex", overflow:"hidden" }}>
          {/* Map */}
          <div style={{ flex:1, position:"relative" }}>
            {loading && (
              <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", zIndex:1000, background:"rgba(22,27,34,0.9)", padding:"16px 24px", borderRadius:"8px", color:text, fontSize:"14px" }}>
                Loading vessels...
              </div>
            )}
            <MapContainer center={[45.43, 12.33]} zoom={13} style={{ height:"100%", width:"100%" }}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
              <TileLayer url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png" attribution="© OpenSeaMap" opacity={0.8} />
              <MapClickHandler onMapClick={() => setSelected(null)} />
              {selected && trails[selected.mmsi]?.length > 1 && (
                <Polyline positions={trails[selected.mmsi]} pathOptions={{ color: COLORS[selected.ship_type_name] || "#888", weight:2, opacity:0.7, dashArray:"5 4" }} />
              )}
              {vessels.map(v => (
                <Marker
                  key={v.mmsi}
                  position={[parseFloat(v.latitude), parseFloat(v.longitude)]}
                  icon={createTriangle(v.true_heading, COLORS[v.ship_type_name] || "#95A5A6", parseFloat(v.sog) > 5)}
                  eventHandlers={{ click: (e) => { e.originalEvent.stopPropagation(); setSelected(v) } }}
                >
                  <Popup><b>{v.ship_name}</b><br/>{v.ship_type_name}<br/>{v.sog} kn</Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {/* Sidebar */}
          <div style={{ width:"280px", background:bg2, borderLeft:`1px solid ${border}`, display:"flex", flexDirection:"column", overflow:"hidden" }}>
            {selected ? (
              <div style={{ padding:"14px", flex:1, overflowY:"auto" }}>
                <button onClick={() => setSelected(null)} style={{ fontSize:"11px", color:"#378ADD", background:"none", border:"none", cursor:"pointer", marginBottom:"12px", padding:0 }}>← All vessels</button>
                <div style={{ fontSize:"15px", fontWeight:700, marginBottom:"2px", color:"#fff" }}>{selected.ship_name}</div>
                <div style={{ fontSize:"11px", color: COLORS[selected.ship_type_name] || muted, marginBottom:"12px", fontWeight:600 }}>{selected.ship_type_name}</div>
                {parseFloat(selected.sog) > 5 && (
                  <div style={{ background:"#2D2008", border:"1px solid #F39C12", borderRadius:"6px", padding:"7px 10px", fontSize:"11px", color:"#F39C12", marginBottom:"12px", display:"flex", alignItems:"center", gap:"6px" }}>
                    ⚠ Possible violation — {selected.sog} kn
                  </div>
                )}
                {[
                  ["MMSI", selected.mmsi],
                  ["IMO", selected.imo || "—"],
                  ["Speed", `${selected.sog} kn`],
                  ["Heading", selected.true_heading === 511 ? "—" : `${selected.true_heading}°`],
                  ["Destination", selected.destination || "Unknown"],
                  ["ETA", selected.eta_month ? `${selected.eta_day}/${selected.eta_month} ${selected.eta_hour}:${String(selected.eta_minute).padStart(2,"0")}` : "—"],
                  ["Length", selected.length ? `${selected.length}m` : "—"],
                  ["Width", selected.width ? `${selected.width}m` : "—"],
                  ["Draught", selected.draught ? `${selected.draught}m` : "—"],
                  ["Nav status", selected.nav_status],
                  ["Last seen", selected.timestamp],
                ].map(([k, v]) => (
                  <div key={k} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${border}`, fontSize:"12px" }}>
                    <span style={{ color:muted }}>{k}</span>
                    <span style={{ color:text, fontWeight:500 }}>{v}</span>
                  </div>
                ))}
                <div style={{ marginTop:"14px" }}>
                  <a href={`https://www.marinetraffic.com/en/ais/details/ships/mmsi:${selected.mmsi}`} target="_blank" rel="noopener noreferrer" style={{ fontSize:"12px", color:"#378ADD", textDecoration:"none", fontWeight:500 }}>
                    View on MarineTraffic ↗
                  </a>
                </div>
              </div>
            ) : (
              <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px", padding:"12px" }}>
                  {[
                    ["Vessels", vessels.length, false],
                    ["Violations", violations.length, violations.length > 0],
                    ["Avg speed", vessels.length ? (vessels.reduce((a,v) => a+parseFloat(v.sog||0),0)/vessels.length).toFixed(1)+" kn" : "—", false],
                    ["Updated", lastUpdate || "...", false]
                  ].map(([l, v, warn]) => (
                    <div key={l} style={{ background:"#0D1117", borderRadius:"8px", padding:"10px", border:`1px solid ${border}` }}>
                      <div style={{ fontSize:"10px", color:muted, marginBottom:"4px" }}>{l}</div>
                      <div style={{ fontSize:"16px", fontWeight:700, color: warn ? "#E74C3C" : "#fff" }}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{ padding:"0 12px 8px" }}>
                  {Object.entries(COLORS).filter(([k]) => k !== "Unknown").map(([type, color]) => (
                    <div key={type} style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"5px" }}>
                      <div style={{ width:"9px", height:"9px", borderRadius:"50%", background:color, flexShrink:0 }} />
                      <span style={{ fontSize:"11px", color:muted }}>{type}</span>
                    </div>
                  ))}
                </div>
                <div style={{ padding:"0 12px 8px", fontSize:"10px", color:muted, letterSpacing:"0.08em", fontWeight:600 }}>VESSELS — CLICK TO INSPECT</div>
                <div style={{ flex:1, overflowY:"auto" }}>
                  {loading ? (
                    <div style={{ padding:"20px", textAlign:"center", color:muted, fontSize:"12px" }}>Loading vessels...</div>
                  ) : error ? (
                    <div style={{ padding:"20px", textAlign:"center", color:"#E74C3C", fontSize:"12px" }}>{error}</div>
                  ) : vessels.length === 0 ? (
                    <div style={{ padding:"20px", textAlign:"center", color:muted, fontSize:"12px" }}>No vessels found</div>
                  ) : vessels.map(v => (
                    <div key={v.mmsi} onClick={() => setSelected(v)}
                      style={{ display:"flex", alignItems:"center", gap:"10px", padding:"8px 12px", cursor:"pointer", borderBottom:`1px solid ${border}` }}
                      onMouseEnter={e => e.currentTarget.style.background = "#252C38"}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{ width:"8px", height:"8px", borderRadius:"50%", background: parseFloat(v.sog)>5 ? "#F39C12" : COLORS[v.ship_type_name]||"#888", flexShrink:0 }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:"12px", fontWeight:600, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", color:"#fff" }}>{v.ship_name}</div>
                        <div style={{ fontSize:"10px", color:muted }}>{v.ship_type_name}</div>
                      </div>
                      <div style={{ fontSize:"11px", fontWeight:600, color: parseFloat(v.sog)>5 ? "#F39C12" : "#2ECC71" }}>{v.sog} kn</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {view === "analytics" && (
        <div style={{ flex:1, overflowY:"auto", padding:"20px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"16px", background:"#0D1117" }}>
          <div style={{ background:bg2, borderRadius:"12px", padding:"20px", border:`1px solid ${border}` }}>
            <div style={{ fontSize:"14px", fontWeight:600, color:"#fff", marginBottom:"4px" }}>Violations by hour</div>
            <div style={{ fontSize:"11px", color:"#8BC34A", marginBottom:"16px" }}>● Next update in {formatCountdown(countdown)}</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={peakHours}>
                <XAxis dataKey="hour" stroke={muted} fontSize={11} tick={{ fill: muted }} />
                <YAxis stroke={muted} fontSize={11} tick={{ fill: muted }} />
                <Tooltip contentStyle={{ background:bg2, border:`1px solid ${border}`, borderRadius:"8px", color:text }} />
                <Bar dataKey="violation_count" fill="#378ADD" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background:bg2, borderRadius:"12px", padding:"20px", border:`1px solid ${border}` }}>
            <div style={{ fontSize:"14px", fontWeight:600, color:"#fff", marginBottom:"16px" }}>Vessel type activity</div>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={vesselStats} layout="vertical">
                <XAxis type="number" stroke={muted} fontSize={11} tick={{ fill: muted }} />
                <YAxis dataKey="vessel_category" type="category" stroke={muted} fontSize={11} width={90} tick={{ fill: muted }} />
                <Tooltip contentStyle={{ background:bg2, border:`1px solid ${border}`, borderRadius:"8px", color:text }} />
                <Bar dataKey="total_events" fill="#2ECC71" radius={[0,4,4,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div style={{ background:bg2, borderRadius:"12px", padding:"20px", border:`1px solid ${border}`, gridColumn:"1 / -1" }}>
            <div style={{ fontSize:"14px", fontWeight:600, color:"#fff", marginBottom:"16px" }}>Repeat offenders</div>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"13px" }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${border}` }}>
                  {["Vessel","Category","Violations","Avg speed","Max speed"].map(h => (
                    <th key={h} style={{ padding:"8px 10px", textAlign:"left", color:muted, fontWeight:600, fontSize:"11px", letterSpacing:"0.05em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {offenders.map((o, i) => (
                  <tr key={i} style={{ borderBottom:`1px solid ${border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = "#252C38"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding:"10px", color:"#fff", fontWeight:600 }}>{o.ship_name}</td>
                    <td style={{ padding:"10px", color:muted }}>{o.vessel_category}</td>
                    <td style={{ padding:"10px", color:"#E74C3C", fontWeight:700 }}>{o.total_violations}</td>
                    <td style={{ padding:"10px", color:text }}>{parseFloat(o.avg_violation_speed).toFixed(1)} kn</td>
                    <td style={{ padding:"10px", color:text }}>{parseFloat(o.max_speed).toFixed(1)} kn</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}


