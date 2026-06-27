# Project Frame Wireless - Implementation Plan

## Goal Description

Build a premium, highly professional desktop application called **Project Frame Wireless**. This application will act as a local network hub, allowing you to:
1. **Host a Local Server**: Spin up a robust HTTP server directly from the desktop app (no need for external `.bat` files or command-line tools).
2. **Launch Applications**: Act as a launcher for local applications and games.
3. **Remote File Manager**: Select specific folders on your PC to share over the local network. Any device (like your phone) can connect to the PC's IP address and access these files via a beautiful, mobile-friendly web interface.
4. **Premium Desktop UI**: Provide a stunning, modern desktop interface with glassmorphism effects, fluid animations, and a rich color palette to make it feel state-of-the-art.

## User Review Required

> [!IMPORTANT]
> **Technology Stack**
> I propose using **Electron.js** for the desktop application. Electron allows us to use standard web technologies (HTML, CSS, JavaScript) for the stunning UI, while giving us full access to Node.js in the background. 
> 
> For the background tasks, we will use **Express.js** to create a robust local HTTP server that handles file serving and API requests from your mobile devices.
>
> We will use **Vite** as the build tool with **Vanilla JS and Vanilla CSS** to ensure maximum performance and adherence to your design guidelines (no TailwindCSS).

> [!WARNING]
> **Security Considerations**
> Exposing your PC's file system over the network, even a local one, has security implications. To keep it safe, the application will **only** serve folders that you explicitly select in the desktop UI. By default, it will not have access to your entire C: drive or system-locked files. We can also add a simple PIN system for the mobile web interface later if you want extra security.

## Open Questions

1. **Mobile Interface**: The desktop app will host a web page that your phone connects to. Do you want this mobile web interface to mirror the desktop app's design (dark mode, glassmorphism), or should it be a simpler, more utilitarian file explorer?
2. **App Launcher**: For launching applications, do you want to manually add executable paths (e.g., `C:\Games\Game.exe`) into the app, or should it try to automatically scan certain folders?

## Proposed Changes

We will create a completely new project structure within `ProjectFrameWireless`.

### Core Application Structure

#### [NEW] `package.json`
Will contain all the dependencies (Electron, Express, Vite, etc.) and run scripts (`npm run dev`).

#### [NEW] `main.js` (Electron Main Process)
The core backend of the desktop app. It will:
- Create the desktop window.
- Start and stop the Express.js server on a specific port (e.g., 5500).
- Handle IPC (Inter-Process Communication) to let the UI talk to the file system.
- Implement the logic to launch local executable files using Node's `child_process`.

#### [NEW] `server/app.js` (Express Server)
The local HTTP server that runs in the background. It will:
- Serve a mobile-optimized web interface.
- Provide API endpoints to list files in the shared directories.
- Stream files (like videos or images) to the connected devices.

### Desktop User Interface (Renderer Process)

#### [NEW] `index.html`
The main structure of the desktop app.

#### [NEW] `src/style.css`
Premium vanilla CSS styling featuring deep dark modes, vibrant accent colors, smooth micro-animations, hover effects, and modern typography (Google Fonts).

#### [NEW] `src/renderer.js`
The frontend logic to handle user interactions (selecting folders to share, toggling the server on/off, adding apps to launch).

### Mobile Web Interface (Served by Express)

#### [NEW] `public/mobile/index.html` & `public/mobile/style.css`
The web interface that you will see when you type your PC's IP address into your phone's browser. It will allow you to browse the shared folders and potentially click buttons to launch games on the PC.

## Verification Plan

### Manual Verification
1. Install dependencies using `npm install`.
2. Start the application in development mode with `npm run dev`.
3. Verify the desktop UI looks premium and functions correctly.
4. Start the built-in server from the desktop app UI.
5. Open a web browser on the PC (or a phone on the same Wi-Fi) and navigate to `http://<local-ip>:5500` to verify the mobile interface loads and can browse the explicitly shared folders.
6. Test adding a dummy executable (or one of your `.bat` files) to the launcher and verify it successfully runs from both the desktop app and the remote mobile interface.
