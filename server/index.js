const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const { config, initDirectories } = require('./src/config');
const {
    fontCacheCleaner,
    handleLibRequest,
    handleWebfontsRequest,
    handleLibFontsRequest,
    handleImagesProxyRequest,
    handleWeightsRequest,
    dependencyMap
} = require('./src/proxy');
const {
    router: apiRouter,
    setCurrentCourseId,
    setCurrentSlideIndex,
    getCurrentCourseId,
    getCurrentSlideIndex,
    getCourseCatalog,
    setCourseCatalog
} = require('./src/routes');
const { scanCourses } = require('./src/courses');

const runtimeControl = require(path.join(__dirname, '../packages/runtime-control'));
const renderEngine = require(path.join(__dirname, '../packages/render-engine'));

const app = express();
const server = http.createServer(app);
const io = new Server(server, config.socket);
const runtime = runtimeControl;

app.use(express.json(config.body));
app.use(express.urlencoded({ extended: false }));

initDirectories();

app.use(fontCacheCleaner);

const engineDir = renderEngine.resolveEngineSrcDir();
app.use('/engine', express.static(engineDir));
app.use('/engine/src', express.static(engineDir));

const staticDir = process.env.STATIC_DIR || config.cacheRoot;
app.use(express.static(staticDir));

app.get('/lib/fonts', (_req, res) => {
    res.status(404).send('not found: fonts');
});

app.get('/lib/:fileName', handleLibRequest);
app.get('/webfonts/:fileName', handleWebfontsRequest);
app.get('/lib/fonts/:fileName', handleLibFontsRequest);
app.get('/images/proxy', handleImagesProxyRequest);
app.get('/weights/:fileName', handleWeightsRequest);

app.use('/api/teacher', apiRouter);
app.use('/api', apiRouter);

app.get('/api/students', (_req, res) => {
    const studentIPs = runtime.getStudentIPs();
    const students = Array.from(studentIPs.keys() || []).map((ip) =>
        ip.startsWith('::ffff:') ? ip.slice(7) : ip
    );
    res.json({ students });
});

app.get('/api/student-log', (_req, res) => {
    res.json({ log: runtime.getStudentLog() });
});

app.get('*', (_req, res) => {
    res.status(404).send(`
        <div style="font-family: sans-serif; padding: 40px; background-color: #f8fafc; color: #334155; line-height: 1.6;">
            <h2 style="color: #ef4444;">Not Found</h2>
            <p>Please ensure index.html is in your static root directory.</p>
        </div>
    `);
});

runtime.setupSocketHandlers(io, {
    setCurrentCourseId,
    setCurrentSlideIndex,
    getCurrentCourseId,
    getCurrentSlideIndex,
    getCourseCatalog,
    refreshCourseCatalog: () => {
        const catalog = scanCourses();
        setCourseCatalog(catalog);
        return catalog;
    },
    registerDependencies: (deps) => {
        deps.forEach(({ filename, publicSrc }) => {
            if (filename && publicSrc) {
                dependencyMap[filename] = publicSrc;
            }
        });
    }
});

function startServer(port) {
    const PORT = port || config.port;
    server.listen(PORT, () => {
        console.log(`[teacher-server] running on port ${PORT}`);
        console.log(`[teacher-server] static root: ${staticDir}`);
    });

    process.on('SIGTERM', () => {
        server.close(() => process.exit(0));
    });

    process.on('SIGINT', () => {
        server.close(() => process.exit(0));
    });

    return server;
}

if (require.main === module) {
    startServer();
}

module.exports = { app, server, io, startServer };
