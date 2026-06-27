# Project Frame Wireless

> **Your PC, Wireless — No cables. No subscriptions. No compromises.**

A free, open-source desktop application that turns your Windows PC into a powerful local-network hub. Browse PC files from your phone, stream media, share your screen, launch web apps and games — all over your local Wi-Fi, completely offline.

---

## ✨ Features

### 📁 Wireless File Manager
- Browse all drives (C:\, D:\, G:\ etc.) from any device on your network
- **Shortcut to Shared Folder** — pin a specific folder for quick access
- Hidden and system files are automatically filtered and never exposed
- **3-button actions per file**: View / Open · Download to device · Properties
- Inline media player for videos, audio, and images directly in the browser
- **Send files to PC** — upload from your phone (supports up to 12 GB per session)

### 🚀 Quick Launch
- Launch `.exe`, `.bat`, `.lnk`, and `.cmd` files with one click
- **Drag & drop** executables from Windows Explorer straight into the app
- **Auto-scan** a folder and detect all executables automatically
- **Serve web apps** — supports:
  - 📁 Static folders (HTML/CSS/JS games, offline apps) — served by Python, works 100% offline
  - ⚡ npm-based projects (React, Vite, Next.js, etc.) — choose **Dev, Preview, or Build+Preview** mode
- Launch apps remotely from your phone via the **Launcher tab**

### 🖥 PC Screen Share
- Live MJPEG screen stream viewable from any browser on your network
- ~10 fps, compressed JPEG — lightweight on both CPU and bandwidth
- No drivers, no plugins — pure HTTP

### 🌐 Dual Architecture (Python + Node.js)
- **Python** powers the HTTP server: reliable, works offline, handles Range requests for video seeking
- **Node.js (Electron)** powers the premium desktop UI and npm/npx app launching
- Both engines complement each other — the best of both worlds

---

## 🖼 Screenshots

> *(Add screenshots here)*

---

## 🚀 Getting Started

### Prerequisites
- **Windows 10 / 11**
- **Node.js** (v18+) — [nodejs.org](https://nodejs.org)
- **Python 3.8+** — [python.org](https://python.org)
- For screen share: `pip install Pillow`

### Installation

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/ProjectFrameWireless.git
cd ProjectFrameWireless

# Install Node dependencies
npm install

# Install Python dependency (for screen share)
pip install Pillow
```

### Running the App

```bash
npm start
```

---

## 📱 Using from Your Phone

1. Start the app on your PC
2. Select a **Shared Folder** using the Browse button
3. Click **Start Server**
4. The app will show a URL like `http://192.168.1.100:5500`
5. Open that URL in your phone's browser (must be on the same Wi-Fi)

---

## 📂 Project Structure

```
ProjectFrameWireless/
├── main.js              # Electron main process (Node.js)
├── index.html           # Desktop UI
├── src/
│   ├── renderer.js      # Desktop frontend logic
│   └── style.css        # Desktop styles
├── backend/
│   ├── server.py        # Python HTTP server
│   ├── scanner.py       # App directory scanner
│   └── requirements.txt # Python dependencies
├── public/
│   └── mobile/
│       ├── index.html   # Mobile web interface
│       └── style.css    # Mobile styles
├── apps.json            # Saved Quick Launch apps (auto-generated)
└── package.json
```

---

## 🔧 Tech Stack

| Layer | Technology |
|---|---|
| Desktop UI | Electron.js + Vanilla HTML/CSS/JS |
| File Server | Python 3 (stdlib `http.server`) |
| App Launcher | Node.js `child_process` |
| Screen Share | Python `Pillow.ImageGrab` → MJPEG |
| Mobile UI | Pure HTML5 + CSS + Vanilla JS |

---

## 🔒 Security Notes

- The server only runs on your **local network** — it is NOT exposed to the internet
- System and hidden files are filtered and never served
- File operations are **read-only** (view & download only); the only write operation is the upload endpoint
- Upload is limited to 12 GB per session
- The app launcher only executes paths you have explicitly saved

---

## 🛣 Roadmap

- [ ] PIN/password for the mobile interface
- [ ] QR code for easy mobile connection
- [ ] WebRTC audio casting (share PC audio to phone)
- [ ] Multiple shared folder shortcuts
- [ ] File search across shared directories
- [ ] Dark/Light theme toggle

---

## 📄 License

MIT © 2026 — Asikhule Safetify
