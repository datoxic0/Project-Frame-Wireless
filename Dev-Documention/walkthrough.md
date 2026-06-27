# Project Frame Wireless - Walkthrough

I have successfully built **Project Frame Wireless**, transforming your vision into a beautiful, functional desktop application using Electron, Express.js, and Vanilla Web Technologies.

## Features Implemented

### 1. Premium Desktop Hub
- A stunning UI built with glassmorphism, dynamic gradients, and smooth micro-animations.
- Uses native system dialogs to let you safely select exactly which folder you want to share on the network.
- Features a quick-launch grid to save and launch your favorite applications or `.bat` files directly from the app.

### 2. Built-In Local Server
- An integrated Node/Express.js server runs seamlessly in the background when you click "Start Server".
- It automatically detects your local IP address (e.g., `192.168.1.X`) and exposes a web interface on the port of your choosing (default 5500).

### 3. Mobile Web Interface
- When you connect to the server from your phone or another device, you are greeted with a responsive, modern web interface.
- You can browse the directories of the specific folder you shared.
- Tapping on files will allow you to view or download them directly to your mobile device over the local network.

## How to Run It

1. Open your terminal in `C:\Users\Asikhule Safetify\Documents\ProjectFrameWireless`.
2. Run `npm run start` to launch the desktop application.
   - *(Note: During development you can also run `npm run dev` to get live-reloading for the frontend).*
3. In the app:
   - Click **Browse** and select a folder on your PC.
   - Click **Start Server**.
   - Note the URL that appears (e.g., `http://192.168.X.X:5500`).
4. Type that URL into your phone's browser (make sure your phone is on the same Wi-Fi) and browse your files!
5. In the **Quick Launch** section on the desktop app, you can add paths to your existing `.bat` files or `.exe` games to quickly launch them.

## Future Enhancements
- In the future, we can add a feature to the mobile interface that allows you to click a button on your phone to trigger one of the Quick Launch apps on your PC! The API endpoint (`/api/launch`) is already prepared for this on the backend.
