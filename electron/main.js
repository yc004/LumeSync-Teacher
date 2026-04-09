// ========================================================
// 鏁欏笀绔富杩涚▼
// 鑱岃矗锛氬惎鍔?server.js锛屾墦寮€鏁欏笀绔祻瑙堝櫒绐楀彛
// ========================================================
const { app, BrowserWindow, Tray, Menu, nativeImage, dialog, ipcMain, session, globalShortcut } = require('electron');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

// 1. 鍒ゆ柇褰撳墠鏄惁鏄墦鍖呭悗鐨勭敓浜х幆澧?
const isDev = !app.isPackaged;

// 2. 鍔ㄦ€佽绠?common 鐩綍鐨勮矾寰?
// 鍋囪 main.js 浣嶄簬 electron/main.js
const commonPath = path.join(__dirname, '../common/electron');

const { loadSettings, saveSettings } = require(path.join(commonPath, 'config.js'));
const { Logger } = require(path.join(commonPath, 'logger.js'));

// 鍒濆鍖栨棩蹇楃郴缁?
const logger = new Logger('LumeSync-Teacher');

// 鍒囨崲 Windows 鎺у埗鍙颁唬鐮侀〉涓?UTF-8锛岃В鍐充腑鏂囦贡鐮?
if (process.platform === 'win32') {
    spawnSync('chcp', ['65001'], { shell: true, stdio: 'ignore' });
}

// 绂佺敤 GPU 纾佺洏缂撳瓨锛岄伩鍏?Windows 涓婂洜缂撳瓨鐩綍閿佸畾瀵艰嚧鐨勫惎鍔ㄦ姤閿?
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache');

// getUserMedia requires a secure origin; localhost over http is treated as insecure by Chromium.
app.commandLine.appendSwitch(
    'unsafely-treat-insecure-origin-as-secure',
    'http://localhost:3000,http://127.0.0.1:3000'
);

// 璺宠繃 Windows 绯荤粺鎽勫儚澶存潈闄愬脊绐楋紝閬垮厤棣栨 getUserMedia 绛夊緟 5 绉掕秴鏃?
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');

let mainWindow = null;
let tray = null;
let serverProcess = null;
const PORT = 3000;

function getSharedPublicRoot() {
    return isDev
        ? path.join(__dirname, '../shared/public')
        : path.join(app.getAppPath(), 'shared', 'public');
}

function isPortAvailable(port) {
    return new Promise((resolve) => {
        const net = require('net');
        const tester = net.createServer();
        tester.once('error', () => resolve(false));
        tester.once('listening', () => {
            tester.close(() => resolve(true));
        });
        tester.listen(port, '127.0.0.1');
    });
}

function checkLocalHealth(port) {
    return new Promise((resolve) => {
        const http = require('http');
        const req = http.request(
            { hostname: '127.0.0.1', port, path: '/api/health', method: 'GET', timeout: 800 },
            (res) => {
                const ok = res.statusCode >= 200 && res.statusCode < 500;
                res.resume();
                resolve(ok);
            }
        );
        req.on('timeout', () => req.destroy(new Error('timeout')));
        req.on('error', () => resolve(false));
        req.end();
    });
}

// 鎹曡幏鏈鐞嗙殑寮傚父鍜屾湭鎹曡幏鐨?Promise 鎷掔粷
process.on('uncaughtException', (err) => {
    logger.error('UNCAUGHT', 'Uncaught Exception', err);
    setTimeout(() => process.exit(1), 1000);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('UNHANDLED', 'Unhandled Promise Rejection', reason);
});

// 鈹€鈹€ 鍚姩鍐呭祵鏈嶅姟鍣?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function startServer() {
    // 鍔ㄦ€佽绠?server 璺緞
    // 寮€鍙戠幆澧? apps/teacher/electron/main.js -> ../server/index.js
    // 鐢熶骇鐜: resources/app/electron/main.js -> ../server/index.js
    const serverPath = isDev
        ? path.join(__dirname, '../server/index.js')
        : path.join(__dirname, '../server/index.js');
    logger.info('SERVER', 'Starting server', { path: serverPath, exists: require('fs').existsSync(serverPath), isDev });

    try {
        // Resolve app-level node_modules path for server process module lookup.
        const appNodeModulesPath = isDev
            ? path.join(__dirname, '../../node_modules')
            : path.join(__dirname, '../node_modules');

        serverProcess = spawn(process.execPath, [serverPath], {
            env: {
                ...process.env,
                PORT: String(PORT),
                CHCP: '65001',
                LOG_DIR: logger.getLogDir(),
                ELECTRON_RUN_AS_NODE: '1',
                NODE_PATH: appNodeModulesPath,
                STATIC_DIR: getSharedPublicRoot(),
                LUMESYNC_PUBLIC_DIR: getSharedPublicRoot()
            },
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true,
        });

        if (!serverProcess || !serverProcess.pid) {
            throw new Error('Failed to create server process');
        }

        serverProcess.stdout.on('data', (data) => {
            const output = data.toString();
            logger.info('SERVER-STDOUT', output.trim());
        });

        serverProcess.stderr.on('data', (data) => {
            const output = data.toString();
            logger.error('SERVER-STDERR', output.trim());
        });


        serverProcess.on('error', (err) => {
            logger.error('SERVER', 'Server process error', err);
            dialog.showErrorBox('Server startup failed', `${err.message}\n\nLogs saved to: ${logger.getLogDir()}`);
        });

        serverProcess.on('exit', (code, signal) => {
            logger.info('SERVER', 'Server process exited', { code, signal });
        });

        logger.info('SERVER', 'Server started successfully', { pid: serverProcess.pid, port: PORT });
    } catch (err) {
        logger.error('SERVER', 'Failed to start server', err);
        dialog.showErrorBox('Server startup failed', `${err.message}\n\nLogs saved to: ${logger.getLogDir()}`);
        throw err;
    }
}

async function ensureServer() {
    const available = await isPortAvailable(PORT);
    if (available) {
        startServer();
        return true;
    }

    const healthy = await checkLocalHealth(PORT);
    if (healthy) {
        logger.warn('SERVER', 'Port already in use, reusing existing local server', { port: PORT });
        return true;
    }

    dialog.showErrorBox(
        'Port is already in use',
        `Port ${PORT} is occupied by another process and is not a LumeSync local server.\n\n` +
        `Please stop the process using this port, or restart the computer and try again.\n\n` +
        `Log directory: ${logger.getLogDir()}`
    );
    app.quit();
    return false;
}

// 鈹€鈹€ 鍒涘缓涓荤獥鍙?鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function createWindow() {
    logger.info('WINDOW', 'Creating main window');

    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 700,
        title: 'SyncClassroom Teacher',
        frame: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
        },
        show: false,
    });
    mainWindow.setMenu(null);

    // 鎷︽埅绐楀彛閿欒
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
        logger.error('WINDOW', 'Failed to load page', {
            errorCode,
            errorDescription,
            url: validatedURL
        });
    });

    mainWindow.webContents.on('crashed', (event, killed) => {
        logger.error('WINDOW', 'WebContents crashed', { killed });
    });

    // 绛夋湇鍔″櫒灏辩华鍚庡姞杞介〉闈?
    const tryLoad = (retries = 20) => {
        const http = require('http');
        const timeoutMs = 5000;
        const options = {
            hostname: '127.0.0.1',
            port: PORT,
            path: '/api/health',
            method: 'GET',
            timeout: timeoutMs
        };

        const req = http.request(options, (res) => {
            logger.info('WINDOW', 'Server responded', { statusCode: res.statusCode });
            res.resume();
            mainWindow.loadURL(`http://127.0.0.1:${PORT}`).catch(err => {
                const message = err?.message || String(err) || 'unknown error';
                logger.error('WINDOW', 'Failed to load URL', { message, error: err });
                dialog.showErrorBox('椤甸潰鍔犺浇澶辫触',
                    `鏃犳硶鍔犺浇 http://127.0.0.1:${PORT}\n閿欒: ${message}\n\n璇︾粏鏃ュ織宸蹭繚瀛樺埌: ${logger.getLogDir()}`
                );
            });
        });

        req.on('error', (err) => {
            const message = err?.message || String(err) || 'unknown error';
            logger.error('WINDOW', 'Connection failed', { retries: retries, error: message });
            if (retries > 0) {
                setTimeout(() => tryLoad(retries - 1), 500);
            } else {
                const errorMsg = `鏃犳硶杩炴帴鍒版湰鍦版湇鍔″櫒 (http://127.0.0.1:${PORT})\n\n` +
                    `鍙兘鐨勫師鍥狅細\n` +
                    `1. 绔彛 3000 琚叾浠栫▼搴忓崰鐢╘n` +
                    `2. server.js 鍚姩澶辫触锛堣鏌ョ湅鏃ュ織锛塡n` +
                    `3. 闃茬伀澧欓樆姝簡鏈湴杩炴帴\n\n` +
                    `閿欒璇︽儏: ${message}\n\n` +
                    `鏃ュ織鐩綍: ${logger.getLogDir()}`;
                dialog.showErrorBox('杩炴帴澶辫触', errorMsg);
            }
        });

        req.setTimeout(timeoutMs, () => {
            req.destroy(new Error('Connection timeout'));
            logger.error('WINDOW', 'Connection timeout', { retries: retries, timeoutMs });
            if (retries > 0) {
                setTimeout(() => tryLoad(retries - 1), 500);
            } else {
                const errorMsg = `鏃犳硶杩炴帴鍒版湰鍦版湇鍔″櫒 (http://127.0.0.1:${PORT})\n\n` +
                    `鍙兘鐨勫師鍥狅細\n` +
                    `1. 绔彛 3000 琚叾浠栫▼搴忓崰鐢╘n` +
                    `2. server.js 鍚姩澶辫触锛堣鏌ョ湅鏃ュ織锛塡n` +
                    `3. 闃茬伀澧欓樆姝簡鏈湴杩炴帴\n\n` +
                    `閿欒璇︽儏: Connection timeout\n\n` +
                    `鏃ュ織鐩綍: ${logger.getLogDir()}`;
                dialog.showErrorBox('杩炴帴澶辫触', errorMsg);
            }
        });

        req.end();
    };

    logger.info('WINDOW', 'Will attempt to load page in 1 second');
    setTimeout(() => tryLoad(), 1000);

    mainWindow.once('ready-to-show', () => {
        logger.info('WINDOW', 'Window ready to show');
        mainWindow.show();
    });
    mainWindow.on('closed', () => {
        logger.info('WINDOW', 'Window closed');
        mainWindow = null;
    });

    // 绐楀彛鏈€澶у寲/杩樺師浜嬩欢锛堥€氱煡娓叉煋杩涚▼锛?
    mainWindow.on('maximize', () => {
        mainWindow.webContents.send('window-maximized');
    });
    mainWindow.on('unmaximize', () => {
        mainWindow.webContents.send('window-unmaximized');
    });
}

// 鈹€鈹€ 绯荤粺鎵樼洏 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
function createTray() {
    // 鍔ㄦ€佽绠楁墭鐩樺浘鏍囪矾寰?
    // 寮€鍙戠幆澧? apps/teacher/electron/main.js -> ../../../shared/assets/tray-icon.png
    // 鐢熶骇鐜: 浣跨敤 app.getAppPath() 鑾峰彇搴旂敤璺緞锛岀劧鍚庡畾浣嶅埌鍏变韩璧勬簮
    const iconPath = isDev
        ? path.join(__dirname, '../shared/assets/tray-icon.png')
        : path.join(app.getAppPath(), 'shared', 'assets', 'tray-icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
    tray.setToolTip('SyncClassroom Teacher');

    const menuTemplate = [
        {
            label: 'Open Console',
            click: () => {
                logger.info('TRAY', 'Opening console from tray');
                if (mainWindow) mainWindow.show();
                else createWindow();
            }
        },
        { type: 'separator' },
        {
            label: '鎵撳紑鏃ュ織鐩綍',
            click: () => {
                logger.info('TRAY', 'Opening log directory');
                logger.openLogDir();
            }
        },
        { type: 'separator' },
        {
            label: 'Exit',
            click: () => {
                logger.info('TRAY', 'Quitting from tray');
                app.quit();
            }
        },
    ];

    tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
    tray.on('double-click', () => {
        logger.info('TRAY', 'Double clicked');
        if (mainWindow) mainWindow.show();
    });
}

// 鈹€鈹€ 搴旂敤鐢熷懡鍛ㄦ湡 鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€
app.whenReady().then(async () => {
    logger.info('APP', 'Application ready');

    // 娓呴櫎搴旂敤缂撳瓨锛岄伩鍏嶅姞杞藉埌浠ュ墠涓嬭浇澶辫触/鎹熷潖鐨勮祫婧愶紙濡傝缂撳瓨鐨?404 瀛椾綋锛?
    await session.defaultSession.clearCache();

    // Allow camera/microphone access for course interactions
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowed = ['media', 'camera', 'microphone', 'display-capture', 'videoCapture', 'audioCapture'];
        callback(allowed.includes(permission));
    });
    session.defaultSession.setPermissionCheckHandler((webContents, permission, requestingOrigin, details) => {
        const allowed = ['media', 'camera', 'microphone', 'display-capture', 'videoCapture', 'audioCapture'];
        return allowed.includes(permission);
    });

    const ok = await ensureServer();
    if (!ok) return;
    createWindow();
    createTray();

    if (globalShortcut) {
        const accelerator = 'CommandOrControl+Shift+D';
        const ok = globalShortcut.register(accelerator, () => {
            const win = BrowserWindow.getFocusedWindow() || mainWindow;
            if (!win) return;
            try {
                if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools();
                else win.webContents.openDevTools({ mode: 'detach' });
            } catch (_) {}
        });
        logger.info('APP', 'Debug shortcut registered', { accelerator, ok: !!ok });
    }
});

app.on('will-quit', () => {
    try { globalShortcut && globalShortcut.unregisterAll(); } catch (_) {}
});

// IPC: 璇诲彇/淇濆瓨鏁欏笀绔缃?
ipcMain.handle('get-settings', () => loadSettings());
ipcMain.handle('save-settings', (_, settings) => saveSettings(settings));

// IPC: 鎵撳紑鏃ュ織鐩綍
ipcMain.handle('open-log-dir', () => {
    logger.info('IPC', 'Opening log directory requested');
    logger.openLogDir();
    return logger.getLogDir();
});

// IPC: 閫夋嫨鎻愪氦鍐呭瀛樺偍鐩綍
ipcMain.handle('select-submission-dir', async () => {
    logger.info('IPC', 'Selecting submission directory');
    const result = await dialog.showOpenDialog(mainWindow, {
        title: '閫夋嫨瀛︾敓鎻愪氦鍐呭瀛樺偍浣嶇疆',
        properties: ['openDirectory', 'createDirectory']
    });

    if (result.canceled || result.filePaths.length === 0) {
        logger.info('IPC', 'Submission directory selection cancelled');
        return null;
    }

    const selectedDir = result.filePaths[0];
    logger.info('IPC', 'Submission directory selected', { dir: selectedDir });
    return selectedDir;
});

// IPC: 鍒囨崲鍏ㄥ睆
ipcMain.on('toggle-fullscreen', () => {
    if (!mainWindow) return;
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
});

ipcMain.on('toggle-devtools', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || mainWindow;
    if (!win) return;
    try {
        if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools();
        else win.webContents.openDevTools({ mode: 'detach' });
    } catch (_) {}
});

// IPC: 绐楀彛鎺у埗
ipcMain.on('minimize-window', () => {
    if (!mainWindow) return;
    mainWindow.minimize();
});

ipcMain.on('maximize-window', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
        mainWindow.unmaximize();
    } else {
        mainWindow.maximize();
    }
});

ipcMain.on('close-window', () => {
    if (!mainWindow) return;
    mainWindow.close();
});

// IPC: 瀵煎叆璇剧▼鏂囦欢锛堝脊鍑烘枃浠堕€夋嫨瀵硅瘽妗嗭紝澶嶅埗鍒?public/courses/锛?
ipcMain.handle('import-course', async () => {
    logger.info('IPC', 'Import course requested');
    const result = await dialog.showOpenDialog(mainWindow, {
        title: '瀵煎叆璇剧▼鏂囦欢',
        filters: [
            { name: '钀ょ伀璇句欢鏂囦欢', extensions: ['lume'] },
            { name: 'Legacy Course Files', extensions: ['tsx', 'ts', 'jsx', 'js'] },
            { name: 'PDF璇句欢', extensions: ['pdf'] },
            { name: 'All Files', extensions: ['*'] },
        ],
        properties: ['openFile', 'multiSelections'],
    });
    if (result.canceled || !result.filePaths.length) {
        return { success: false, canceled: true };
    }
    const coursesDir = path.join(getSharedPublicRoot(), 'courses');
    if (!require('fs').existsSync(coursesDir)) {
        require('fs').mkdirSync(coursesDir, { recursive: true });
    }
    const allowedExts = new Set(['.lume', '.tsx', '.ts', '.jsx', '.js', '.pdf']);
    const imported = [];
    const skipped = [];
    for (const srcPath of result.filePaths) {
        const ext = path.extname(srcPath || '').toLowerCase();
        if (!allowedExts.has(ext)) {
            skipped.push(path.basename(srcPath));
            continue;
        }

        const baseName = path.parse(srcPath).name;
        let destName = ext === '.pdf' ? `${baseName}.pdf` : `${baseName}.lume`;
        let destPath = path.join(coursesDir, destName);
        let n = 1;
        while (require('fs').existsSync(destPath)) {
            destName = ext === '.pdf' ? `${baseName}-${n}.pdf` : `${baseName}-${n}.lume`;
            destPath = path.join(coursesDir, destName);
            n += 1;
        }
        try {
            require('fs').copyFileSync(srcPath, destPath);
            imported.push(destName);
            logger.info('IMPORT', 'Course imported', { fileName: destName });
        } catch (err) {
            skipped.push(destName);
            logger.error('IMPORT', 'Failed to copy course', { fileName: destName, error: err.message });
        }
    }
    return { success: true, imported, skipped };
});

// IPC: 瀵煎嚭璇剧▼鏂囦欢锛堜粠 public/courses/ 澶嶅埗鍒扮敤鎴烽€夋嫨鐨勪綅缃級
ipcMain.handle('export-course', async (event, { courseFile } = {}) => {
    try {
        const coursesDir = path.join(getSharedPublicRoot(), 'courses');
        const resolvedCoursesDir = path.resolve(coursesDir);
        const requested = String(courseFile || '').trim();
        if (!requested) return { success: false, error: 'Missing courseFile' };

        const sourcePath = path.resolve(coursesDir, requested);
        if (!sourcePath.toLowerCase().startsWith((resolvedCoursesDir + path.sep).toLowerCase())) {
            return { success: false, error: 'Invalid course path' };
        }
        if (!require('fs').existsSync(sourcePath)) {
            return { success: false, error: 'Course file not found' };
        }

        const srcExt = (path.extname(requested || '') || '.lume').toLowerCase();
        const ensureExt = (p, ext) => {
            const currentExt = path.extname(p || '');
            if (!currentExt) return `${p}${ext}`;
            return p;
        };

        const suggestedName = path.basename(requested);
        const result = await dialog.showSaveDialog(mainWindow, {
            title: '瀵煎嚭璇句欢鏂囦欢',
            defaultPath: suggestedName,
            filters: [
                { name: '钀ょ伀璇句欢鏂囦欢', extensions: ['lume'] },
                { name: 'PDF璇句欢', extensions: ['pdf'] },
                { name: 'All Files', extensions: ['*'] },
            ],
        });

        if (result.canceled || !result.filePath) {
            return { success: false, canceled: true };
        }

        const targetPath = ensureExt(result.filePath, srcExt);
        require('fs').copyFileSync(sourcePath, targetPath);
        return { success: true, filePath: targetPath, filename: path.basename(targetPath) };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

app.on('window-all-closed', (e) => {
    logger.info('APP', 'All windows closed, preventing quit to keep server running');
    // 鍏抽棴绐楀彛涓嶉€€鍑猴紝淇濇寔鏈嶅姟鍣ㄨ繍琛?
    e.preventDefault();
});

app.on('before-quit', () => {
    logger.info('APP', 'Application about to quit');
    if (serverProcess) {
        logger.info('APP', 'Killing server process', { pid: serverProcess.pid });
        serverProcess.kill();
    }
});

app.on('activate', () => {
    logger.debug('APP', 'Application activated');
    if (!mainWindow) createWindow();
});

app.on('quit', () => {
    logger.info('APP', 'Application quit');
});

