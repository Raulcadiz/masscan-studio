<div align="center">

# 🔍 Masscan Studio

**Visual network scanning platform powered by Masscan**

![Python](https://img.shields.io/badge/Python-3.12-blue?style=flat-square&logo=python)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111-green?style=flat-square&logo=fastapi)
![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square&logo=react)
![TailwindCSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8?style=flat-square&logo=tailwindcss)
![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)

A self-hosted Shodan-like platform to discover open ports, visualize your network
infrastructure, detect service exposure, and compare historical scans.

**Only scan networks you own or have explicit authorization to scan.**

</div>

---

## ✨ Features

- **One-command scanning** — launch Masscan from the web UI with preset port profiles
- **Real-time progress** — dashboard auto-refreshes every 3 seconds while a scan runs
- **Host explorer** — filterable table with expandable port details (service, version, banner)
- **Port distribution chart** — Chart.js horizontal bar chart of the most open ports
- **Scan comparator** — diff two scans and instantly see new hosts, closed ports, and changes
- **Nmap integration** — optional service/version detection after Masscan discovery
- **Export** — download results as JSON or CSV
- **Docker-ready** — single `docker compose up` to run the full stack

---

## 📸 Interface

```
┌──────────────┬──────────────────────────────────────────────────────┐
│ MASSCAN      │  Dashboard                                            │
│ STUDIO       │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐  │
│              │  │  12      │ │  247     │ │  891     │ │ #18    │  │
│ ◉ Dashboard  │  │  Scans   │ │  Hosts   │ │  Ports   │ │ Last   │  │
│ + New Scan   │  └──────────┘ └──────────┘ └──────────┘ └────────┘  │
│ ☰ All Scans  │                                                       │
│ ⇄ Comparator │  PORT DISTRIBUTION (top 20)                          │
│              │  ┌──────────────────────────────────────────────┐     │
│              │  │  80   ████████████████████████  247          │     │
│              │  │  443  ████████████████████  198              │     │
│              │  │  22   ████████████  121                      │     │
│              │  │  8080 ████████  87                           │     │
│              │  │  3306 █████  54                              │     │
│              │  └──────────────────────────────────────────────┘     │
│              │                                                       │
│              │  RECENT SCANS                                         │
│              │  #18  192.168.1.0/24  ● completed  34 hosts  89 ports│
│              │  #17  10.0.0.0/24    ● completed  12 hosts  41 ports │
│              │  #16  172.16.0.0/16  ● failed     —         —        │
└──────────────┴──────────────────────────────────────────────────────┘
```

```
SCAN COMPARATOR — Scan #14 vs Scan #18

  +2 New Hosts   -1 Removed   +5 New Ports   -3 Closed Ports

  NEW HOSTS ──────────────────────────────────────────
    + 192.168.1.25    22  80
    + 192.168.1.30    443

  REMOVED HOSTS ──────────────────────────────────────
    - 192.168.1.18

  CHANGED HOSTS ──────────────────────────────────────
    192.168.1.1    +8080  −23
    192.168.1.10   +5432
```

---

## 🚀 Quick Start

### Option A — Docker (recommended)

```bash
git clone https://github.com/Raulcadiz/masscan-studio
cd masscan-studio
docker compose up --build
```

Open **http://localhost** in your browser.

> The backend container installs `masscan` and `nmap` automatically.
> `NET_ADMIN` and `NET_RAW` capabilities are required for raw packet scanning.

### Option B — Local development

**Prerequisites:** Python 3.11+, Node 18+, `masscan` installed on your system.

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload
# API → http://localhost:8000
# Docs → http://localhost:8000/docs

# Frontend (separate terminal)
cd frontend
npm install
npm run dev
# UI → http://localhost:5173
```

---

## 📦 Project Structure

```
masscan-studio/
├── backend/
│   ├── app/
│   │   ├── main.py                # FastAPI app entry point
│   │   ├── config.py              # Settings (.env)
│   │   ├── api/
│   │   │   ├── scans.py           # POST/GET/DELETE scans + compare
│   │   │   ├── hosts.py           # Host listing with filters
│   │   │   ├── ports.py           # Port stats and distribution
│   │   │   └── reports.py         # JSON / CSV export
│   │   ├── core/
│   │   │   ├── masscan_wrapper.py # Runs masscan, parses JSON output
│   │   │   ├── nmap_wrapper.py    # Optional service detection
│   │   │   ├── scanner.py         # Scan pipeline orchestrator
│   │   │   └── diff.py            # Scan comparison engine
│   │   ├── db/database.py         # SQLite engine + session
│   │   └── models/models.py       # DB tables + Pydantic schemas
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── api/client.js          # Fetch wrapper for the API
│   │   ├── components/
│   │   │   ├── Layout/            # Sidebar + Layout
│   │   │   ├── ui/                # Badge, StatsCard, Spinner
│   │   │   ├── Charts/            # PortBarChart (Chart.js)
│   │   │   ├── HostTable/         # Filterable host table
│   │   │   └── Comparator/        # DiffView component
│   │   └── pages/
│   │       ├── DashboardPage.jsx
│   │       ├── NewScanPage.jsx
│   │       ├── ScanDetailPage.jsx
│   │       ├── ScansPage.jsx
│   │       └── ComparatorPage.jsx
│   ├── Dockerfile
│   └── nginx.conf
│
└── docker-compose.yml
```

---

## 🔌 API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/scans` | Launch a new scan (background) |
| `GET` | `/api/scans` | List all scans |
| `GET` | `/api/scans/{id}` | Scan status + metadata |
| `GET` | `/api/scans/{id}/hosts` | Hosts + ports discovered |
| `DELETE` | `/api/scans/{id}` | Delete scan and its data |
| `POST` | `/api/scans/compare` | Diff two completed scans |
| `GET` | `/api/hosts?scan_id=&port=&ip=` | Filter hosts |
| `GET` | `/api/ports/stats` | Port distribution (for charts) |
| `GET` | `/api/ports/top?limit=20` | Top N open ports |
| `GET` | `/api/reports/{id}?format=json\|csv\|summary` | Export report |

Interactive docs at **http://localhost:8000/docs**

**Example — start a scan:**
```bash
curl -X POST http://localhost:8000/api/scans \
  -H "Content-Type: application/json" \
  -d '{
    "targets": "192.168.1.0/24",
    "ports": "22,80,443,8080",
    "rate": 1000,
    "nmap_enabled": false
  }'
```

**Example — compare two scans:**
```bash
curl -X POST http://localhost:8000/api/scans/compare \
  -H "Content-Type: application/json" \
  -d '{"scan_id_a": 3, "scan_id_b": 7}'
```

---

## ⚙️ Configuration

Copy `backend/.env.example` to `backend/.env` and adjust:

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `sqlite:///./masscan_studio.db` | Database path |
| `MASSCAN_PATH` | `masscan` | Path to masscan binary |
| `NMAP_PATH` | `nmap` | Path to nmap binary |
| `DEFAULT_SCAN_RATE` | `1000` | Default packets/second |
| `MAX_SCAN_RATE` | `10000` | Maximum allowed rate |
| `CORS_ORIGINS` | `http://localhost:3000,...` | Allowed frontend origins |

---

## 🗺️ Roadmap

### v0.1 — MVP ✅
- [x] Masscan wrapper (async subprocess)
- [x] SQLite persistence
- [x] REST API (scans, hosts, ports, reports)
- [x] React dashboard with stats + chart
- [x] Filterable host table with port details

### v0.2 — Comparator ✅
- [x] Scan diff engine (new hosts, closed ports, changes)
- [x] Visual comparator page

### v0.3 — Service detection
- [x] Optional Nmap integration (-sV)
- [ ] Service risk scoring (MySQL/RDP/Telnet exposed = alert)
- [ ] CVE lookup per detected service version

### v0.4 — Monitor mode
- [ ] Scheduled periodic scans (cron-like)
- [ ] WebSocket live feed of changes
- [ ] Email/Slack alerts on new exposure

### v0.5 — Visualization
- [ ] Network topology map (React Flow)
- [ ] Subnet heatmap
- [ ] Timeline view of scan history

### v1.0 — Production
- [ ] Authentication (API keys / OAuth)
- [ ] PostgreSQL support
- [ ] PDF report generation
- [ ] Multi-user support

---

## ⚠️ Legal Disclaimer

Masscan Studio is designed for network security professionals to audit **their own infrastructure** or networks they have **explicit written authorization** to scan. Unauthorized port scanning may be illegal in your jurisdiction. The authors assume no liability for misuse.

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/monitor-mode`
3. Commit your changes: `git commit -m 'feat: add monitor mode'`
4. Push and open a Pull Request

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">
Built with ❤️ using FastAPI + React + Masscan
</div>
