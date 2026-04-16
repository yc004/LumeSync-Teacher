// ========================================================
// Teacher local app shell. Course rendering is provided by /engine from repos/core.
// ========================================================
const IDENTITY_CLIENT_ID_KEY = 'lumesync_host_client_id';
const RENDER_ENGINE_BUNDLE = '/render-engine.js';
let renderEnginePromise = null;
const TEACHER_LAYER_CLASS = Object.freeze({
    floatingChrome: 'z-[9990]',
    overlay: 'z-[10000]',
    modal: 'z-[10020]',
    drawer: 'z-[10030]',
    popup: 'z-[10040]',
});

const getTeacherLayerClass = (key) => window.__LumeSyncLayer?.[key] || TEACHER_LAYER_CLASS[key] || '';
window.__getTeacherLayerClass = getTeacherLayerClass;

const CLASSROOM_WINDOW_KEY = 'lumesync-classroom-window-open';

window.__LumeSyncIsStandaloneClassroomWindow = () => window.__LumeSyncWindowMode === 'classroom';
window.__LumeSyncClassroomWindowOpen = false;

const syncClassroomWindowFlag = () => {
    try {
        window.__LumeSyncClassroomWindowOpen = localStorage.getItem(CLASSROOM_WINDOW_KEY) === '1';
    } catch (_) {
        window.__LumeSyncClassroomWindowOpen = false;
    }
};

const markClassroomWindowOpened = () => {
    window.__LumeSyncClassroomWindowOpen = true;
    try { localStorage.setItem(CLASSROOM_WINDOW_KEY, '1'); } catch (_) {}
};

const markClassroomWindowClosed = () => {
    window.__LumeSyncClassroomWindowOpen = false;
    try { localStorage.removeItem(CLASSROOM_WINDOW_KEY); } catch (_) {}
};

syncClassroomWindowFlag();

window.__LumeSyncOpenClassroomWindow = () => {
    syncClassroomWindowFlag();
    if (typeof window.openWindow === 'function') {
        if (!window.__LumeSyncClassroomWindowOpen) {
            markClassroomWindowOpened();
        }
        window.openWindow('', {
            mode: 'classroom',
            width: 1800,
            height: 1350,
            title: '机房视图'
        });
    }
};

if (window.__LumeSyncIsStandaloneClassroomWindow?.()) {
    markClassroomWindowOpened();
    window.addEventListener('beforeunload', markClassroomWindowClosed);
    window.addEventListener('pagehide', markClassroomWindowClosed);
    window.addEventListener('unload', markClassroomWindowClosed);
}

window.addEventListener('storage', (event) => {
    if (event.key === CLASSROOM_WINDOW_KEY) {
        syncClassroomWindowFlag();
    }
});

window.__LumeSyncCloseClassroomWindow = markClassroomWindowClosed;
const ensureTeacherShellStyles = () => {
    window.__LumeSyncLayer = { ...(window.__LumeSyncLayer || {}), ...TEACHER_LAYER_CLASS };
    if (document.getElementById('teacher-shell-liquid-style')) return;
    const style = document.createElement('style');
    style.id = 'teacher-shell-liquid-style';
    style.textContent = `
        :root {
            --teacher-bg: #07111f;
            --teacher-glass: rgba(15, 23, 42, 0.68);
            --teacher-glass-strong: rgba(15, 23, 42, 0.82);
            --teacher-glass-soft: rgba(15, 23, 42, 0.54);
            --teacher-border: rgba(255, 255, 255, 0.18);
            --teacher-border-strong: rgba(255, 255, 255, 0.28);
            --teacher-accent: #38bdf8;
        }
        .teacher-shell-page {
            background:
                radial-gradient(circle at 12% 8%, rgba(56, 189, 248, 0.26), transparent 30%),
                radial-gradient(circle at 88% 18%, rgba(16, 185, 129, 0.18), transparent 28%),
                linear-gradient(145deg, #020617 0%, #07111f 50%, #0f172a 100%);
            color: #f8fafc;
        }
        .teacher-glass {
            background: linear-gradient(135deg, var(--teacher-glass), var(--teacher-glass-soft));
            border: 1px solid var(--teacher-border);
            box-shadow: 0 24px 80px rgba(2, 6, 23, 0.42), inset 0 1px 0 rgba(255,255,255,0.18);
            backdrop-filter: blur(26px) saturate(155%);
            -webkit-backdrop-filter: blur(26px) saturate(155%);
            color: #f8fafc;
        }
        .teacher-glass-dark {
            background: linear-gradient(135deg, var(--teacher-glass-strong), var(--teacher-glass));
            border: 1px solid var(--teacher-border);
            box-shadow: 0 24px 90px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255,255,255,0.16);
            backdrop-filter: blur(28px) saturate(160%);
            -webkit-backdrop-filter: blur(28px) saturate(160%);
            color: #f8fafc;
        }
        .teacher-glass-light {
            background: linear-gradient(135deg, var(--teacher-glass), var(--teacher-glass-soft));
            border: 1px solid var(--teacher-border);
            box-shadow: 0 20px 70px rgba(2, 6, 23, 0.36), inset 0 1px 0 rgba(255,255,255,0.18);
            backdrop-filter: blur(26px) saturate(155%);
            -webkit-backdrop-filter: blur(26px) saturate(155%);
            color: #f8fafc;
        }
        .teacher-floating-topbar {
            position: absolute;
            left: 16px;
            right: 16px;
            top: 14px;
            z-index: 9990;
            min-height: 58px;
            border-radius: 24px;
            padding: 10px 14px;
        }
        .teacher-floating-dock {
            position: absolute;
            left: 50%;
            bottom: 14px;
            z-index: 9990;
            transform: translateX(-50%);
            pointer-events: auto;
            border-radius: 24px;
            padding: 10px;
        }
        .teacher-liquid-button {
            border: 1px solid rgba(255,255,255,0.18);
            background: rgba(255,255,255,0.12);
            color: #e2e8f0;
            box-shadow: inset 0 1px 0 rgba(255,255,255,0.18), 0 10px 28px rgba(2,6,23,0.24);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
        }
        .teacher-liquid-button:hover {
            background: rgba(255,255,255,0.2);
            color: #fff;
            transform: translateY(-1px);
        }
        .teacher-glass-light .teacher-liquid-button {
            background: rgba(255,255,255,0.12);
            color: #e2e8f0;
            border-color: rgba(255,255,255,0.18);
        }
        .teacher-glass-light .teacher-liquid-button:hover {
            background: rgba(255,255,255,0.2);
            color: #fff;
        }
        .teacher-liquid-primary {
            background: linear-gradient(135deg, rgba(14,165,233,0.94), rgba(16,185,129,0.84));
            color: #fff;
            border-color: rgba(255,255,255,0.3);
            box-shadow: 0 16px 44px rgba(14,165,233,0.28);
        }
        .teacher-liquid-danger {
            background: linear-gradient(135deg, rgba(239,68,68,0.9), rgba(244,63,94,0.78));
            color: #fff;
        }
        .teacher-course-stage {
            position: absolute;
            inset: 0;
            padding: 12px;
            z-index: 1;
        }
        .teacher-course-stage > * {
            border-radius: 24px;
            overflow: hidden;
            box-shadow: 0 30px 100px rgba(0,0,0,0.35);
        }
        .teacher-glass-drawer {
            background: linear-gradient(145deg, var(--teacher-glass-strong), var(--teacher-glass));
            border-left: 1px solid rgba(255,255,255,0.16);
            box-shadow: -30px 0 90px rgba(0,0,0,0.42);
            backdrop-filter: blur(28px) saturate(150%);
            -webkit-backdrop-filter: blur(28px) saturate(150%);
            color: #f8fafc;
        }
        .teacher-shell-page button,
        .teacher-glass button {
            transition: transform 160ms ease, background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
        }
        .teacher-borderless {
            border-color: transparent !important;
        }
        @keyframes teacherGlassIn {
            from { opacity: 0; transform: translateY(14px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .teacher-glass-enter { animation: teacherGlassIn 260ms ease-out both; }
        @keyframes teacherDockIn {
            from { opacity: 0; transform: translateX(-50%) translateY(14px) scale(0.98); }
            to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        .teacher-floating-dock.teacher-glass-enter { animation: teacherDockIn 260ms ease-out both; }
    `;
    document.head.appendChild(style);
};

window.__LumeSyncStartWindowDrag = (event) => {
    if (!event || event.button !== 0) return;
    if (event.target?.closest?.('[data-window-control="true"]')) return;
    if (event.target?.closest?.('button, a, input, textarea, select, label, summary, [role="button"], [data-no-window-drag="true"]')) return;
    if (!window.electronAPI?.beginWindowDrag) return;

    window.electronAPI.beginWindowDrag({ screenX: event.screenX, screenY: event.screenY });
};

const loadGlobalScript = (src) => new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script ${src}`));
    document.head.appendChild(script);
});

const ensureRenderEngineLoaded = async () => {
    if (window.LumeSyncRenderEngine?.loadCourse) return window.LumeSyncRenderEngine;
    if (!renderEnginePromise) {
        renderEnginePromise = (async () => {
            await loadGlobalScript(RENDER_ENGINE_BUNDLE);
            if (!window.LumeSyncRenderEngine?.loadCourse) {
                throw new Error('LumeSyncRenderEngine failed to initialize');
            }
            return window.LumeSyncRenderEngine;
        })();
    }
    return renderEnginePromise;
};

const normalizeRole = (role) => {
    const r = String(role || '').trim().toLowerCase();
    if (r === 'host' || r === 'teacher') return 'host';
    if (r === 'viewer' || r === 'student') return 'viewer';
    return '';
};

const pickIdentityFromInjected = () => {
    const src = window.__LumeSyncIdentity || null;
    if (!src || typeof src !== 'object') return null;
    return {
        role: normalizeRole(src.role),
        token: src.token ? String(src.token) : '',
        clientId: src.clientId ? String(src.clientId) : ''
    };
};

const pickIdentityFromQuery = () => {
    try {
        const params = new URLSearchParams(window.location.search || '');
        const role = normalizeRole(params.get('role'));
        const token = params.get('token') || '';
        const clientId = params.get('clientId') || '';
        return { role, token, clientId };
    } catch (_) {
        return { role: '', token: '', clientId: '' };
    }
};

const cleanupSensitiveIdentityQuery = () => {
    try {
        const url = new URL(window.location.href);
        let changed = false;
        for (const key of ['token', 'role', 'clientId']) {
            if (url.searchParams.has(key)) {
                url.searchParams.delete(key);
                changed = true;
            }
        }
        if (changed) {
            window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
        }
    } catch (_) {}
};

const getOrCreateHostClientId = () => {
    try {
        const existing = localStorage.getItem(IDENTITY_CLIENT_ID_KEY);
        if (existing) return existing;
        const next = `host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(IDENTITY_CLIENT_ID_KEY, next);
        return next;
    } catch (_) {
        return `host-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }
};

const prepareSocketAuth = async () => {
    const injected = pickIdentityFromInjected() || {};
    const query = pickIdentityFromQuery() || {};

    const rawRole = injected.role || query.role || '';
    const declaredRole = normalizeRole(rawRole);
    const rawToken = injected.token || query.token || '';
    const rawClientId = injected.clientId || query.clientId || '';

    let token = rawToken;
    let clientId = rawClientId || getOrCreateHostClientId();

    if (!token && window.teacherHost?.bootstrapSession) {
        const session = await window.teacherHost.bootstrapSession();
        token = session?.token ? String(session.token) : '';
        clientId = session?.clientId ? String(session.clientId) : clientId;
    }

    if (!token) {
        return null;
    }

    if (declaredRole && declaredRole !== 'host') {
        throw new Error('Teacher console must connect as host');
    }

    return {
        role: 'host',
        token,
        clientId
    };
};

function ClassroomApp() {
    const [isHost, setIsHost] = useState(false);
    const [roleAssigned, setRoleAssigned] = useState(false);
    const [identityError, setIdentityError] = useState('');
    const [courseCatalog, setCourseCatalog] = useState([]);
    const [currentCourseId, setCurrentCourseId] = useState(null);
    const [currentCourseData, setCurrentCourseData] = useState(null);
    const [initialSlideIndex, setInitialSlideIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const [courseError, setCourseError] = useState(null);
    const [copyDone, setCopyDone] = useState(false);
    const [currentSlide, setCurrentSlide] = useState(0);
    const [showSettings, setShowSettings] = useState(false);
    const [showLog, setShowLog] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState({
        currentStep: '',
        currentFile: '',
        progress: 0,
        totalSteps: 0,
        currentStepIndex: 0
    });

    const DEFAULT_SETTINGS = {
        forceFullscreen: true,
        syncFollow: true,
        allowInteract: true,
        syncInteraction: false,  // 默认关闭教师交互同步
        podiumAtTop: true,
        renderScale: 0.96,
        uiScale: 1.0,
        alertJoin: true,
        alertLeave: true,
        alertFullscreenExit: true,
        alertTabHidden: true,
        monitorEnabled: false,
        monitorIntervalSec: 1,
    };
    const clampMonitorIntervalSec = (value) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return 1;
        const clamped = Math.min(5, Math.max(0.5, n));
        return Math.round(clamped * 2) / 2;
    };
    const [settings, setSettings] = useState(DEFAULT_SETTINGS);
    const [studentCount, setStudentCount] = useState(0);
    const [sharedStudentLog, setSharedStudentLog] = useState([]);
    const [studentScreenshots, setStudentScreenshots] = useState({});
    const [studentInfo, setStudentInfo] = useState({ ip: '', name: '', studentId: '' });
    const socketRef = useRef(null);
    const courseCatalogRef = useRef([]);
    const settingsRef = useRef(settings);
    const studentCountPollRef = useRef(null);
    const activeCourseIdRef = useRef(null);

    // 批注工具状态
    const [annotateEnabled, setAnnotateEnabled] = useState(false);
    const [annoTool, setAnnoTool] = useState('pen');
    const [annoWidth, setAnnoWidth] = useState(4);
    const [annoColor, setAnnoColor] = useState('#ef4444');
    const [annoPopupType, setAnnoPopupType] = useState(null);
    const annoCanvasRef = useRef(null);
    const annoIsDrawingRef = useRef(false);
    const annoLastPointRef = useRef(null);
    const annoLastSendAtRef = useRef(0);
    const annoSegmentsRef = useRef(new Map());
    const annoPenRef = useRef({ tool: 'pen', color: '#ef4444', width: 4, alpha: 1 });
    const annoStrokePointsRef = useRef([]);
    const annoMouseFallbackRef = useRef(false);
    const shellPageRef = useRef(null);
    const teacherStageHostRef = useRef(null);
    const [annoStageRect, setAnnoStageRect] = useState(null);
    const [annoStageUsesFallback, setAnnoStageUsesFallback] = useState(false);
    const annoKey = (cid, slideIdx) => `${String(cid || '')}:${Number(slideIdx || 0)}`;
    const isStandaloneClassroomWindow = window.__LumeSyncIsStandaloneClassroomWindow?.() === true;
    useEffect(() => { settingsRef.current = settings; }, [settings]);

    useEffect(() => {
        if (window.electronAPI?.getSettings) {
            window.electronAPI.getSettings().then(saved => {
                if (!saved) return;
                const next = { ...settingsRef.current, ...saved };
                next.monitorIntervalSec = clampMonitorIntervalSec(next.monitorIntervalSec);
                settingsRef.current = next;
                setSettings(next);
                if (socketRef.current && socketRef.current.connected) {
                    socketRef.current.emit('host-settings', next);
                }
            });
        }
    }, []);

    // ── 批注 canvas 工具函数 ──────────────────────────────────────────
    const findCourseStageElement = (host) => {
        if (!host) return null;
        return (
            host.querySelector('[data-lumesync-stage-root="true"]')
            || host.querySelector('.bg-white.text-slate-800.relative.shadow-2xl.flex.flex-col.rounded-2xl.overflow-hidden.shrink-0')
            || host.querySelector('div[style*="width: 1280px"][style*="height: 720px"]')
        );
    };

    const buildFallbackStageRect = (shell, host) => {
        if (!shell || !host) return null;
        const shellRect = shell.getBoundingClientRect();
        const hostRect = host.getBoundingClientRect();
        const inset = 12; // .teacher-course-stage padding
        const width = Math.max(1, hostRect.width - inset * 2);
        const height = Math.max(1, hostRect.height - inset * 2);
        return {
            left: hostRect.left - shellRect.left + inset,
            top: hostRect.top - shellRect.top + inset,
            width,
            height,
        };
    };

    const prepareAnnoCanvas = () => {
        const canvas = annoCanvasRef.current;
        if (!canvas) return null;
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(1, Math.floor(rect.width * dpr));
        const h = Math.max(1, Math.floor(rect.height * dpr));
        const resized = canvas.width !== w || canvas.height !== h;
        if (resized) { canvas.width = w; canvas.height = h; }
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        return { ctx, baseW: rect.width, baseH: rect.height, resized };
    };

    const drawAnnoSegmentOn = (ctx, baseW, baseH, seg) => {
        if (!ctx || !seg || !Array.isArray(seg.points) || seg.points.length < 2) return;
        const tool = seg.tool || 'pen';
        ctx.globalAlpha = Number.isFinite(Number(seg.alpha)) ? Number(seg.alpha) : 1;
        ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
        ctx.strokeStyle = seg.color || '#ef4444';
        ctx.lineWidth = Number(seg.width) || 4;
        const [p0, ...rest] = seg.points;
        ctx.beginPath();
        ctx.moveTo((p0[0] || 0) * baseW, (p0[1] || 0) * baseH);
        for (const p of rest) ctx.lineTo((p[0] || 0) * baseW, (p[1] || 0) * baseH);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
    };

    const renderAnnoForCurrent = () => {
        const m = prepareAnnoCanvas();
        if (!m) return;
        m.ctx.clearRect(0, 0, m.baseW, m.baseH);
        const segs = annoSegmentsRef.current.get(annoKey(currentCourseId, currentSlide)) || [];
        for (const seg of segs) drawAnnoSegmentOn(m.ctx, m.baseW, m.baseH, seg);
    };

    const getAnnoPoint = (evt) => {
        const canvas = annoCanvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const vw = Math.max(1, rect.width);
        const vh = Math.max(1, rect.height);
        const xn = Math.max(0, Math.min(1, (evt.clientX - rect.left) / vw));
        const yn = Math.max(0, Math.min(1, (evt.clientY - rect.top) / vh));
        return { x: xn * vw, y: yn * vh, xn, yn };
    };

    const emitAnnoSegment = (p0, p1) => {
        if (!currentCourseId || !socketRef.current) return;
        socketRef.current.emit('annotation:segment', {
            courseId: currentCourseId,
            slideIndex: currentSlide,
            tool: annoPenRef.current.tool,
            color: annoPenRef.current.color,
            width: annoPenRef.current.width,
            alpha: annoPenRef.current.alpha,
            points: [[p0.xn, p0.yn], [p1.xn, p1.yn]],
        });
    };

    const finalizeAnnoStroke = () => {
        const pts = annoStrokePointsRef.current || [];
        if (pts.length < 2) return;
        const seg = { tool: annoPenRef.current.tool, color: annoPenRef.current.color, width: annoPenRef.current.width, alpha: annoPenRef.current.alpha, points: pts };
        const key = annoKey(currentCourseId, currentSlide);
        const arr = annoSegmentsRef.current.get(key) || [];
        arr.push(seg);
        if (arr.length > 5000) arr.splice(0, arr.length - 5000);
        annoSegmentsRef.current.set(key, arr);
        if (socketRef.current && currentCourseId) {
            socketRef.current.emit('annotation:stroke', { courseId: currentCourseId, slideIndex: currentSlide, ...seg });
        }
    };

    const stopAnnoDrawing = () => {
        if (annoIsDrawingRef.current) finalizeAnnoStroke();
        annoIsDrawingRef.current = false;
        annoLastPointRef.current = null;
        annoStrokePointsRef.current = [];
        annoMouseFallbackRef.current = false;
    };

    const handleClearAnno = () => {
        if (!currentCourseId) return;
        annoSegmentsRef.current.set(annoKey(currentCourseId, currentSlide), []);
        const m = prepareAnnoCanvas();
        if (m) m.ctx.clearRect(0, 0, m.baseW, m.baseH);
        if (socketRef.current) socketRef.current.emit('annotation:clear', { courseId: currentCourseId, slideIndex: currentSlide });
    };

    const handleAnnoPointerDown = (e) => {
        if (!annotateEnabled) return;
        annoMouseFallbackRef.current = false;
        const p = getAnnoPoint(e);
        if (!p) return;
        annoIsDrawingRef.current = true;
        annoLastPointRef.current = p;
        annoLastSendAtRef.current = 0;
        annoStrokePointsRef.current = [[p.xn, p.yn]];
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) {}
        let m = prepareAnnoCanvas();
        if (m && m.resized) { renderAnnoForCurrent(); m = prepareAnnoCanvas(); }
        if (m) {
            const tool = annoPenRef.current.tool;
            m.ctx.globalAlpha = annoPenRef.current.alpha;
            m.ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
            m.ctx.fillStyle = tool === 'eraser' ? '#000000' : annoPenRef.current.color;
            const r = Math.max(1, (annoPenRef.current.width || 4) / 2);
            m.ctx.beginPath();
            m.ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
            m.ctx.fill();
            m.ctx.globalAlpha = 1;
            m.ctx.globalCompositeOperation = 'source-over';
        }
    };

    const handleAnnoPointerMove = (e) => {
        if (!annoIsDrawingRef.current) return;
        const p = getAnnoPoint(e);
        const last = annoLastPointRef.current;
        if (!p || !last) return;
        let m = prepareAnnoCanvas();
        if (m && m.resized) { renderAnnoForCurrent(); m = prepareAnnoCanvas(); }
        if (m) {
            const tool = annoPenRef.current.tool;
            m.ctx.globalAlpha = annoPenRef.current.alpha;
            m.ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
            m.ctx.strokeStyle = tool === 'eraser' ? '#000000' : annoPenRef.current.color;
            m.ctx.lineWidth = annoPenRef.current.width;
            m.ctx.beginPath();
            m.ctx.moveTo(last.x, last.y);
            m.ctx.lineTo(p.x, p.y);
            m.ctx.stroke();
            m.ctx.globalAlpha = 1;
            m.ctx.globalCompositeOperation = 'source-over';
        }
        annoStrokePointsRef.current.push([p.xn, p.yn]);
        annoLastPointRef.current = p;
        const now = Date.now();
        if (now - (annoLastSendAtRef.current || 0) >= 20) {
            annoLastSendAtRef.current = now;
            emitAnnoSegment(last, p);
        }
    };

    const handleAnnoMouseDown = (e) => {
        if (!annotateEnabled) return;
        if (annoIsDrawingRef.current) return;
        annoMouseFallbackRef.current = true;
        handleAnnoPointerDown(e);
    };

    const handleAnnoMouseMove = (e) => {
        if (!annoMouseFallbackRef.current) return;
        handleAnnoPointerMove(e);
    };

    const handleAnnoMouseUp = () => {
        if (!annoMouseFallbackRef.current) return;
        stopAnnoDrawing();
    };

    // 更新 annoPenRef
    useEffect(() => {
        const tool = annoTool || 'pen';
        const alpha = tool === 'highlighter' ? 0.25 : tool === 'marker' ? 0.6 : 1;
        annoPenRef.current = { tool, color: annoColor, width: Math.min(Math.max(annoWidth, 1), 30), alpha };
    }, [annoTool, annoColor, annoWidth]);

    // 切换页面时重绘
    useEffect(() => {
        if (currentCourseId && socketRef.current) {
            socketRef.current.emit('annotation:get', { courseId: currentCourseId, slideIndex: currentSlide });
        }
        renderAnnoForCurrent();
    }, [currentCourseId, currentSlide]);

    // canvas resize 时重绘
    useEffect(() => {
        const canvas = annoCanvasRef.current;
        if (!canvas) return;
        let raf = 0;
        const ro = new ResizeObserver(() => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(() => { stopAnnoDrawing(); renderAnnoForCurrent(); });
        });
        ro.observe(canvas);
        return () => { if (raf) cancelAnimationFrame(raf); ro.disconnect(); };
    }, [currentCourseId, currentSlide]);

    // 对齐到 core 中真实的 16:9 舞台区域，避免教师端/学生端坐标基准不一致
    useEffect(() => {
        const shell = shellPageRef.current;
        const host = teacherStageHostRef.current;
        if (!shell || !host) return;

        let raf = 0;
        let ro = null;

        const updateStageRect = () => {
            const stageEl = findCourseStageElement(host);
            if (!stageEl) {
                const fallback = buildFallbackStageRect(shell, host);
                if (fallback) {
                    setAnnoStageRect(fallback);
                    setAnnoStageUsesFallback(true);
                }
                return;
            }
            const shellRect = shell.getBoundingClientRect();
            const stageRect = stageEl.getBoundingClientRect();
            setAnnoStageRect({
                left: stageRect.left - shellRect.left,
                top: stageRect.top - shellRect.top,
                width: stageRect.width,
                height: stageRect.height,
            });
            setAnnoStageUsesFallback(false);
        };

        const scheduleUpdate = () => {
            if (raf) cancelAnimationFrame(raf);
            raf = requestAnimationFrame(updateStageRect);
        };

        scheduleUpdate();
        ro = new ResizeObserver(scheduleUpdate);
        ro.observe(shell);
        ro.observe(host);
        window.addEventListener('resize', scheduleUpdate);

        return () => {
            if (raf) cancelAnimationFrame(raf);
            if (ro) ro.disconnect();
            window.removeEventListener('resize', scheduleUpdate);
        };
    }, [currentCourseId, currentSlide, currentCourseData?.id, settings?.renderScale, settings?.uiScale]);
    // ── 批注工具函数结束 ──────────────────────────────────────────────

    const hasAnnoStageRect = annoStageRect && annoStageRect.width > 0 && annoStageRect.height > 0;
    const annoCanvasBoxStyle = hasAnnoStageRect
        ? {
            left: `${annoStageRect.left}px`,
            top: `${annoStageRect.top}px`,
            width: `${annoStageRect.width}px`,
            height: `${annoStageRect.height}px`,
        }
        : {
            left: '12px',
            top: '12px',
            right: '12px',
            bottom: '12px',
        };

    useEffect(() => {
        if (!isHost) return;
        requestAnimationFrame(() => renderAnnoForCurrent());
    }, [isHost, hasAnnoStageRect, annoStageRect?.left, annoStageRect?.top, annoStageRect?.width, annoStageRect?.height, currentCourseId, currentSlide]);

    // 舞台节点可能晚于首帧挂载：如果当前仍是 fallback，持续短时重试直到拿到真实舞台矩形
    useEffect(() => {
        if (!isHost) return;
        if (hasAnnoStageRect && !annoStageUsesFallback) return;
        const shell = shellPageRef.current;
        const host = teacherStageHostRef.current;
        if (!shell || !host) return;
        let raf = 0;
        let attempts = 0;
        const maxAttempts = 240; // ~4 秒（60fps）
        const tryResolve = () => {
            attempts += 1;
            const stageEl = findCourseStageElement(host);
            if (!stageEl) {
                if (!hasAnnoStageRect) {
                    const fallback = buildFallbackStageRect(shell, host);
                    if (fallback) {
                        setAnnoStageRect(fallback);
                        setAnnoStageUsesFallback(true);
                    }
                }
                if (attempts < maxAttempts) raf = requestAnimationFrame(tryResolve);
                return;
            }
            const shellRect = shell.getBoundingClientRect();
            const stageRect = stageEl.getBoundingClientRect();
            if (stageRect.width <= 0 || stageRect.height <= 0) {
                if (attempts < maxAttempts) raf = requestAnimationFrame(tryResolve);
                return;
            }
            setAnnoStageRect({
                left: stageRect.left - shellRect.left,
                top: stageRect.top - shellRect.top,
                width: stageRect.width,
                height: stageRect.height,
            });
            setAnnoStageUsesFallback(false);
        };
        raf = requestAnimationFrame(tryResolve);
        return () => { if (raf) cancelAnimationFrame(raf); };
    }, [isHost, hasAnnoStageRect, annoStageUsesFallback, currentCourseId, currentSlide, currentCourseData?.id]);

    const handleSettingsChange = (key, value) => {
        let next = { ...settingsRef.current, [key]: value };
        
        // 支持一次性传入多个设置项。
        if (typeof key === 'object' && key !== null) {
            next = { ...settingsRef.current, ...key };
        }
        next.monitorIntervalSec = clampMonitorIntervalSec(next.monitorIntervalSec);
        
        setSettings(next);
        if (socketRef.current) socketRef.current.emit('host-settings', next);
        window.electronAPI?.saveSettings?.(next);
    };

    useEffect(() => {
        let disposed = false;

        const setupSocket = async () => {
            let auth;
            try {
                auth = await prepareSocketAuth();
            } catch (err) {
                console.error('[identity] init failed:', err);
                if (!disposed) {
                    setIdentityError(err?.message || String(err));
                    setRoleAssigned(false);
                }
                return;
            }
            if (disposed) return;

            socketRef.current = auth ? window.io({ auth }) : window.io();
            if (auth) cleanupSensitiveIdentityQuery();
            window.socketRef = socketRef;

            socketRef.current.on('identity-rejected', (data) => {
                const msg = data?.message || data?.code || 'Identity verification failed';
                setIdentityError(msg);
                setRoleAssigned(false);
            });

            socketRef.current.on('role-assigned', (data) => {
                setIdentityError('');
                setIsHost(data.role === 'host');
                let catalog = data.courseCatalog || [];
                if (!Array.isArray(catalog) && catalog.courses) {
                    catalog = catalog;
                } else if (Array.isArray(catalog) && !catalog.folders) {
                    catalog = { courses: catalog, folders: data.folders || [] };
                }
                setCourseCatalog(catalog);
                courseCatalogRef.current = catalog;
                setCurrentCourseId(data.currentCourseId);
                setRoleAssigned(true);

                if (data.role !== 'host') {
                    setStudentInfo({
                        ip: data.clientIp || '',
                        name: data.studentInfo?.name || '',
                        studentId: data.studentInfo?.studentId || ''
                    });
                }

                if (data.role !== 'host' && data.hostSettings) {
                    setSettings(prev => {
                        const next = { ...prev, ...data.hostSettings };
                        next.monitorIntervalSec = clampMonitorIntervalSec(next.monitorIntervalSec);
                        return next;
                    });
                    const fs = data.hostSettings?.forceFullscreen ?? true;
                    window.electronAPI?.setFullscreen(fs);
                }

                if (data.currentCourseId) {
                    setInitialSlideIndex(data.currentSlideIndex || 0);
                    setCurrentSlide(data.currentSlideIndex || 0);
                    loadCourse(data.currentCourseId, catalog);
                    if (data.role !== 'host') {
                        const fs = data.hostSettings?.forceFullscreen ?? true;
                        window.electronAPI?.classStarted({ forceFullscreen: fs });
                    }
                }

                if (data.role === 'host') {
                    socketRef.current.emit('get-student-count');
                    socketRef.current.emit('host-settings', settingsRef.current);
                    if (!studentCountPollRef.current) {
                        studentCountPollRef.current = setInterval(() => {
                            try {
                                if (socketRef.current && socketRef.current.connected) {
                                    socketRef.current.emit('get-student-count');
                                }
                            } catch (_) {}
                        }, 3000);
                    }
                } else {
                    if (studentCountPollRef.current) {
                        clearInterval(studentCountPollRef.current);
                        studentCountPollRef.current = null;
                    }
                }
            });

            socketRef.current.on('student-status', (data) => { setStudentCount(data.count); });

            socketRef.current.on('host-settings', (s) => {
                setSettings(prev => {
                    const next = { ...prev, ...s };
                    next.monitorIntervalSec = clampMonitorIntervalSec(next.monitorIntervalSec);
                    window.electronAPI?.setFullscreen(next.forceFullscreen);
                    return next;
                });
            });

            socketRef.current.on('set-admin-password', (data) => {
                window.electronAPI?.setAdminPassword?.(data.hash);
            });

            socketRef.current.on('course-changed', (data) => {
                if (data.courseId && data.courseId === activeCourseIdRef.current) {
                    return;
                }
                activeCourseIdRef.current = data.courseId;
                setCurrentCourseId(data.courseId);
                setInitialSlideIndex(data.slideIndex || 0);
                setCurrentSlide(data.slideIndex || 0);
                loadCourse(data.courseId, courseCatalogRef.current);
                const fs = data.hostSettings?.forceFullscreen ?? true;
                if (data.hostSettings) {
                    setSettings(prev => {
                        const next = { ...prev, ...data.hostSettings };
                        next.monitorIntervalSec = clampMonitorIntervalSec(next.monitorIntervalSec);
                        return next;
                    });
                }
                window.electronAPI?.classStarted({ forceFullscreen: fs });
            });

            socketRef.current.on('course-ended', () => {
                activeCourseIdRef.current = null;
                setCurrentCourseId(null);
                setCurrentCourseData(null);
                setCurrentSlide(0);
                setStudentScreenshots({});
                window.CourseData = null;
                window.CameraManager?.release?.();
                if (window._onCamActive) window._onCamActive(false);
                window.electronAPI?.classEnded();
            });

            socketRef.current.on('course-catalog-updated', (data) => {
                let catalog = data.courses || [];
                if (!Array.isArray(catalog) && catalog.courses) {
                    catalog = catalog;
                } else if (Array.isArray(catalog) && !catalog.folders) {
                    catalog = { courses: catalog, folders: data.folders || [] };
                }
                setCourseCatalog(catalog);
                courseCatalogRef.current = catalog;
            });

            socketRef.current.on('student-log-entry', (entry) => {
                setSharedStudentLog(prev => [...prev, entry].slice(-500));
            });

            socketRef.current.on('student:screenshot', (payload) => {
                if (!payload?.ip || !payload?.dataUrl) return;
                setStudentScreenshots(prev => ({ ...prev, [payload.ip]: payload }));
            });

            socketRef.current.on('student:screenshot:state', (data) => {
                const next = {};
                for (const item of (data?.screenshots || [])) {
                    if (item?.ip && item?.dataUrl) next[item.ip] = item;
                }
                setStudentScreenshots(next);
            });

            socketRef.current.on('student:screenshot:clear', (data) => {
                const ip = data?.ip;
                if (!ip) return;
                setStudentScreenshots(prev => {
                    const next = { ...prev };
                    delete next[ip];
                    return next;
                });
            });

            socketRef.current.on('student:screenshot:reset', () => {
                setStudentScreenshots({});
            });

            fetch('/api/student-log').then(r => r.json()).then(d => {
                setSharedStudentLog(d.log || []);
            }).catch(() => {});

            // 批注：接收服务端广播的笔画（教师自己发出后服务端会回广播）
            socketRef.current.on('annotation:stroke', (data) => {
                if (!data?.courseId) return;
                const key = annoKey(data.courseId, data.slideIndex);
                const arr = annoSegmentsRef.current.get(key) || [];
                const seg = { tool: data.tool, color: data.color, width: data.width, alpha: data.alpha, points: data.points };
                arr.push(seg);
                if (arr.length > 5000) arr.splice(0, arr.length - 5000);
                annoSegmentsRef.current.set(key, arr);
                if (key === annoKey(currentCourseId, currentSlide)) {
                    requestAnimationFrame(() => renderAnnoForCurrent());
                }
            });
            socketRef.current.on('annotation:clear', (data) => {
                if (!data?.courseId) return;
                const key = annoKey(data.courseId, data.slideIndex);
                annoSegmentsRef.current.set(key, []);
                if (key === annoKey(currentCourseId, currentSlide)) {
                    requestAnimationFrame(() => renderAnnoForCurrent());
                }
            });
            socketRef.current.on('annotation:state', (data) => {
                if (!data?.courseId) return;
                const key = annoKey(data.courseId, data.slideIndex);
                annoSegmentsRef.current.set(key, Array.isArray(data.segments) ? data.segments : []);
                if (key === annoKey(currentCourseId, currentSlide)) {
                    requestAnimationFrame(() => renderAnnoForCurrent());
                }
            });
        };

        setupSocket();

        return () => {
            disposed = true;
            if (studentCountPollRef.current) {
                clearInterval(studentCountPollRef.current);
                studentCountPollRef.current = null;
            }
            if (socketRef.current) socketRef.current.disconnect();
        };
    }, []);

    const loadCourse = async (courseId, catalog) => {
        let courseList = catalog || courseCatalogRef.current;
        if (courseList && !Array.isArray(courseList) && courseList.courses) {
            courseList = courseList.courses;
        }
        const course = (courseList || []).find(c => c.id === courseId);
        if (!course) {
            console.error('[TeacherApp] course not found: ' + courseId);
            return;
        }

        setIsLoading(true);
        setCourseError(null);
        setLoadingProgress({
            currentStep: '准备加载',
            currentFile: course.file,
            progress: 5,
            totalSteps: 3,
            currentStepIndex: 1
        });

        try {
            const engine = await ensureRenderEngineLoaded();
            const data = await engine.loadCourse(course, {
                socket: socketRef.current,
                onProgress: (patch) => setLoadingProgress(prev => ({ ...prev, ...patch }))
            });
            setCurrentCourseData(data);
        } catch (err) {
            console.error('[TeacherApp] load course failed:', err);
            setCourseError(err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRefreshCourses = () => {
        if (socketRef.current) socketRef.current.emit('refresh-courses');
    };

    const handleStartCourse = (courseId, catalog) => {
        if (!courseId) return;
        const nextCatalog = catalog || courseCatalogRef.current;
        let courseList = nextCatalog;
        if (courseList && !Array.isArray(courseList) && courseList.courses) {
            courseList = courseList.courses;
        }
        if (!(courseList || []).some(c => c.id === courseId)) {
            console.error('[TeacherApp] cannot start missing course: ' + courseId);
            return;
        }
        if (nextCatalog) {
            setCourseCatalog(nextCatalog);
            courseCatalogRef.current = nextCatalog;
        }
        activeCourseIdRef.current = courseId;
        setCurrentCourseId(courseId);
        setInitialSlideIndex(0);
        setCurrentSlide(0);
        loadCourse(courseId, nextCatalog);
        if (socketRef.current?.connected) {
            socketRef.current.emit('select-course', { courseId });
        }
    };

    const handleEndCourse = () => {
        activeCourseIdRef.current = null;
        setCurrentCourseId(null);
        setCurrentCourseData(null);
        setCourseError(null);
        setCurrentSlide(0);
        window.CourseData = null;
        window.CameraManager?.release?.();
        if (window._onCamActive) window._onCamActive(false);
        window.electronAPI?.classEnded?.();
        if (socketRef.current && isHost) socketRef.current.emit('end-course');
    };

    const goToSlide = (index) => {
        if (!currentCourseData || !Array.isArray(currentCourseData.slides)) return;
        if (index < 0 || index >= currentCourseData.slides.length) return;
        if (window.CameraManager && window.CameraManager.isActive()) {
            window.CameraManager.release();
        }
        if (window._onCamActive) window._onCamActive(false);
        setCurrentSlide(index);
        if (socketRef.current) socketRef.current.emit('sync-slide', { slideIndex: index });
    };

    const toggleInteractionSync = () => {
        const newSync = !(settings && settings.syncInteraction === true);
        handleSettingsChange({
            syncInteraction: newSync,
            allowInteract: !newSync
        });
    };

    const handleTitlebarMouseDown = (event) => {
        window.__LumeSyncStartWindowDrag?.(event);
    };

    const handleTitlebarDoubleClick = (event) => {
        if (event.button !== 0) return;
        if (event.target?.closest?.('[data-window-control="true"]')) return;
        window.electronAPI?.maximizeWindow?.();
    };

    if (identityError) {
        return (
            <div className="teacher-shell-page flex h-full items-center justify-center select-none px-8" onMouseDown={handleTitlebarMouseDown}>
                <div className="teacher-glass-dark teacher-glass-enter max-w-2xl rounded-[32px] p-10 text-center">
                    <i className="fas fa-circle-exclamation text-5xl text-rose-300 mb-6"></i>
                    <h2 className="text-2xl tracking-widest font-black">身份验证失败</h2>
                    <p className="text-slate-300 mt-3 text-center break-all">{identityError}</p>
                </div>
            </div>
        );
    }

    if (!roleAssigned) {
        return (
            <div className="teacher-shell-page flex h-full items-center justify-center select-none" onMouseDown={handleTitlebarMouseDown}>
                <div className="teacher-glass-dark teacher-glass-enter rounded-[32px] px-12 py-10 text-center">
                    <i className="fas fa-network-wired fa-fade text-5xl text-sky-300 mb-6"></i>
                    <h2 className="text-2xl tracking-widest font-black">正在连接课堂服务器...</h2>
                    <p className="text-slate-400 mt-2">正在验证身份并分配权限...</p>
                </div>
            </div>
        );
    }

    if (isStandaloneClassroomWindow && isHost) {
        return (
            <ClassroomView
                standalone={true}
                onClose={() => {
                    if (window.electronAPI?.closeWindow) {
                        window.electronAPI.closeWindow();
                        return;
                    }
                    window.close();
                }}
                socket={socketRef.current}
                studentLog={sharedStudentLog}
                studentScreenshots={studentScreenshots}
                monitorEnabled={!!settings?.monitorEnabled}
                monitorIntervalSec={clampMonitorIntervalSec(settings?.monitorIntervalSec)}
                podiumAtTop={settings && settings.podiumAtTop}
                onPodiumAtTopChange={(v) => handleSettingsChange('podiumAtTop', !!v)}
            />
        );
    }

    if (isHost && !currentCourseId) {
        return (
            <CourseSelector
                courses={courseCatalog}
                currentCourseId={currentCourseId}
                onSelectCourse={handleStartCourse}
                onRefresh={handleRefreshCourses}
                socket={socketRef.current}
                settings={settings}
                onSettingsChange={handleSettingsChange}
                studentCount={studentCount}
                studentLog={sharedStudentLog}
            />
        );
    }

    if (!isHost && !currentCourseId) {
        return <StudentWaitingRoom forceFullscreen={settings.forceFullscreen} />;
    }

    if (isLoading) {
        return (
            <div className="teacher-shell-page flex h-full items-center justify-center select-none px-8" onMouseDown={handleTitlebarMouseDown}>
                <div className="teacher-glass-dark teacher-glass-enter flex w-full max-w-xl flex-col items-center rounded-[34px] px-10 py-12 text-white">
                <i className="fas fa-layer-group fa-bounce text-6xl text-sky-300 mb-8"></i>

                <h2 className="text-3xl tracking-widest font-bold mb-3">正在加载课件内容...</h2>

                {/* 进度条 */}
                <div className="w-80 h-2 bg-white/10 rounded-full overflow-hidden mb-4">
                    <div
                        className="h-full bg-gradient-to-r from-sky-300 to-emerald-300 transition-all duration-300 ease-out"
                        style={{ width: `${loadingProgress.progress}%` }}
                    ></div>
                </div>

                {/* 当前步骤和文件 */}
                <div className="text-center space-y-2">
                    <p className="text-lg text-slate-200 font-medium">
                        {loadingProgress.currentStep}
                    </p>
                    {loadingProgress.currentFile && (
                        <p className="text-sm text-slate-400 font-mono flex items-center justify-center">
                            <i className="fas fa-file-code mr-2 text-yellow-400"></i>
                            {loadingProgress.currentFile}
                        </p>
                    )}
                </div>

                {/* 步骤进度 */}
                <div className="mt-6 text-sm text-slate-500">
                    步骤 {loadingProgress.currentStepIndex} / {loadingProgress.totalSteps}
                </div>

                <p className="text-slate-400 mt-4 text-sm flex items-center">
                    <i className="fas fa-bolt text-yellow-400 mr-2"></i> 请稍候，正在准备课堂环境
                </p>
                </div>
            </div>
        );
    }

    if (courseError && !currentCourseData) {
        const errorText = courseError.message || String(courseError);
        const handleCopy = () => {
            navigator.clipboard.writeText(errorText).then(() => {
                setCopyDone(true);
                setTimeout(() => setCopyDone(false), 2000);
            });
        };
        return (
            <div className="teacher-shell-page flex h-full flex-col items-center justify-center text-white select-none p-8" onMouseDown={handleTitlebarMouseDown}>
                <div className="teacher-glass-dark teacher-glass-enter w-full max-w-3xl rounded-[34px] p-8 text-center">
                <i className="fas fa-circle-exclamation text-5xl text-rose-300 mb-6"></i>
                <h2 className="text-2xl font-black mb-2">课件加载失败</h2>
                {isHost ? (
                    <div className="mt-4 w-full max-w-2xl">
                        <div className="bg-red-950/50 border border-red-300/20 rounded-3xl p-6 text-left backdrop-blur-xl">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-red-300 font-bold flex items-center"><i className="fas fa-bug mr-2"></i> 错误详情</p>
                                <button onClick={handleCopy} className={`teacher-liquid-button flex items-center px-3 py-1 rounded-xl text-xs font-bold ${copyDone ? 'text-emerald-200' : 'text-red-200'}`}>
                                    <i className={`fas ${copyDone ? 'fa-check' : 'fa-copy'} mr-1.5`}></i>
                                    {copyDone ? '已复制' : '复制'}
                                </button>
                            </div>
                            <pre className="text-red-200 text-sm font-mono whitespace-pre-wrap break-all leading-relaxed">{errorText}</pre>
                        </div>
                        <button onClick={handleEndCourse} className="teacher-liquid-button mt-6 px-6 py-3 rounded-2xl font-bold">
                            <i className="fas fa-arrow-left mr-2"></i> 返回课件选择
                        </button>
                    </div>
                ) : (
                    <p className="text-slate-400 mt-2">请等待老师重新加载课件</p>
                )}
                </div>
            </div>
        );
    }

    if (!currentCourseData) {
        return (
            <div className="teacher-shell-page flex h-full items-center justify-center text-white select-none px-8" onMouseDown={handleTitlebarMouseDown}>
                <div className="teacher-glass-dark teacher-glass-enter rounded-[34px] px-12 py-10 text-center">
                    <i className="fas fa-layer-group fa-bounce text-6xl text-sky-300 mb-8"></i>
                    <h2 className="text-3xl tracking-widest font-bold mb-3">正在加载课件内容...</h2>
                    <p className="text-slate-400 mt-4 text-sm flex items-center">
                        <i className="fas fa-bolt text-yellow-400 mr-2"></i> 请稍候，正在准备课堂环境
                    </p>
                </div>
            </div>
        );
    }

    return (
        <window.LumeSyncRenderEngine.CourseErrorBoundary courseId={currentCourseId} onEndCourse={isHost ? handleEndCourse : null}>
            <div ref={shellPageRef} className="teacher-shell-page h-full overflow-hidden font-sans select-none relative">
                <div
                    className="teacher-floating-topbar teacher-glass-dark teacher-glass-enter flex items-center justify-between"
                    style={{WebkitAppRegion:'drag'}}
                    onMouseDown={handleTitlebarMouseDown}
                    onDoubleClick={handleTitlebarDoubleClick}
                >
                    <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <i className="fas fa-microchip text-sky-200 text-2xl md:text-3xl"></i>
                        <h1 className="flex-1 min-w-0 text-lg md:text-2xl font-bold text-white tracking-wide truncate">{currentCourseData.title}</h1>
                        <button
                            onClick={() => window.__LumeSyncOpenClassroomWindow?.()}
                            className="px-3 py-1 text-xs md:text-sm font-bold rounded-full border bg-sky-300/15 text-sky-100 border-sky-200/30 flex items-center shadow-inner hover:bg-sky-300/25 transition-colors"
                            title="点击查看机房视图"
                            style={{WebkitAppRegion:'no-drag'}}
                            data-window-control="true"
                        >
                            <span className="relative flex h-2 w-2 mr-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                            </span>
                            在线学生: {studentCount}
                        </button>
                    </div>
                    <div className="flex items-center space-x-3 md:space-x-4" style={{WebkitAppRegion:'no-drag'}} data-window-control="true">
                        <button onClick={handleEndCourse} className="teacher-liquid-danger flex items-center px-3 py-2 rounded-2xl text-sm font-bold" title="结束课件">
                            <i className="fas fa-stop"></i>
                        </button>
                        <button onClick={() => setShowSettings(v => !v)} className="teacher-liquid-button flex items-center px-3 py-2 rounded-2xl text-sm font-bold" title="课堂设置">
                            <i className="fas fa-gear"></i>
                        </button>
                        <button onClick={() => setShowLog(v => !v)} className="teacher-liquid-button flex items-center px-3 py-2 rounded-2xl text-sm font-bold relative" title="学生日志">
                            <i className="fas fa-list-ul"></i>
                            {sharedStudentLog.length > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                                    {sharedStudentLog.length > 99 ? '99' : sharedStudentLog.length}
                                </span>
                            )}
                        </button>
                        <WindowControls />
                    </div>
                </div>

                <div ref={teacherStageHostRef} className="teacher-course-stage">
                    <window.LumeSyncRenderEngine.CourseStage
                        courseId={currentCourseId}
                        title={currentCourseData.title}
                        slides={currentCourseData.slides}
                        socket={socketRef.current}
                        isHost={isHost}
                        initialSlide={initialSlideIndex}
                        currentSlide={currentSlide}
                        onSlideChange={(index) => setCurrentSlide(index)}
                        settings={settings}
                        onSettingsChange={handleSettingsChange}
                        studentCount={studentCount}
                        studentLog={sharedStudentLog}
                        studentInfo={studentInfo}
                        renderChrome={false}
                        renderTeacherOverlays={false}
                        hideTopBar={true}
                        hideBottomBar={true}
                    />
                </div>

                {/* 批注画布：覆盖在课件上方，inset 与 teacher-course-stage 的 padding 对齐 */}
                {isHost && (
                    <canvas
                        ref={annoCanvasRef}
                        className="absolute z-[9980]"
                        style={{
                            ...annoCanvasBoxStyle,
                            display: 'block',
                            pointerEvents: annotateEnabled ? 'auto' : 'none',
                            touchAction: 'none',
                            cursor: annotateEnabled ? (annoTool === 'eraser' ? 'cell' : 'crosshair') : 'default',
                            borderRadius: '24px',
                        }}
                        onPointerDown={handleAnnoPointerDown}
                        onPointerMove={handleAnnoPointerMove}
                        onPointerUp={() => stopAnnoDrawing()}
                        onPointerCancel={() => stopAnnoDrawing()}
                        onPointerLeave={() => stopAnnoDrawing()}
                        onMouseDown={handleAnnoMouseDown}
                        onMouseMove={handleAnnoMouseMove}
                        onMouseUp={handleAnnoMouseUp}
                        onMouseLeave={handleAnnoMouseUp}
                    />
                )}

                {/* 批注工具栏 */}
                {isHost && (
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 z-[9991] flex flex-col gap-2">
                        {[
                            { icon: 'fa-pen', title: '开启/关闭批注', active: annotateEnabled, onClick: () => setAnnotateEnabled(v => !v) },
                            { icon: 'fa-grip-lines', title: '画笔粗细', active: annoPopupType === 'width', onClick: () => { setAnnotateEnabled(true); setAnnoPopupType(v => v === 'width' ? null : 'width'); } },
                            { icon: 'fa-palette', title: '画笔颜色', active: annoPopupType === 'color', onClick: () => { setAnnotateEnabled(true); setAnnoPopupType(v => v === 'color' ? null : 'color'); } },
                            { icon: 'fa-trash-can', title: '清空本页', active: false, onClick: handleClearAnno },
                            { icon: 'fa-xmark', title: '退出批注', active: false, danger: true, onClick: () => { stopAnnoDrawing(); setAnnotateEnabled(false); setAnnoPopupType(null); } },
                        ].map((btn) => (
                            <button
                                key={btn.icon}
                                title={btn.title}
                                onClick={btn.onClick}
                                className={`w-9 h-9 rounded-xl text-sm flex items-center justify-center transition-colors ${
                                    btn.danger ? 'bg-red-700/80 hover:bg-red-600 text-white' :
                                    btn.active ? 'bg-blue-500 text-white' :
                                    'bg-slate-700 hover:bg-slate-600 text-white'
                                }`}
                            >
                                <i className={`fas ${btn.icon}`}></i>
                            </button>
                        ))}

                        {/* 粗细弹出 */}
                        {annoPopupType === 'width' && (
                            <div className="absolute left-12 top-8 w-52 bg-white/90 backdrop-blur-xl border border-slate-200 rounded-2xl p-3 shadow-xl z-10">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-slate-600 font-bold text-sm">粗细</span>
                                    <span className="text-slate-500 font-mono text-xs bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg">{annoWidth}px</span>
                                </div>
                                <input type="range" min="2" max="20" value={annoWidth} onChange={e => setAnnoWidth(Number(e.target.value))} className="w-full" />
                                <div className="mt-2 flex gap-2 flex-wrap">
                                    {['pen','marker','highlighter','eraser'].map(t => (
                                        <button key={t} onClick={() => setAnnoTool(t)} className={`px-2 py-1 rounded-lg text-xs font-bold border transition-colors ${annoTool === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'}`}>
                                            {t === 'pen' ? '钢笔' : t === 'marker' ? '记号笔' : t === 'highlighter' ? '荧光笔' : '橡皮'}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* 颜色弹出 */}
                        {annoPopupType === 'color' && (
                            <div className="absolute left-12 top-16 w-52 bg-white/90 backdrop-blur-xl border border-slate-200 rounded-2xl p-3 shadow-xl z-10">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-slate-600 font-bold text-sm">颜色</span>
                                    <input type="color" value={annoColor} disabled={annoTool === 'eraser'} onChange={e => setAnnoColor(e.target.value)} className={`w-10 h-7 p-0 border-0 bg-transparent ${annoTool === 'eraser' ? 'opacity-40 cursor-not-allowed' : ''}`} />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {['#ef4444','#f97316','#facc15','#22c55e','#3b82f6','#a855f7','#0f172a','#ffffff'].map(c => (
                                        <button key={c} onClick={() => setAnnoColor(c)} disabled={annoTool === 'eraser'} className={`w-7 h-7 rounded-full border transition-all ${annoTool === 'eraser' ? 'opacity-40 cursor-not-allowed border-slate-200' : (annoColor.toLowerCase() === c.toLowerCase() ? 'border-blue-600 ring-2 ring-blue-300' : 'border-slate-200 hover:border-slate-300')}`} style={{ background: c }} />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {annotateEnabled && isHost && (
                    <div className="absolute top-16 left-1/2 -translate-x-1/2 z-[9992] px-3 py-1.5 rounded-xl bg-blue-600/90 text-white text-xs font-bold border border-blue-300 shadow-lg backdrop-blur-sm pointer-events-none">
                        标注模式：拖动绘制
                    </div>
                )}

                <div className="teacher-floating-dock teacher-glass-light teacher-glass-enter flex items-center gap-4">
                    <button onClick={() => goToSlide(currentSlide - 1)} disabled={currentSlide === 0} className={`flex items-center px-4 md:px-6 py-2 md:py-2.5 rounded-2xl font-bold text-base md:text-lg transition-all ${currentSlide === 0 ? 'text-slate-400 bg-white/30 cursor-not-allowed' : 'teacher-liquid-primary hover:-translate-x-1'}`}>
                        <i className="fas fa-chevron-left mr-2"></i>上一页
                    </button>
                    <div className="flex items-center gap-3 relative">
                        <span className="text-slate-100 font-black text-base md:text-lg tracking-widest bg-white/12 px-4 md:px-6 py-1 md:py-2 rounded-full shadow-inner border border-white/20">
                            {currentSlide + 1} / {currentCourseData.slides.length}
                        </span>
                        <button
                            onClick={toggleInteractionSync}
                            className={`flex items-center px-4 md:px-5 py-2 md:py-2.5 rounded-2xl font-bold text-base md:text-lg transition-all border ${
                                (settings && settings.syncInteraction === true)
                                    ? 'bg-amber-400/90 text-white border-white/40 shadow-lg'
                                    : 'teacher-liquid-button text-slate-100'
                            }`}
                            title={(settings && settings.syncInteraction === true) ? '已开启交互同步（点击关闭）' : '开启教师交互同步（学生端同步所有操作）'}
                        >
                            <i className={`fas ${(settings && settings.syncInteraction === true) ? 'fa-sync' : 'fa-rotate'} mr-2`}></i>
                            {(settings && settings.syncInteraction === true) ? '同步交互' : '开启同步'}
                        </button>
                    </div>
                    <button onClick={() => goToSlide(currentSlide + 1)} disabled={currentSlide === currentCourseData.slides.length - 1} className={`flex items-center px-4 md:px-6 py-2 md:py-2.5 rounded-2xl font-bold text-base md:text-lg transition-all ${currentSlide === currentCourseData.slides.length - 1 ? 'text-slate-400 bg-white/30 cursor-not-allowed' : 'teacher-liquid-primary hover:translate-x-1'}`}>
                        下一页<i className="fas fa-chevron-right ml-2"></i>
                    </button>
                </div>

                {showLog && (
                    <div className={`fixed inset-0 ${getTeacherLayerClass('drawer')} flex justify-end bg-black/20 backdrop-blur-sm`} onClick={() => setShowLog(false)}>
                        <div className="teacher-glass-drawer w-96 h-full flex flex-col" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 shrink-0">
                                <h3 className="font-bold text-white text-lg flex items-center">
                                    <i className="fas fa-list-ul mr-2 text-sky-300"></i> 学生操作日志
                                </h3>
                                <button onClick={() => setShowLog(false)} className="text-slate-300 hover:text-white"><i className="fas fa-xmark text-xl"></i></button>
                            </div>
                            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1.5 text-sm">
                                {sharedStudentLog.length === 0 ? (
                                    <div className="text-center text-slate-400 mt-16">
                                        <i className="fas fa-inbox text-3xl mb-3 block"></i>暂无记录
                                    </div>
                                ) : (
                                    [...sharedStudentLog].reverse().map((entry, i) => {
                                        const timeStr = new Date(entry.time).toLocaleTimeString('zh-CN', { hour12: false });
                                        const configs = {
                                            'join':            { icon: 'fa-user-plus',  color: 'text-green-600',  bg: 'bg-green-50',  label: '上线' },
                                            'leave':           { icon: 'fa-user-minus', color: 'text-slate-500',  bg: 'bg-slate-50',  label: '离线' },
                                            'fullscreen-exit': { icon: 'fa-compress',   color: 'text-orange-500', bg: 'bg-orange-50', label: '退出全屏' },
                                            'tab-hidden':      { icon: 'fa-eye-slash',  color: 'text-red-500',    bg: 'bg-red-50',    label: '切换页面' },
                                        };
                                        const cfg = configs[entry.type] || { icon: 'fa-circle-info', color: 'text-blue-500', bg: 'bg-blue-50', label: entry.type };
                                        return (
                                            <div key={i} className={`flex items-center space-x-3 px-3 py-2 rounded-lg ${cfg.bg}`}>
                                                <i className={`fas ${cfg.icon} ${cfg.color} w-4 shrink-0`}></i>
                                                <span className={`font-bold ${cfg.color} w-16 shrink-0`}>{cfg.label}</span>
                                                <span className="text-slate-600 font-mono text-xs flex-1 truncate">{entry.ip}</span>
                                                <span className="text-slate-400 text-xs shrink-0">{timeStr}</span>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {showSettings && (
                    <SettingsPanel settings={settings} onSettingsChange={handleSettingsChange} socket={socketRef.current} onClose={() => setShowSettings(false)} zIndex={getTeacherLayerClass('drawer')} />
                )}
            </div>
        </window.LumeSyncRenderEngine.CourseErrorBoundary>
    );
}

const bootEngine = async () => {
    let rootElement = document.getElementById('root');
    let domRetries = 50;
    while (!rootElement && domRetries > 0) {
        await new Promise(r => setTimeout(r, 50));
        rootElement = document.getElementById('root');
        domRetries--;
    }
    if (!rootElement) return;

    ensureTeacherShellStyles();

    const root = ReactDOM.createRoot(rootElement);
    console.log('[TeacherApp] starting with core render engine...');
    root.render(<ClassroomApp />);
};

bootEngine();
