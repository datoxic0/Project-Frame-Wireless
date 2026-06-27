const express = require('express');
const cors = require('cors');
const path = require('path');
const serveIndex = require('serve-index');
const { spawn } = require('child_process');

let serverInstance = null;

function startServer(port, sharedFolderPath) {
    if (serverInstance) {
        throw new Error("Server is already running");
    }

    const app = express();
    app.use(cors());
    app.use(express.json());

    // Serve the mobile web app statically
    const mobileAppPath = path.join(__dirname, '..', 'public', 'mobile');
    app.use('/', express.static(mobileAppPath));

    // Expose API for mobile app
    
    // 1. Get list of files (handled largely by serveIndex if we want, but let's make an API endpoint for custom UI)
    const fs = require('fs').promises;
    
    app.get('/api/files', async (req, res) => {
        try {
            const reqPath = req.query.path || '';
            const fullPath = path.join(sharedFolderPath, reqPath);
            
            // Security check: ensure the requested path is within the shared folder
            if (!fullPath.startsWith(sharedFolderPath)) {
                return res.status(403).json({ error: "Access denied" });
            }

            const items = await fs.readdir(fullPath, { withFileTypes: true });
            const files = items.map(item => ({
                name: item.name,
                isDirectory: item.isDirectory(),
                path: path.join(reqPath, item.name).replace(/\\/g, '/') // normalize for web
            }));
            
            res.json({ files, currentPath: reqPath });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // 2. Launch App from mobile
    app.post('/api/launch', (req, res) => {
        const { executablePath } = req.body;
        if (!executablePath) return res.status(400).json({ error: "Missing executable path" });

        try {
            const child = spawn(executablePath, [], {
                detached: true,
                stdio: 'ignore',
                shell: true
            });
            child.unref();
            res.json({ success: true, message: "Application launched" });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Also serve the files statically so they can be downloaded/viewed
    // Using serve-index to provide a fallback directory listing if our custom API isn't used
    app.use('/shared', express.static(sharedFolderPath), serveIndex(sharedFolderPath, {'icons': true}));

    return new Promise((resolve, reject) => {
        try {
            serverInstance = app.listen(port, () => {
                const { networkInterfaces } = require('os');
                const nets = networkInterfaces();
                let localIp = '127.0.0.1';

                for (const name of Object.keys(nets)) {
                    for (const net of nets[name]) {
                        if (net.family === 'IPv4' && !net.internal) {
                            localIp = net.address;
                            break;
                        }
                    }
                }
                
                resolve({ 
                    success: true, 
                    port: port,
                    ip: localIp,
                    url: `http://${localIp}:${port}`
                });
            });
            
            serverInstance.on('error', (err) => {
                serverInstance = null;
                reject(err);
            });
        } catch (e) {
            reject(e);
        }
    });
}

function stopServer() {
    if (serverInstance) {
        serverInstance.close();
        serverInstance = null;
    }
}

module.exports = {
    startServer,
    stopServer
};
