// ========================================================
// 机房视图组件（教师端）
// 功能：显示所有学生座位，支持命名、拖拽排列、在线状态
// 布局和命名持久化到 localStorage，支持多个班级（表）
// ========================================================
function ClassroomView({ onClose, socket, studentLog, studentScreenshots = {}, monitorEnabled = false, monitorIntervalSec = 1, podiumAtTop, onPodiumAtTopChange, standalone = false }) {
    const STORAGE_KEY = 'classroom-layouts-v1';
    const podiumOnTop = typeof podiumAtTop === 'boolean' ? podiumAtTop : true;
    const SEAT_CARD_WIDTH = 190;
    const SEAT_CARD_HEIGHT = Math.round(SEAT_CARD_WIDTH * 9 / 16);
    const SEAT_CARD_GAP = 20;
    const CANVAS_PADDING = 36;

    // 多班级状态管理
    const [classrooms, setClassrooms] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            // 兼容旧版本数据（如果存在单个表）
            const oldLayout = JSON.parse(localStorage.getItem('classroom-layout-v1') || '[]');
            if (oldLayout.length > 0 && Object.keys(saved).length === 0) {
                // 迁移旧数据到默认班级
                return {
                    'default': {
                        name: '默认班级',
                        seats: oldLayout.map(s => ({ ...s, ip: s.ip && s.ip.startsWith('::ffff:') ? s.ip.slice(7) : s.ip })),
                        podiumAtTop: true
                    }
                };
            }
            return saved;
        } catch(e) { return {}; }
    });
    const [currentClassroomId, setCurrentClassroomId] = useState(() => {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            const lastUsed = localStorage.getItem('classroom-last-used');
            if (lastUsed && saved[lastUsed]) return lastUsed;
            return Object.keys(saved)[0] || 'default';
        } catch(e) { return 'default'; }
    });
    const [showClassroomMenu, setShowClassroomMenu] = useState(false);
    const [showAddClassroom, setShowAddClassroom] = useState(false);
    const [newClassName, setNewClassName] = useState('');
    const classroomMenuRef = useRef(null);
    const classroomMenuPopupRef = useRef(null);

    // 当前班级数据
    const currentClassroom = classrooms[currentClassroomId] || { name: '默认班级', seats: [], podiumAtTop: true };
    const [seats, setSeats] = useState(currentClassroom.seats || []);
    const [currentPodiumTop, setCurrentPodiumTop] = useState(currentClassroom.podiumAtTop !== undefined ? currentClassroom.podiumAtTop : podiumOnTop);

    // 当切换班级或更新数据时，同步状态
    useEffect(() => {
        const classroom = classrooms[currentClassroomId];
        if (classroom) {
            setSeats((classroom.seats || []).map(withSeatCanvasPosition));
            setCurrentPodiumTop(classroom.podiumAtTop !== undefined ? classroom.podiumAtTop : podiumOnTop);
        }
    }, [currentClassroomId, classrooms]);

    const [onlineIPs, setOnlineIPs] = useState([]);
    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [editStudentId, setEditStudentId] = useState('');
    const [dragId, setDragId] = useState(null);
    const [dragPreviewPos, setDragPreviewPos] = useState(null);
    const [addRow, setAddRow] = useState(1);
    const [addCol, setAddCol] = useState(1);
    const [addIp, setAddIp] = useState('');
    const [addName, setAddName] = useState('');
    const [addStudentId, setAddStudentId] = useState('');
    const [addMac, setAddMac] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [autoImporting, setAutoImporting] = useState(false);
    const [viewMode, setViewMode] = useState('grid');
    const [importError, setImportError] = useState(null);
    const [showMoreMenu, setShowMoreMenu] = useState(false);
    const [previewSeat, setPreviewSeat] = useState(null);
    const [detailSeat, setDetailSeat] = useState(null);
    const [selectedSeatIds, setSelectedSeatIds] = useState([]);
    const [powerMenu, setPowerMenu] = useState(null);
    const [selectionBox, setSelectionBox] = useState(null);
    const fileInputRef = useRef(null);
    const moreMenuRef = useRef(null);
    const moreMenuPopupRef = useRef(null);
    const powerMenuPopupRef = useRef(null);
    const seatCanvasViewportRef = useRef(null);
    const seatCanvasRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (
                moreMenuRef.current
                && !moreMenuRef.current.contains(e.target)
                && !moreMenuPopupRef.current?.contains(e.target)
            ) {
                setShowMoreMenu(false);
            }
            if (
                classroomMenuRef.current
                && !classroomMenuRef.current.contains(e.target)
                && !classroomMenuPopupRef.current?.contains(e.target)
            ) {
                setShowClassroomMenu(false);
            }
            if (powerMenuPopupRef.current && !powerMenuPopupRef.current.contains(e.target)) {
                setPowerMenu(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const maxRow = seats.reduce((m, s) => Math.max(m, s.row), 0);
    const maxCol = seats.reduce((m, s) => Math.max(m, s.col), 0);
    const layoutCols = Math.max(maxCol, 6);
    const GRID_SNAP_THRESHOLD = 16;

    const rowColToCanvasPos = (row, col) => {
        const safeRow = Math.max(1, Number(row) || 1);
        const safeCol = Math.max(1, Number(col) || 1);
        return {
            x: CANVAS_PADDING + (safeCol - 1) * (SEAT_CARD_WIDTH + SEAT_CARD_GAP),
            y: CANVAS_PADDING + (safeRow - 1) * (SEAT_CARD_HEIGHT + SEAT_CARD_GAP)
        };
    };
    const canvasPosToRowCol = (x, y) => ({
        row: Math.max(1, Math.round((Math.max(0, y - CANVAS_PADDING)) / (SEAT_CARD_HEIGHT + SEAT_CARD_GAP)) + 1),
        col: Math.max(1, Math.round((Math.max(0, x - CANVAS_PADDING)) / (SEAT_CARD_WIDTH + SEAT_CARD_GAP)) + 1)
    });
    const getSnappedCanvasPos = (x, y) => {
        const grid = canvasPosToRowCol(x, y);
        const snapped = rowColToCanvasPos(grid.row, grid.col);
        const dx = Math.abs(snapped.x - x);
        const dy = Math.abs(snapped.y - y);
        if (dx <= GRID_SNAP_THRESHOLD) x = snapped.x;
        if (dy <= GRID_SNAP_THRESHOLD) y = snapped.y;
        return { x, y, row: grid.row, col: grid.col, snappedX: dx <= GRID_SNAP_THRESHOLD, snappedY: dy <= GRID_SNAP_THRESHOLD };
    };
    const getGridOverlayStyle = (active = false) => {
        const majorAlpha = active ? 0.16 : 0.08;
        const minorAlpha = active ? 0.1 : 0.05;
        const majorW = SEAT_CARD_WIDTH + SEAT_CARD_GAP;
        const majorH = SEAT_CARD_HEIGHT + SEAT_CARD_GAP;
        const minorW = Math.max(12, Math.round(majorW / 2));
        const minorH = Math.max(10, Math.round(majorH / 2));
        return {
            backgroundImage: [
                `linear-gradient(to right, rgba(125,211,252,${minorAlpha}) 1px, transparent 1px)`,
                `linear-gradient(to bottom, rgba(125,211,252,${minorAlpha}) 1px, transparent 1px)`,
                `linear-gradient(to right, rgba(125,211,252,${majorAlpha}) 1px, transparent 1px)`,
                `linear-gradient(to bottom, rgba(125,211,252,${majorAlpha}) 1px, transparent 1px)`
            ].join(', '),
            backgroundSize: [
                `${minorW}px ${minorH}px`,
                `${minorW}px ${minorH}px`,
                `${majorW}px ${majorH}px`,
                `${majorW}px ${majorH}px`
            ].join(', '),
            backgroundPosition: [
                `${CANVAS_PADDING}px ${CANVAS_PADDING}px`,
                `${CANVAS_PADDING}px ${CANVAS_PADDING}px`,
                `${CANVAS_PADDING}px ${CANVAS_PADDING}px`,
                `${CANVAS_PADDING}px ${CANVAS_PADDING}px`
            ].join(', ')
        };
    };
    const isSeatSnapped = (seat) => {
        const pos = dragPreviewPos && dragPreviewPos.id === seat.id ? dragPreviewPos : getSeatCanvasPosition(seat);
        const snapped = getSnappedCanvasPos(pos.x, pos.y);
        return snapped.snappedX || snapped.snappedY;
    };
    const getSeatTransitionClass = (dragging) => dragging ? 'transition-none' : 'transition-[transform,box-shadow,border-color,opacity] duration-150';
    const getSeatSnapIndicatorClass = (seat) => isSeatSnapped(seat) ? 'ring-2 ring-sky-300/45' : '';
    const getSeatDragShadowClass = (dragging) => dragging ? 'shadow-[0_24px_48px_rgba(56,189,248,0.22)]' : '';
    const getSeatPreviewPos = (seat) => dragPreviewPos && dragPreviewPos.id === seat.id ? dragPreviewPos : getSeatCanvasPosition(seat);
    const getSeatRenderPos = (seat) => {
        const pos = getSeatPreviewPos(seat);
        return dragId === seat.id ? getSnappedCanvasPos(pos.x, pos.y) : { x: pos.x, y: pos.y };
    };
    const getCanvasMetrics = () => {
        const seatPositions = seats.map(getSeatCanvasPosition);
        const maxX = seatPositions.reduce((m, pos) => Math.max(m, pos.x), CANVAS_PADDING);
        const maxY = seatPositions.reduce((m, pos) => Math.max(m, pos.y), CANVAS_PADDING);
        const canvasWidth = Math.max(
            CANVAS_PADDING * 2 + layoutCols * (SEAT_CARD_WIDTH + SEAT_CARD_GAP),
            maxX + SEAT_CARD_WIDTH + CANVAS_PADDING
        );
        const estimatedRows = Math.max(maxRow, 4);
        const canvasHeight = Math.max(
            CANVAS_PADDING * 2 + estimatedRows * (SEAT_CARD_HEIGHT + SEAT_CARD_GAP),
            maxY + SEAT_CARD_HEIGHT + CANVAS_PADDING
        );
        return { canvasWidth, canvasHeight };
    };
    const getCanvasGuides = () => {
        const { canvasWidth, canvasHeight } = getCanvasMetrics();
        return { canvasWidth, canvasHeight };
    };
    const getCanvasGridClass = () => dragId ? 'opacity-100' : 'opacity-70';
    const getCanvasGridStyle = () => getGridOverlayStyle(Boolean(dragId));
    const getSeatCanvasStyle = (seat) => {
        const pos = getSeatRenderPos(seat);
        return {
            left: `${pos.x}px`,
            top: `${pos.y}px`,
            width: `${SEAT_CARD_WIDTH}px`,
            height: `${SEAT_CARD_HEIGHT}px`
        };
    };
    const getSeatGridCoords = (seat) => {
        const pos = getSeatRenderPos(seat);
        return canvasPosToRowCol(pos.x, pos.y);
    };
    const getSeatCoordLabel = (seat) => {
        const grid = getSeatGridCoords(seat);
        return `${grid.row}-${grid.col}`;
    };
    const getSeatFinalDrop = (x, y) => {
        const snapped = getSnappedCanvasPos(x, y);
        const grid = canvasPosToRowCol(snapped.x, snapped.y);
        return { x: snapped.x, y: snapped.y, row: grid.row, col: grid.col };
    };
    const getSeatPreviewUpdate = (x, y) => {
        const snapped = getSnappedCanvasPos(x, y);
        return { x: snapped.x, y: snapped.y };
    };
    const getCanvasClamp = (canvas) => ({
        maxX: Math.max(0, canvas.clientWidth - SEAT_CARD_WIDTH),
        maxY: Math.max(0, canvas.clientHeight - SEAT_CARD_HEIGHT)
    });
    const clampSeatPos = (x, y, canvas) => {
        const { maxX, maxY } = getCanvasClamp(canvas);
        return {
            x: Math.min(maxX, Math.max(0, x)),
            y: Math.min(maxY, Math.max(0, y))
        };
    };
    const toCanvasPointerPos = (event, canvasRect, viewport) => ({
        x: event.clientX - canvasRect.left + viewport.scrollLeft,
        y: event.clientY - canvasRect.top + viewport.scrollTop
    });
    const toSeatDragPos = (pointer, offsetX, offsetY, canvas) => clampSeatPos(pointer.x - offsetX, pointer.y - offsetY, canvas);
    const getDragMoved = (nextX, nextY, startPos) => Math.abs(nextX - startPos.x) > 2 || Math.abs(nextY - startPos.y) > 2;
    const queueSeatPreviewUpdate = (setPreview, next) => setPreview(next);
    const getSeatDragStart = (seat) => getSeatCanvasPosition(seat);
    const getSeatDragOffset = (pointer, startPos) => ({ offsetX: pointer.x - startPos.x, offsetY: pointer.y - startPos.y });
    const getCanvasScrollPointer = (event, canvasRect, viewport) => toCanvasPointerPos(event, canvasRect, viewport);
    const getSeatMovePoint = (moveEvent, canvasRect, viewport, offsetX, offsetY, canvas) => {
        const pointer = getCanvasScrollPointer(moveEvent, canvasRect, viewport);
        return toSeatDragPos(pointer, offsetX, offsetY, canvas);
    };
    const getSeatDropState = (lastPos) => getSeatFinalDrop(lastPos.x, lastPos.y);
    const getSeatPreviewState = (lastPos) => getSeatPreviewUpdate(lastPos.x, lastPos.y);
    const setSeatPreviewState = (seatId, setPreview, lastPos) => queueSeatPreviewUpdate(setPreview, { id: seatId, ...getSeatPreviewState(lastPos) });
    const getSeatCardGuideClass = (seat) => isSeatSnapped(seat) ? 'before:absolute before:inset-0 before:border before:border-sky-300/35 before:rounded-[20px] before:pointer-events-none' : '';
    const getSeatCanvasPosition = (seat) => {
        if (Number.isFinite(Number(seat?.x)) && Number.isFinite(Number(seat?.y))) {
            return { x: Math.max(0, Number(seat.x)), y: Math.max(0, Number(seat.y)) };
        }
        return rowColToCanvasPos(seat?.row, seat?.col);
    };
    const withSeatCanvasPosition = (seat) => {
        const pos = getSeatCanvasPosition(seat);
        const grid = canvasPosToRowCol(pos.x, pos.y);
        return { ...seat, x: pos.x, y: pos.y, row: grid.row, col: grid.col };
    };

    const saveClassroom = (classroomId, data) => {
        setClassrooms(prev => {
            const updated = {
                ...prev,
                [classroomId]: { ...prev[classroomId], ...data }
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

            fetch('/api/save-classroom-layout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ layout: updated })
            }).then(res => res.json()).then(result => {
                if (!result.success) {
                    console.warn('[ClassroomView] Failed to persist classroom layout:', result.error);
                }
            }).catch(err => {
                console.warn('[ClassroomView] Error persisting classroom layout:', err);
            });

            return updated;
        });
    };

    const saveSeats = (next) => {
        const normalized = next.map(withSeatCanvasPosition);
        setSeats(normalized);
        saveClassroom(currentClassroomId, { seats: normalized });
    };

    const handleTitlebarMouseDown = (event) => {
        if (!standalone) return;
        window.__LumeSyncStartWindowDrag?.(event);
    };

    const handleTitlebarDoubleClick = (event) => {
        if (!standalone) return;
        if (event.button !== 0) return;
        if (event.target?.closest?.('[data-window-control="true"]')) return;
        window.electronAPI?.maximizeWindow?.();
    };

    const normalizeIp = ip => ip && ip.startsWith('::ffff:') ? ip.slice(7) : ip;
    const POWER_MENU_WIDTH = 192;
    const POPUP_VIEWPORT_PADDING = 12;
    const POWER_CONTROL_ACTIONS = [
        { action: 'power-on', label: '\u5f00\u673a', icon: 'fa-power-off', confirmText: '\u786e\u8ba4\u5f00\u673a\u6240\u9009\u5b66\u751f\u673a\uff1f' },
        { action: 'shutdown', label: '\u5173\u673a', icon: 'fa-circle-stop', confirmText: '\u786e\u8ba4\u5173\u95ed\u6240\u9009\u5b66\u751f\u673a\uff1f' },
        { action: 'force-shutdown', label: '\u5f3a\u5236\u5173\u673a', icon: 'fa-power-off', confirmText: '\u786e\u8ba4\u5f3a\u5236\u5173\u95ed\u6240\u9009\u5b66\u751f\u673a\uff1f' },
        { action: 'restart', label: '\u91cd\u542f', icon: 'fa-rotate-right', confirmText: '\u786e\u8ba4\u91cd\u542f\u6240\u9009\u5b66\u751f\u673a\uff1f' },
        { action: 'force-restart', label: '\u5f3a\u5236\u91cd\u542f', icon: 'fa-arrows-rotate', confirmText: '\u786e\u8ba4\u5f3a\u5236\u91cd\u542f\u6240\u9009\u5b66\u751f\u673a\uff1f' },
    ];
    const getSeatMac = (seat) => seat?.mac || seat?.wakeMac || seat?.macAddress || '';
    const getSelectedSeats = () => seats.filter(seat => selectedSeatIds.includes(seat.id));
    const getPowerTargets = (items) => items
        .map(seat => ({ ip: normalizeIp(seat.ip || ''), mac: getSeatMac(seat) }))
        .filter(target => target.ip || target.mac);
    const openPowerMenu = (event, targetSeats) => {
        event.preventDefault();
        event.stopPropagation();
        const ids = targetSeats.map(seat => seat.id);
        setSelectedSeatIds(ids);
        setPowerMenu({ x: event.clientX, y: event.clientY, seatIds: ids });
    };
    const sendPowerControl = (action, targetSeats = getSelectedSeats()) => {
        const targets = getPowerTargets(targetSeats);
        if (!socket || targets.length === 0) return;
        const config = POWER_CONTROL_ACTIONS.find(item => item.action === action);
        const needsMac = action === 'power-on';
        const missingMac = needsMac ? targetSeats.filter(seat => !getSeatMac(seat)).length : 0;
        const suffix = missingMac > 0
            ? `\n\u6709 ${missingMac} \u53f0\u8bbe\u5907\u7f3a\u5c11 MAC \u5730\u5740\uff0c\u5c06\u65e0\u6cd5\u53d1\u9001 Wake-on-LAN \u5f00\u673a\u5305\u3002`
            : '';
        if (!confirm(`${config?.confirmText || '\u786e\u8ba4\u6267\u884c\u64cd\u4f5c\uff1f'}\n\u76ee\u6807\u6570\u91cf\uff1a${targets.length}${suffix}`)) return;
        socket.emit('student:power-control', {
            requestId: `power-${Date.now()}`,
            action,
            targets
        });
        setPowerMenu(null);
    };
    const openPowerMenuForSeats = (event, targetSeats) => {
        openPowerMenu(event, targetSeats.filter(Boolean));
    };
    const openSeatDetail = (seat) => {
        setDetailSeat(seat || null);
        setPowerMenu(null);
    };
    const getPowerMenuStyle = () => {
        if (!powerMenu) return undefined;
        const estimatedHeight = 48 + 40 + 10 + POWER_CONTROL_ACTIONS.length * 40 + 16;
        const maxLeft = Math.max(POPUP_VIEWPORT_PADDING, window.innerWidth - POWER_MENU_WIDTH - POPUP_VIEWPORT_PADDING);
        const maxTop = Math.max(POPUP_VIEWPORT_PADDING, window.innerHeight - estimatedHeight - POPUP_VIEWPORT_PADDING);
        return {
            position: 'fixed',
            left: Math.max(POPUP_VIEWPORT_PADDING, Math.min(powerMenu.x, maxLeft)),
            top: Math.max(POPUP_VIEWPORT_PADDING, Math.min(powerMenu.y, maxTop)),
            width: POWER_MENU_WIDTH,
            maxHeight: `calc(100vh - ${POPUP_VIEWPORT_PADDING * 2}px)`,
            overflowY: 'auto'
        };
    };
    const toggleSeatSelected = (seat, additive = false) => {
        setSelectedSeatIds(prev => {
            if (!additive) return [seat.id];
            return prev.includes(seat.id) ? prev.filter(id => id !== seat.id) : [...prev, seat.id];
        });
    };
    const handleClose = () => {
        if (editingId) {
            saveSeats(seats.map(s => s.id === editingId ? { ...s, name: editName } : s));
            setEditingId(null);
        }
        if (onClose) onClose();
    };

    // 切换班级
    const handleSwitchClassroom = (classroomId) => {
        if (classroomId === currentClassroomId) return;
        setCurrentClassroomId(classroomId);
        localStorage.setItem('classroom-last-used', classroomId);
        setShowClassroomMenu(false);
    };

    // 创建新班级
    const handleCreateClassroom = () => {
        if (!newClassName.trim()) return;
        const newId = `classroom-${Date.now()}`;
        saveClassroom(newId, {
            name: newClassName.trim(),
            seats: [],
            podiumAtTop: true
        });
        setNewClassName('');
        setShowAddClassroom(false);
        handleSwitchClassroom(newId);
    };

    // 删除班级
    const handleDeleteClassroom = (e, classroomId) => {
        e.stopPropagation();
        if (Object.keys(classrooms).length <= 1) {
            alert('至少需要保留一个班级');
            return;
        }
        if (!confirm(`确定要删除班级 "${classrooms[classroomId]?.name}" 吗？`)) return;

        setClassrooms(prev => {
            const updated = { ...prev };
            delete updated[classroomId];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

            fetch('/api/save-classroom-layout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ layout: updated })
            }).catch(err => {
                console.warn('[ClassroomView] Error persisting classroom layout after delete:', err);
            });

            return updated;
        });

        // 如果删除的是当前班级，切换到第一个班级
        if (classroomId === currentClassroomId) {
            const remainingClassrooms = Object.keys(classrooms).filter(id => id !== classroomId);
            if (remainingClassrooms.length > 0) {
                handleSwitchClassroom(remainingClassrooms[0]);
            }
        }
        setShowClassroomMenu(false);
    };

    // 重命名班级
    const handleRenameClassroom = (classroomId, newName) => {
        saveClassroom(classroomId, { name: newName.trim() });
    };

    // 更新班级的讲台位置
    const handlePodiumAtTopChange = (value) => {
        setCurrentPodiumTop(value);
        saveClassroom(currentClassroomId, { podiumAtTop: value });
        if (onPodiumAtTopChange) {
            onPodiumAtTopChange(value);
        }
    };

    const fetchOnline = () => {
        fetch('/api/students').then(r => r.json()).then(d => {
            setOnlineIPs((d.students || []).map(normalizeIp));
        }).catch(() => {});
    };

    const applyServerLayout = (layout) => {
        if (!layout) return;
        let serverClassrooms = null;
        if (Array.isArray(layout)) {
            serverClassrooms = {
                default: {
                    name: '默认班级',
                    seats: layout.map(s => ({ ...s, ip: normalizeIp(s.ip) })),
                    podiumAtTop: true
                }
            };
        } else if (layout?.classrooms && typeof layout.classrooms === 'object') {
            serverClassrooms = layout.classrooms;
        } else if (typeof layout === 'object') {
            serverClassrooms = layout;
        }
        if (!serverClassrooms || Object.keys(serverClassrooms).length === 0) return;
        setClassrooms(serverClassrooms);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(serverClassrooms));
        const lastUsed = localStorage.getItem('classroom-last-used');
        const targetId = (lastUsed && serverClassrooms[lastUsed])
            ? lastUsed
            : (Object.keys(serverClassrooms)[0] || 'default');
        setCurrentClassroomId(targetId);
    };

    useEffect(() => {
        fetchOnline();
        const t = setInterval(fetchOnline, 3000);

        fetch('/api/classroom-layout')
            .then(r => r.json())
            .then(d => {
                if (!d?.success || !d.layout) return;
                applyServerLayout(d.layout);
            })
            .catch(err => {
                console.warn('[ClassroomView] Failed to load classroom layout from server:', err);
            });

        return () => clearInterval(t);
    }, []);

    useEffect(() => {
        if (!socket) return undefined;
        const handleLayoutUpdated = (data) => {
            if (data?.layout) applyServerLayout(data.layout);
        };
        socket.on('classroom-layout-updated', handleLayoutUpdated);
        return () => socket.off?.('classroom-layout-updated', handleLayoutUpdated);
    }, [socket, currentClassroomId]);

    useEffect(() => {
        if (!socket) return undefined;
        const handlePowerAck = (data) => {
            if (!data || data.action !== 'power-on') return;
            if (data.success) {
                const failed = Array.isArray(data.results) ? data.results.filter(item => !item?.success) : [];
                const missingMacCount = failed.filter(item => item?.error === 'missing_mac').length;
                if (missingMacCount > 0) {
                    alert(`Wake-on-LAN \u5df2\u5c1d\u8bd5\u53d1\u9001\uff0c\u4f46\u6709 ${missingMacCount} \u53f0\u8bbe\u5907\u7f3a\u5c11 MAC \u5730\u5740\uff0c\u672a\u53d1\u9001\u5f00\u673a\u5305\u3002`);
                }
                return;
            }
            if (data.error === 'empty_targets') {
                alert('\u672a\u627e\u5230\u53ef\u7528\u7684\u5f00\u673a\u76ee\u6807\u3002');
                return;
            }
            const missingMacCount = Array.isArray(data.results) ? data.results.filter(item => item?.error === 'missing_mac').length : 0;
            if (missingMacCount > 0) {
                alert(`\u672a\u53d1\u9001 Wake-on-LAN \u5f00\u673a\u5305\uff1a${missingMacCount} \u53f0\u8bbe\u5907\u7f3a\u5c11 MAC \u5730\u5740\u3002`);
                return;
            }
            if (data.error) {
                alert(`\u5f00\u673a\u64cd\u4f5c\u5931\u8d25\uff1a${data.error}`);
            }
        };
        socket.on('student:power-control:ack', handlePowerAck);
        return () => socket.off?.('student:power-control:ack', handlePowerAck);
    }, [socket]);

    const handleAutoImport = () => {
        setAutoImporting(true);
        fetch('/api/students').then(r => r.json()).then(d => {
            const ips = (d.students || []).map(normalizeIp);
            const existing = new Set(seats.map(s => s.ip));
            const newIps = ips.filter(ip => !existing.has(ip));
            if (newIps.length === 0) { setAutoImporting(false); return; }
            let row = Math.max(maxRow, 4);
            let col = 0;
            const added = newIps.map(ip => {
                col++;
                if (col > layoutCols) { col = 1; row++; }
                return { id: `seat-${Date.now()}-${ip}`, ip, name: '', row, col };
            });
            saveSeats([...seats, ...added]);
            setAutoImporting(false);
        }).catch(() => setAutoImporting(false));
    };

    const recentAlerts = {};
    const logSlice = (studentLog || []).slice(-50);
    logSlice.forEach(e => {
        if (!recentAlerts[e.ip]) recentAlerts[e.ip] = [];
        recentAlerts[e.ip].push(e);
    });

    const handleSeatMouseDown = (event, seat) => {
        if (event.button !== 0) return;
        if (event.target?.closest?.('button')) return;
        const viewport = seatCanvasViewportRef.current;
        const canvas = seatCanvasRef.current;
        if (!viewport || !canvas) return;

        event.preventDefault();
        const startPos = getSeatDragStart(seat);
        const canvasRect = canvas.getBoundingClientRect();
        const startPointer = getCanvasScrollPointer(event, canvasRect, viewport);
        const { offsetX, offsetY } = getSeatDragOffset(startPointer, startPos);

        setDragId(seat.id);
        setDragPreviewPos({ id: seat.id, x: startPos.x, y: startPos.y });

        let moved = false;
        let lastPos = { x: startPos.x, y: startPos.y };
        let frameId = null;
        let pendingPos = null;

        const flushPreview = () => {
            frameId = null;
            if (!pendingPos) return;
            const next = pendingPos;
            pendingPos = null;
            setSeatPreviewState(seat.id, setDragPreviewPos, next);
        };

        const onMouseMove = (moveEvent) => {
            const nextPos = getSeatMovePoint(moveEvent, canvasRect, viewport, offsetX, offsetY, canvas);
            if (getDragMoved(nextPos.x, nextPos.y, startPos)) moved = true;
            lastPos = nextPos;
            pendingPos = nextPos;
            if (frameId === null) {
                frameId = window.requestAnimationFrame(flushPreview);
            }
        };
        const onMouseUp = () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            if (frameId !== null) {
                window.cancelAnimationFrame(frameId);
                flushPreview();
            }
            if (moved) {
                const drop = getSeatDropState(lastPos);
                saveSeats(seats.map(s => s.id === seat.id ? { ...s, x: drop.x, y: drop.y, row: drop.row, col: drop.col } : s));
            }
            setDragId(null);
            setDragPreviewPos(null);
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    const handleCanvasMouseDown = (event) => {
        if (event.button !== 0) return;
        if (event.target?.closest?.('[data-seat-card="true"]')) return;
        const viewport = seatCanvasViewportRef.current;
        const canvas = seatCanvasRef.current;
        if (!viewport || !canvas) return;
        event.preventDefault();
        setPowerMenu(null);
        const canvasRect = canvas.getBoundingClientRect();
        const start = toCanvasPointerPos(event, canvasRect, viewport);
        const updateSelection = (current) => {
            const left = Math.min(start.x, current.x);
            const top = Math.min(start.y, current.y);
            const width = Math.abs(current.x - start.x);
            const height = Math.abs(current.y - start.y);
            setSelectionBox({ left, top, width, height });
            const right = left + width;
            const bottom = top + height;
            const ids = seats.filter(seat => {
                const pos = getSeatCanvasPosition(seat);
                return pos.x < right && pos.x + SEAT_CARD_WIDTH > left && pos.y < bottom && pos.y + SEAT_CARD_HEIGHT > top;
            }).map(seat => seat.id);
            setSelectedSeatIds(ids);
        };
        const onMove = (moveEvent) => {
            updateSelection(toCanvasPointerPos(moveEvent, canvasRect, viewport));
        };
        const onUp = () => {
            setSelectionBox(null);
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    };

    const handleDownloadTemplate = () => {
        const content = [
            '# 机房座位列表模板',
            '# 每行格式: ip,姓名,学号,行,列,x,y',
            '# 行列或坐标至少提供一组，不提供时系统自动排布',
            '#',
            '# 示例',
            '192.168.1.101,A01,20230001,1,1,36,36',
            '192.168.1.101,A01,20230001,1,1',
            '192.168.1.102,A02,20230002,1,2',
            '192.168.1.103,A03,20230003,1,3',
            '192.168.1.104,A04,20230004,1,4',
            '192.168.1.105,A05,20230005,1,5',
            '192.168.1.106,A06,20230006,1,6',
            '192.168.1.201,B01,20230007,2,1',
            '192.168.1.202,B02,20230008,2,2',
            '192.168.1.203,B03,20230009,2,3',
        ].join('\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'classroom-seats-template.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImportFile = (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        setImportError(null);
        const reader = new FileReader();
        reader.onload = (ev) => {
            const text = String(ev.target.result || '');
            const trimmedText = text.trim();
            const isJson = String(file.name || '').toLowerCase().endsWith('.json')
                || trimmedText.startsWith('{')
                || trimmedText.startsWith('[');
            if (isJson) {
                try {
                    const parsed = JSON.parse(trimmedText || '{}');
                    // 如果是 v2 格式的班级数据，可以选择创建新班级或覆盖
                    if (parsed && parsed.version === 2 && parsed.classroomId && parsed.classroomName) {
                        const shouldCreateNew = confirm(`导入的班级名称为 "${parsed.classroomName}"\n\n点击"确定"创建新班级\n点击"取消"覆盖当前班级`);
                        if (shouldCreateNew) {
                            const newId = `classroom-${Date.now()}`;
                        saveClassroom(newId, {
                            name: parsed.classroomName,
                            seats: parsed.seats.map((s, idx) => {
                                const ip = normalizeIp(s.ip);
                                return { id: s.id || `seat-${Date.now()}-${ip}-${idx}`, ip, name: s.name || '', studentId: s.studentId || '', row: s.row, col: s.col, x: s.x, y: s.y };
                            }),
                            podiumAtTop: parsed.podiumAtTop !== undefined ? parsed.podiumAtTop : true
                        });
                            handleSwitchClassroom(newId);
                            return;
                        }
                    }
                    // 覆盖当前班级
                    if (parsed && typeof parsed.podiumAtTop === 'boolean') {
                        handlePodiumAtTopChange(parsed.podiumAtTop);
                    }
                    const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.seats) ? parsed.seats : []);
                    const normalized = list
                        .map((s, idx) => {
                            const ip = normalizeIp(s && s.ip ? String(s.ip).trim() : '');
                            const name = s && s.name ? String(s.name) : '';
                            const studentId = s && s.studentId ? String(s.studentId) : '';
                            const mac = s && (s.mac || s.wakeMac || s.macAddress) ? String(s.mac || s.wakeMac || s.macAddress).trim() : '';
                            const row = s && Number.isFinite(Number(s.row)) ? Math.max(1, Number(s.row)) : null;
                            const col = s && Number.isFinite(Number(s.col)) ? Math.max(1, Number(s.col)) : null;
                            const x = s && Number.isFinite(Number(s.x)) ? Math.max(0, Number(s.x)) : null;
                            const y = s && Number.isFinite(Number(s.y)) ? Math.max(0, Number(s.y)) : null;
                            if (!ip || ((!row || !col) && (x === null || y === null))) return null;
                            const id = s && s.id ? String(s.id) : `seat-${Date.now()}-${ip}-${idx}`;
                            return { id, ip, name, studentId, mac, row, col, x, y };
                        })
                        .filter(Boolean);
                    if (normalized.length === 0) {
                        setImportError('JSON 文件中未找到有效座位数据');
                        return;
                    }
                    saveSeats(normalized);
                    return;
                } catch (_) {
                    setImportError('JSON 解析失败，请确认文件格式正确');
                    return;
                }
            }
            const lines = text.split(/\r?\n/);
            const imported = [];
            const errors = [];
            lines.forEach((line, idx) => {
                const trimmed = line.trim();
                if (!trimmed || trimmed.startsWith('#')) return;
                const parts = trimmed.split(',');
                if (parts.length < 2) { errors.push(`第 ${idx + 1} 行格式错误`); return; }
                const ip = normalizeIp(parts[0].trim());
                const name = parts[1] ? parts[1].trim() : '';
                const studentId = parts[2] ? parts[2].trim() : '';
                const mac = parts[3] ? parts[3].trim() : '';
                const row = parts[4] ? parseInt(parts[4].trim(), 10) : null;
                const col = parts[5] ? parseInt(parts[5].trim(), 10) : null;
                const x = parts[6] ? parseFloat(parts[6].trim()) : null;
                const y = parts[7] ? parseFloat(parts[7].trim()) : null;
                if (!ip) { errors.push(`第 ${idx + 1} 行 IP 为空`); return; }
                if (row !== null && (isNaN(row) || row < 1)) { errors.push(`第 ${idx + 1} 行 行号无效`); return; }
                if (col !== null && (isNaN(col) || col < 1)) { errors.push(`第 ${idx + 1} 行 列号无效`); return; }
                imported.push({ ip, name, studentId, mac, row: row || null, col: col || null, x: x ?? null, y: y ?? null });
            });
            if (errors.length > 0) {
                setImportError(errors.slice(0, 3).join('；') + (errors.length > 3 ? `…等 ${errors.length} 处错误` : ''));
            }
            if (imported.length === 0) return;
            let nextSeats = [...seats];
            let autoRow = Math.max(...nextSeats.map(s => s.row || 0), 0) + 1;
            let autoCol = 0;
            imported.forEach(item => {
                const existing = nextSeats.find(s => s.ip === item.ip);
                let x = item.x;
                let y = item.y;
                let r = item.row, c = item.col;
                if (x === null || y === null) {
                    if (!r || !c) {
                        autoCol++;
                        if (autoCol > layoutCols) { autoCol = 1; autoRow++; }
                        r = autoRow;
                        c = autoCol;
                    }
                    const pos = rowColToCanvasPos(r, c);
                    x = pos.x;
                    y = pos.y;
                } else if (!r || !c) {
                    const grid = canvasPosToRowCol(x, y);
                    r = grid.row;
                    c = grid.col;
                }
                if (existing) {
                    nextSeats = nextSeats.map(s => s.ip === item.ip ? { ...s, name: item.name || s.name, studentId: item.studentId || s.studentId, mac: item.mac || getSeatMac(s), row: r, col: c, x, y } : s);
                } else {
                    nextSeats.push({ id: `seat-${Date.now()}-${item.ip}`, ip: item.ip, name: item.name, studentId: item.studentId, mac: item.mac, row: r, col: c, x, y });
                }
            });
            saveSeats(nextSeats);
        };
        reader.readAsText(file, 'utf-8');
        e.target.value = '';
    };

    const downloadBlob = (blob, filename) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    };
    const getStamp = () => {
        const d = new Date();
        const p2 = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
    };
    const handleExportJson = () => {
        const payload = {
            version: 2,
            exportedAt: new Date().toISOString(),
            classroomId: currentClassroomId,
            classroomName: currentClassroom.name,
            podiumAtTop: currentPodiumTop,
            seats: seats.map(s => ({ ip: s.ip, name: s.name || '', studentId: s.studentId || '', mac: getSeatMac(s), row: s.row, col: s.col, x: s.x, y: s.y }))
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        downloadBlob(blob, `classroom-${currentClassroom.name}-${getStamp()}.json`);
    };
    const handleExportCsv = () => {
        const content = [
            '# 机房座位列表',
            '# 格式：ip,名称,学号,行,列,x,y',
            ...[...seats]
                .sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col)
                .map(s => `${s.ip},${String(s.name || '').replace(/,/g, ' ')},${String(s.studentId || '').replace(/,/g, ' ')},${String(getSeatMac(s) || '').replace(/,/g, ' ')},${s.row},${s.col},${s.x ?? ''},${s.y ?? ''}`)
        ].join('\n');
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        downloadBlob(blob, `classroom-seats-${getStamp()}.csv`);
    };

    const handleAddSeat = () => {
        if (!addIp.trim()) return;
        const id = `seat-${Date.now()}`;
        saveSeats([...seats, { id, ip: normalizeIp(addIp.trim()), name: addName.trim(), studentId: addStudentId.trim(), mac: addMac.trim(), row: Number(addRow), col: Number(addCol) }]);
        setAddIp(''); setAddName(''); setAddStudentId(''); setAddMac(''); setShowAddForm(false);
    };

    const handleDelete = (id) => saveSeats(seats.filter(s => s.id !== id));

    const startEdit = (seat) => { setEditingId(seat.id); setEditName(seat.name); setEditStudentId(seat.studentId || ''); };
    const commitEdit = () => {
        saveSeats(seats.map(s => s.id === editingId ? { ...s, name: editName, studentId: editStudentId } : s));
        setEditingId(null);
    };

    const alertIcons = {
        'fullscreen-exit': { icon: 'fa-compress', color: 'text-orange-400', label: '退出全屏' },
        'tab-hidden':      { icon: 'fa-eye-slash', color: 'text-red-400',    label: '切换页面' },
        'join':            { icon: 'fa-user-plus', color: 'text-green-400',  label: '上线' },
        'leave':           { icon: 'fa-user-minus', color: 'text-slate-400', label: '离线' },
    };

    const sortedSeats = [...seats].sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col);
    const onlineSeatCount = seats.filter(seat => onlineIPs.includes(seat.ip)).length;
    const offlineSeatCount = Math.max(0, seats.length - onlineSeatCount);
    const alertSeatCount = Object.values(recentAlerts).filter(items => Array.isArray(items) && items.length > 0).length;

    const renderPodium = () => (
        <div className="flex justify-center">
            <div className="teacher-glass-light rounded-[24px] px-8 sm:px-12 py-2.5 text-[11px] sm:text-sm font-black tracking-[0.35em] text-white/90 shadow-[0_20px_45px_rgba(15,23,42,0.28)]">
                讲台
            </div>
        </div>
    );

    const getPopupStyle = (anchorRef, { width, align = 'left' }) => {
        const rect = anchorRef.current?.getBoundingClientRect?.();
        if (!rect) return { visibility: 'hidden' };
        const top = rect.bottom + 8;
        if (align === 'right') {
            return {
                position: 'fixed',
                top,
                left: Math.max(12, rect.right - width),
                width,
            };
        }
        return {
            position: 'fixed',
            top,
            left: Math.max(12, rect.left),
            width,
        };
    };

    const parseCapturedAt = (value) => {
        if (!value && value !== 0) return null;
        if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
        if (typeof value === 'number') {
            const d = new Date(value);
            return Number.isNaN(d.getTime()) ? null : d;
        }
        const text = String(value).trim();
        if (!text) return null;
        if (/^\d+$/.test(text)) {
            const num = Number(text);
            const d = new Date(num < 1e12 ? num * 1000 : num);
            return Number.isNaN(d.getTime()) ? null : d;
        }
        const d = new Date(text);
        return Number.isNaN(d.getTime()) ? null : d;
    };

    const formatCapturedTime = (value) => {
        const d = parseCapturedAt(value);
        return d ? d.toLocaleTimeString('zh-CN', { hour12: false }) : '';
    };

    const formatCapturedDateTime = (value) => {
        const d = parseCapturedAt(value);
        return d ? d.toLocaleString('zh-CN', { hour12: false }) : '';
    };

    const renderSeat = (seat) => {
        const isOnline = onlineIPs.includes(seat.ip);
        const alerts = recentAlerts[seat.ip] || [];
        const lastAlert = alerts[alerts.length - 1];
        const screenshot = studentScreenshots[seat.ip] || null;
        const isSelected = selectedSeatIds.includes(seat.id);
        const isDragging = dragId === seat.id;
        return (
            <div
                key={seat.id}
                data-seat-card="true"
                onMouseDown={e => handleSeatMouseDown(e, seat)}
                onContextMenu={e => openPowerMenuForSeats(e, isSelected ? getSelectedSeats() : [seat])}
                onClick={(e) => {
                    if (e.ctrlKey || e.metaKey) { toggleSeatSelected(seat, true); return; }
                    toggleSeatSelected(seat, false);
                    if (screenshot?.dataUrl) setPreviewSeat({ seat, screenshot });
                }}
                className={`absolute overflow-hidden rounded-[20px] border cursor-grab select-none group ${getSeatTransitionClass(isDragging)} ${getSeatCardGuideClass(seat)} ${getSeatSnapIndicatorClass(seat)}
                    ${isDragging ? `opacity-85 scale-[0.98] z-20 ${getSeatDragShadowClass(isDragging)}` : 'hover:-translate-y-0.5'}
                    ${isSelected ? 'ring-2 ring-sky-300/85 border-sky-200/80 shadow-[0_0_0_2px_rgba(125,211,252,0.22),0_22px_42px_rgba(56,189,248,0.22)]' : ''}
                    ${lastAlert
                        ? 'ring-2 ring-amber-300/70 border-amber-200/50 shadow-[0_0_0_1px_rgba(252,211,77,0.25),0_22px_40px_rgba(251,191,36,0.18)]'
                        : isOnline
                            ? 'ring-1 ring-emerald-300/45 bg-gradient-to-br from-emerald-300/22 via-cyan-300/16 to-white/10 border-emerald-200/35 shadow-[0_22px_40px_rgba(16,185,129,0.18)]'
                            : 'bg-gradient-to-br from-white/14 via-white/8 to-slate-900/8 border-white/14 shadow-[0_18px_34px_rgba(15,23,42,0.18)] hover:border-sky-200/24'
                    } ${screenshot?.dataUrl ? 'cursor-zoom-in' : ''}`}
                style={getSeatCanvasStyle(seat)}
            >
                {screenshot?.dataUrl ? (
                    <img src={screenshot.dataUrl} alt={`${seat.name || seat.ip} screenshot`} className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 text-center text-[10px] text-slate-400 sm:text-[11px]">
                        <div>
                            <i className="fas fa-desktop mb-2 block text-lg text-slate-500"></i>
                            <div>{monitorEnabled ? '等待截图…' : '监控已关闭'}</div>
                        </div>
                    </div>
                )}

                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/45"></div>
                <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10"></div>
                <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/50 to-transparent"></div>

                <button
                    onClick={() => handleDelete(seat.id)}
                    className="absolute top-2 right-2 z-20 hidden h-6 w-6 items-center justify-center rounded-full border border-white/15 bg-black/35 text-[10px] text-white/85 backdrop-blur-sm transition-colors hover:bg-red-500 hover:text-white group-hover:flex"
                >
                    <i className="fas fa-xmark text-[10px]"></i>
                </button>

                <div className="absolute left-2 top-2 z-10 flex items-start justify-between gap-2 right-10">
                    <div className="min-w-0">
                        <div className={`mb-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-[0.18em] backdrop-blur-sm ${
                            isOnline
                                ? 'border-emerald-200/35 bg-emerald-300/16 text-emerald-100'
                                : 'border-white/12 bg-black/25 text-slate-200'
                        }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${isOnline ? 'bg-emerald-300 shadow-[0_0_8px_rgba(110,231,183,0.8)]' : 'bg-slate-400'}`}></span>
                            {isOnline ? 'ONLINE' : 'OFFLINE'}
                        </div>
                        <div
                            className="truncate text-[11px] font-black tracking-[0.04em] text-white sm:text-[13px] cursor-text drop-shadow"
                            title={`${seat.name || '未命名'}\n${seat.studentId ? '学号: ' + seat.studentId : ''}\n${seat.ip}`}
                            onDoubleClick={() => startEdit(seat)}
                        >
                            {seat.name || <span className="italic text-slate-300">双击命名</span>}
                        </div>
                        {seat.studentId && (
                            <div className="mt-0.5 truncate text-[9px] font-medium text-sky-100/95 drop-shadow">
                                #{seat.studentId}
                            </div>
                        )}
                    </div>
                    <div className="rounded-full border border-white/12 bg-black/30 px-2 py-0.5 text-[9px] font-mono text-white/85 backdrop-blur-sm">
                        {getSeatCoordLabel(seat)}
                    </div>
                </div>

                <div className="absolute left-2 right-2 bottom-2 z-10 space-y-1.5">
                    <div className="truncate rounded-xl border border-white/10 bg-black/35 px-2 py-1.5 font-mono text-[8px] text-white/90 backdrop-blur-sm sm:text-[9px]">
                        {seat.ip}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                        {lastAlert && alertIcons[lastAlert.type] ? (
                            <div className={`inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-[8px] font-medium sm:text-[9px] ${alertIcons[lastAlert.type].color} bg-black/35 border border-white/10 backdrop-blur-sm`}>
                                <i className={`fas ${alertIcons[lastAlert.type].icon}`}></i>
                                <span className="truncate">{alertIcons[lastAlert.type].label}</span>
                            </div>
                        ) : (
                            <div className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/35 px-2 py-1 text-[8px] text-slate-200 backdrop-blur-sm sm:text-[9px]">
                                <i className="fas fa-wave-square"></i>
                                <span>{screenshot?.capturedAt ? '截图已更新' : '状态正常'}</span>
                            </div>
                        )}
                        <div className="text-[8px] text-white/70 sm:text-[9px] drop-shadow text-right truncate">
                            {formatCapturedTime(screenshot?.capturedAt)}
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const renderList = () => (
        <div className="teacher-glass-light flex-1 overflow-hidden rounded-[28px] border border-white/10">
            <div className="h-full overflow-auto px-3 py-3 sm:px-5 sm:py-4">
                <table className="w-full min-w-[700px] text-sm text-left border-separate border-spacing-y-2">
                <thead>
                    <tr className="text-slate-300 text-[10px] sm:text-xs uppercase tracking-[0.22em]">
                        <th className="px-2 sm:px-3 py-2 w-6 text-center">#</th>
                        <th className="px-2 sm:px-3 py-2">状态</th>
                        <th className="px-2 sm:px-3 py-2">IP 地址</th>
                        <th className="px-2 sm:px-3 py-2">名称</th>
                        <th className="px-2 sm:px-3 py-2 hidden sm:table-cell">学号</th>
                        <th className="px-2 sm:px-3 py-2 text-center hidden sm:table-cell">行</th>
                        <th className="px-2 sm:px-3 py-2 text-center hidden sm:table-cell">列</th>
                        <th className="px-2 sm:px-3 py-2 hidden md:table-cell">最近告警</th>
                        <th className="px-2 sm:px-3 py-2 text-center">操作</th>
                    </tr>
                </thead>
                <tbody>
                    {seats.length === 0 && (
                        <tr><td colSpan="9" className="text-center text-slate-400 py-16">暂无座位，请先导入或手动添加。</td></tr>
                    )}
                    {sortedSeats.map((seat, idx) => {
                        const isOnline = onlineIPs.includes(seat.ip);
                        const alerts = recentAlerts[seat.ip] || [];
                        const lastAlert = alerts[alerts.length - 1];
                        return (
                            <tr key={seat.id} className="overflow-hidden rounded-2xl bg-white/6 shadow-[0_14px_28px_rgba(15,23,42,0.12)] transition-colors hover:bg-white/10">
                                <td className="rounded-l-2xl px-2 sm:px-3 py-3 text-slate-400 text-center text-[10px] sm:text-xs">{idx + 1}</td>
                                <td className="px-2 sm:px-3 py-3">
                                    <span className={`inline-flex items-center gap-1 sm:gap-1.5 rounded-full px-2.5 py-1 text-[10px] sm:text-xs font-bold ${isOnline ? 'bg-emerald-300/16 text-emerald-100' : 'bg-white/8 text-slate-300'}`}>
                                        <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-slate-500'}`}></span>
                                        <span className="hidden sm:inline">{isOnline ? '在线' : '离线'}</span>
                                    </span>
                                </td>
                                <td className="px-2 sm:px-3 py-3 font-mono text-slate-200 text-[10px] sm:text-xs">{seat.ip}</td>
                                <td className="px-2 sm:px-3 py-3">
                                    <span
                                        className="text-white text-[10px] sm:text-xs font-bold cursor-text hover:text-sky-300 transition-colors"
                                        onClick={() => startEdit(seat)}
                                        title="点击编辑"
                                    >
                                        {seat.name || <span className="text-slate-400 italic">点击编辑</span>}
                                    </span>
                                </td>
                                <td className="px-2 sm:px-3 py-3 font-mono text-slate-300 text-[10px] sm:text-xs hidden sm:table-cell">{seat.studentId || <span className="text-slate-500 italic">-</span>}</td>
                                <td className="px-2 sm:px-3 py-3 text-center text-slate-300 text-[10px] sm:text-xs hidden sm:table-cell">{seat.row}</td>
                                <td className="px-2 sm:px-3 py-3 text-center text-slate-300 text-[10px] sm:text-xs hidden sm:table-cell">{seat.col}</td>
                                <td className="px-2 sm:px-3 py-3 text-[10px] sm:text-xs hidden md:table-cell">
                                    {lastAlert && alertIcons[lastAlert.type] ? (
                                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 ${alertIcons[lastAlert.type].color} bg-black/10`}>
                                            <i className={`fas ${alertIcons[lastAlert.type].icon}`}></i>
                                            {alertIcons[lastAlert.type].label}
                                        </span>
                                    ) : <span className="text-slate-500">-</span>}
                                </td>
                                <td className="rounded-r-2xl px-2 sm:px-3 py-3 text-center">
                                    <button onClick={(e) => openPowerMenuForSeats(e, [seat])} className="mr-3 text-slate-400 hover:text-sky-300 transition-colors text-[10px] sm:text-xs" title="电源控制">
                                        <i className="fas fa-sliders"></i>
                                    </button>
                                    <button onClick={() => handleDelete(seat.id)} className="text-slate-400 hover:text-red-400 transition-colors text-[10px] sm:text-xs" title="删除">
                                        <i className="fas fa-trash-can"></i>
                                    </button>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
            </div>
        </div>
    );

    const renderSeatCanvas = () => {
        const { canvasWidth, canvasHeight } = getCanvasGuides();

        return (
            <div ref={seatCanvasViewportRef} className="min-h-0 flex-1 overflow-auto">
                <div
                    ref={seatCanvasRef}
                    className="relative mx-auto"
                    style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px`, minWidth: `${canvasWidth}px` }}
                    onMouseDown={handleCanvasMouseDown}
                    onContextMenu={(event) => {
                        if (event.target?.closest?.('[data-seat-card="true"]')) return;
                        const targets = getSelectedSeats();
                        if (targets.length > 0) openPowerMenuForSeats(event, targets);
                    }}
                >
                    <div
                        className={`pointer-events-none absolute inset-0 rounded-[24px] ${getCanvasGridClass()}`}
                        style={getCanvasGridStyle()}
                    />
                    {seats.map(renderSeat)}
                    {selectionBox && (
                        <div
                            className="pointer-events-none absolute rounded-xl border border-sky-200/80 bg-sky-300/18 shadow-[0_0_0_1px_rgba(125,211,252,0.18)]"
                            style={{
                                left: `${selectionBox.left}px`,
                                top: `${selectionBox.top}px`,
                                width: `${selectionBox.width}px`,
                                height: `${selectionBox.height}px`
                            }}
                        />
                    )}
                </div>
            </div>
        );
    };

    const rootClassName = standalone
        ? 'teacher-shell-page relative flex h-full overflow-hidden p-2'
        : `teacher-shell-page fixed inset-0 ${(window.__getTeacherLayerClass?.('overlay') || 'z-[10000]')} flex items-center justify-center overflow-hidden bg-black/55 p-2`;
    const shellClassName = standalone
        ? 'teacher-glass-dark teacher-glass-enter teacher-borderless relative flex h-full w-full flex-col overflow-hidden rounded-[24px]'
        : 'teacher-glass-dark teacher-glass-enter teacher-borderless relative flex h-[94vh] w-[97vw] max-w-[1500px] flex-col overflow-hidden rounded-[28px]';

    return (
        <div className={rootClassName} onClick={standalone ? undefined : handleClose}>
            <div className="pointer-events-none absolute inset-0 opacity-90">
                <div className="absolute -top-24 left-[8%] h-64 w-64 rounded-full bg-sky-400/18 blur-3xl"></div>
                <div className="absolute right-[10%] top-[12%] h-72 w-72 rounded-full bg-emerald-400/14 blur-3xl"></div>
                <div className="absolute bottom-[8%] left-[20%] h-56 w-56 rounded-full bg-indigo-400/12 blur-3xl"></div>
            </div>
            <div
                className={shellClassName}
                onClick={e => e.stopPropagation()}
            >
                <div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_72%)]"></div>

                <div className="relative z-[1] flex flex-col gap-3 p-3 sm:p-4">
                    <div
                        className="teacher-glass-light teacher-borderless flex flex-col gap-2.5 rounded-[28px] px-4 py-3 sm:px-5 sm:py-3.5"
                        style={standalone ? { WebkitAppRegion: 'drag' } : undefined}
                        onMouseDown={handleTitlebarMouseDown}
                        onDoubleClick={handleTitlebarDoubleClick}
                    >
                        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0">
                                <div className="mb-1.5 inline-flex items-center gap-2 rounded-full border border-sky-200/20 bg-sky-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-sky-100">
                                    <i className="fas fa-chalkboard"></i>
                                    Classroom Monitor
                                </div>
                                <div className="flex items-center gap-2.5">
                                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/16 bg-white/10 text-sky-100 shadow-[0_12px_24px_rgba(56,189,248,0.14)]">
                                        <i className="fas fa-chalkboard-teacher"></i>
                                    </div>
                                    <div className="min-w-0">
                                        <h2 className="truncate text-lg sm:text-xl font-black tracking-[0.04em] text-white">机房视图</h2>
                                        <p className="mt-0.5 text-xs text-slate-300">查看终端在线、告警与座位编排。</p>
                                    </div>
                                </div>
                            </div>
                            <div
                                className="flex flex-wrap items-center gap-2 lg:justify-end"
                                style={standalone ? { WebkitAppRegion: 'no-drag' } : undefined}
                                data-window-control={standalone ? 'true' : undefined}
                            >
                                <span className="rounded-full border border-emerald-200/24 bg-emerald-300/14 px-3 py-1 text-[11px] font-bold text-emerald-100">
                                    在线 {onlineSeatCount}
                                </span>
                                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-bold text-slate-200">
                                    离线 {offlineSeatCount}
                                </span>
                                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-[11px] font-bold text-slate-200">
                                    座位 {seats.length}
                                </span>
                                <span className="rounded-full border border-amber-200/20 bg-amber-300/10 px-3 py-1 text-[11px] font-bold text-amber-100">
                                    告警 {alertSeatCount}
                                </span>
                                <span className="rounded-full border border-sky-200/20 bg-sky-300/10 px-3 py-1 text-[11px] font-bold text-sky-100">
                                    编排 Free Canvas
                                </span>
                                {standalone && <WindowControls />}
                            </div>
                        </div>
                    <div
                        className="mt-2.5 border-t border-white/10 pt-2.5"
                        style={standalone ? { WebkitAppRegion: 'no-drag' } : undefined}
                        data-window-control={standalone ? 'true' : undefined}
                    >
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                            <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                                <div className="relative" ref={classroomMenuRef}>
                                    <button
                                        onClick={() => setShowClassroomMenu(!showClassroomMenu)}
                                        className="teacher-liquid-button flex items-center px-3 py-2 rounded-2xl text-xs sm:text-sm font-medium"
                                    >
                                        <i className="fas fa-users mr-1.5"></i>
                                        <span className="max-w-[150px] truncate">{currentClassroom.name}</span>
                                        <i className={`fas fa-chevron-down ml-2 text-xs transition-transform ${showClassroomMenu ? 'rotate-180' : ''}`}></i>
                                    </button>
                                </div>
                                <div className="flex rounded-2xl overflow-hidden border border-white/10 bg-white/8">
                                    <button onClick={() => setViewMode('grid')} className={`px-3 py-2 text-xs sm:text-sm transition-colors ${viewMode === 'grid' ? 'bg-sky-300/18 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`} title="网格视图"><i className="fas fa-table-cells"></i></button>
                                    <button onClick={() => setViewMode('list')} className={`px-3 py-2 text-xs sm:text-sm transition-colors ${viewMode === 'list' ? 'bg-sky-300/18 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-white'}`} title="列表视图"><i className="fas fa-list"></i></button>
                                </div>
                                <button
                                    onClick={() => handlePodiumAtTopChange(!currentPodiumTop)}
                                    className="teacher-liquid-button flex items-center px-3 py-2 rounded-2xl text-xs sm:text-sm font-medium"
                                    title={currentPodiumTop ? '讲台在上，点击切换到底部' : '讲台在下，点击切换到顶部'}
                                >
                                    <i className="fas fa-chalkboard mr-1.5"></i>{currentPodiumTop ? '讲台在上' : '讲台在下'}
                                </button>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap justify-end w-full xl:w-auto">
                                <button
                                    className={`${monitorEnabled ? 'teacher-liquid-primary' : 'teacher-liquid-button'} flex items-center px-3 py-2 rounded-2xl text-xs sm:text-sm font-medium transition-colors cursor-default`}
                                    title="开启或关闭学生机监控"
                                >
                                    <i className={`fas ${monitorEnabled ? 'fa-eye' : 'fa-eye-slash'} mr-1.5`}></i>
                                    {monitorEnabled ? `监控中 ${monitorIntervalSec}s` : '开启监控'}
                                </button>
                                <button onClick={handleAutoImport} disabled={autoImporting} className="teacher-liquid-primary flex items-center px-3 py-2 rounded-2xl text-xs sm:text-sm font-medium transition-colors" title="自动检测在线学生并添加到座位表">
                                    <i className={`fas ${autoImporting ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'} mr-1.5`}></i>自动导入
                                </button>
                                <div className="relative" ref={moreMenuRef}>
                                    <button
                                        onClick={() => setShowMoreMenu(!showMoreMenu)}
                                        className={`teacher-liquid-button flex items-center px-3 py-2 rounded-2xl text-xs sm:text-sm font-medium ${showMoreMenu ? 'text-white bg-white/18' : 'text-slate-300'}`}
                                    >
                                        <i className="fas fa-ellipsis-vertical mr-1.5"></i>更多
                                    </button>
                                </div>
                                <button onClick={() => setShowAddForm(v => !v)} className="teacher-liquid-button flex items-center px-3 py-2 rounded-2xl text-xs sm:text-sm font-medium">
                                    <i className="fas fa-plus mr-1.5"></i>手动添加
                                </button>
                                {!standalone && (
                                    <button onClick={handleClose} className="w-10 h-10 flex items-center justify-center rounded-2xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors border border-white/10 bg-white/8">
                                        <i className="fas fa-xmark text-lg"></i>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                    </div>

                {showAddForm && (
                    <div className="teacher-glass rounded-[26px] px-4 py-3 sm:px-5">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                            <input value={addIp} onChange={e => setAddIp(e.target.value)} placeholder="IP 地址" className="w-28 rounded-2xl border border-white/18 bg-slate-950/45 px-3 py-2 text-xs text-slate-100 placeholder-slate-300 outline-none transition-colors focus:border-sky-300/80 focus:bg-slate-950/60 focus:ring-2 focus:ring-sky-300/25 sm:w-40 sm:text-sm" />
                            <input value={addName} onChange={e => setAddName(e.target.value)} placeholder="学生姓名" className="w-24 rounded-2xl border border-white/18 bg-slate-950/45 px-3 py-2 text-xs text-slate-100 placeholder-slate-300 outline-none transition-colors focus:border-sky-300/80 focus:bg-slate-950/60 focus:ring-2 focus:ring-sky-300/25 sm:w-32 sm:text-sm" />
                            <input value={addStudentId} onChange={e => setAddStudentId(e.target.value)} placeholder="学号" className="hidden w-28 rounded-2xl border border-white/18 bg-slate-950/45 px-3 py-2 text-sm text-slate-100 placeholder-slate-300 outline-none transition-colors focus:border-sky-300/80 focus:bg-slate-950/60 focus:ring-2 focus:ring-sky-300/25 sm:block" />
                            <input value={addMac} onChange={e => setAddMac(e.target.value)} placeholder="MAC" className="hidden w-36 rounded-2xl border border-white/18 bg-slate-950/45 px-3 py-2 text-sm text-slate-100 placeholder-slate-300 outline-none transition-colors focus:border-sky-300/80 focus:bg-slate-950/60 focus:ring-2 focus:ring-sky-300/25 md:block" />
                            <span className="text-xs text-slate-300 sm:text-sm">行</span>
                            <input type="number" min="1" value={addRow} onChange={e => setAddRow(e.target.value)} className="w-14 rounded-2xl border border-white/18 bg-slate-950/45 px-2 py-2 text-center text-xs text-slate-100 outline-none transition-colors focus:border-sky-300/80 focus:bg-slate-950/60 focus:ring-2 focus:ring-sky-300/25 sm:w-16 sm:text-sm" />
                            <span className="text-xs text-slate-300 sm:text-sm">列</span>
                            <input type="number" min="1" value={addCol} onChange={e => setAddCol(e.target.value)} className="w-14 rounded-2xl border border-white/18 bg-slate-950/45 px-2 py-2 text-center text-xs text-slate-100 outline-none transition-colors focus:border-sky-300/80 focus:bg-slate-950/60 focus:ring-2 focus:ring-sky-300/25 sm:w-16 sm:text-sm" />
                            <button onClick={handleAddSeat} className="teacher-liquid-primary rounded-2xl px-4 py-2 text-xs font-bold transition-colors sm:text-sm">添加</button>
                            <button onClick={() => setShowAddForm(false)} className="teacher-liquid-button rounded-2xl px-3 py-2 text-xs transition-colors sm:text-sm">取消</button>
                        </div>
                    </div>
                )}

                {showAddClassroom && (
                    <div className="teacher-glass rounded-[26px] px-4 py-3 sm:px-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/14 bg-white/10 text-sky-100">
                                <i className="fas fa-users"></i>
                            </div>
                            <input
                                value={newClassName}
                                onChange={e => setNewClassName(e.target.value)}
                                placeholder="输入班级名称，例如：高一 1 班"
                                className="flex-1 rounded-2xl border border-white/14 bg-white/8 px-4 py-2 text-sm text-white placeholder-slate-400 outline-none focus:border-sky-300"
                                autoFocus
                                onKeyDown={e => { if (e.key === 'Enter') handleCreateClassroom(); if (e.key === 'Escape') setShowAddClassroom(false); }}
                            />
                            <div className="flex items-center gap-2 sm:justify-end">
                                <button onClick={handleCreateClassroom} className="teacher-liquid-primary rounded-2xl px-4 py-2 text-sm font-bold transition-colors">创建</button>
                                <button onClick={() => setShowAddClassroom(false)} className="teacher-liquid-button rounded-2xl px-3 py-2 text-sm transition-colors">取消</button>
                            </div>
                        </div>
                    </div>
                )}

                {importError && (
                    <div className="rounded-[24px] border border-red-400/24 bg-red-400/12 px-4 py-3 text-sm text-red-100 shadow-[0_16px_34px_rgba(127,29,29,0.18)]">
                        <div className="flex items-center gap-3">
                            <i className="fas fa-triangle-exclamation text-red-300"></i>
                            <span className="min-w-0 flex-1">{importError}</span>
                            <button onClick={() => setImportError(null)} className="text-red-200 hover:text-white transition-colors"><i className="fas fa-xmark"></i></button>
                        </div>
                    </div>
                )}

                <div className="teacher-glass-light teacher-borderless flex items-center gap-4 rounded-[24px] px-4 py-3 text-[11px] text-slate-300 sm:text-xs">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-400 inline-block"></span>在线</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-500 inline-block"></span>离线</span>
                    <span className="hidden sm:flex items-center gap-1.5"><i className="fas fa-compress text-orange-400"></i>退出全屏</span>
                    <span className="hidden sm:flex items-center gap-1.5"><i className="fas fa-eye-slash text-red-400"></i>切换页面</span>
                    <span className="hidden sm:flex items-center gap-1.5"><i className="fas fa-desktop text-sky-300"></i>{monitorEnabled ? `缩略图 ${monitorIntervalSec}s 更新` : '监控关闭'}</span>
                    <span className="ml-auto hidden text-slate-400 lg:inline">拖拽座位可调整位置，点击姓名可快速编辑学生信息。</span>
                </div>

                <div className="flex-1 min-h-0">
                    {viewMode === 'list' ? (
                        <div className="h-full min-h-0">{renderList()}</div>
                    ) : (
                        <div className="teacher-glass-light teacher-borderless flex h-full min-h-0 flex-col rounded-[30px] p-2.5 sm:p-4">
                            {currentPodiumTop && <div className="pb-3 shrink-0">{renderPodium()}</div>}
                            {renderSeatCanvas()}
                            {!currentPodiumTop && <div className="pt-3 shrink-0">{renderPodium()}</div>}
                        </div>
                    )}
                </div>

                {previewSeat && createPortal(
                    <div
                        className={`fixed inset-0 ${(window.__getTeacherLayerClass?.('modal') || 'z-[10020]')} flex items-center justify-center bg-black/80 p-6 backdrop-blur-sm`}
                        onClick={() => setPreviewSeat(null)}
                    >
                        <div
                            className="relative max-h-[90vh] max-w-[90vw] overflow-hidden rounded-[24px] border border-white/12 bg-slate-950 shadow-[0_30px_100px_rgba(0,0,0,0.55)]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <img src={previewSeat.screenshot.dataUrl} alt={`${previewSeat.seat.name || previewSeat.seat.ip} preview`} className="max-h-[90vh] max-w-[90vw] object-contain" />
                            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-4 bg-gradient-to-b from-black/75 to-transparent p-4">
                                <div className="min-w-0">
                                    <div className="text-lg font-black text-white">{previewSeat.seat.name || '未命名学生'}</div>
                                    <div className="mt-1 text-sm text-slate-200">{previewSeat.seat.studentId ? `#${previewSeat.seat.studentId} · ` : ''}{previewSeat.seat.ip}</div>
                                </div>
                                <button onClick={() => setPreviewSeat(null)} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-black/35 text-white/85 backdrop-blur-sm hover:bg-white/15">
                                    <i className="fas fa-xmark"></i>
                                </button>
                            </div>
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-4 text-right text-sm text-slate-200">
                                {formatCapturedDateTime(previewSeat.screenshot.capturedAt) ? `截图时间 ${formatCapturedDateTime(previewSeat.screenshot.capturedAt)}` : ''}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {powerMenu && createPortal(
                    <div
                        ref={powerMenuPopupRef}
                        className={`teacher-glass-dark rounded-[18px] py-2 ${(window.__getTeacherLayerClass?.('popup') || 'z-[10040]')} overflow-hidden shadow-[0_24px_60px_rgba(2,6,23,0.4)]`}
                        style={getPowerMenuStyle()}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                            已选 {powerMenu.seatIds.length} 台
                        </div>
                        <button
                            onClick={() => openSeatDetail(seats.find(seat => seat.id === powerMenu.seatIds[0]))}
                            className="flex w-full items-center px-4 py-2 text-left text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                        >
                            <i className="fas fa-circle-info mr-2 w-5 text-center"></i>查看详细信息
                        </button>
                        <div className="my-1 h-px bg-white/10 mx-2"></div>
                        {POWER_CONTROL_ACTIONS.map(item => (
                            <button
                                key={item.action}
                                onClick={() => sendPowerControl(item.action, seats.filter(seat => powerMenu.seatIds.includes(seat.id)))}
                                className="flex w-full items-center px-4 py-2 text-left text-sm text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                            >
                                <i className={`fas ${item.icon} mr-2 w-5 text-center`}></i>{item.label}
                            </button>
                        ))}
                    </div>,
                    document.body
                )}

                {detailSeat && createPortal(
                    <div
                        className={`fixed inset-0 ${(window.__getTeacherLayerClass?.('modal') || 'z-[10020]')} flex items-center justify-center bg-black/65 p-6 backdrop-blur-sm`}
                        onClick={() => setDetailSeat(null)}
                    >
                        <div
                            className="teacher-glass-dark w-[92vw] max-w-lg rounded-[28px] border border-white/14 p-6 shadow-[0_28px_80px_rgba(2,6,23,0.45)]"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="mb-5 flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-sky-200/20 bg-sky-300/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-sky-100">
                                        <i className="fas fa-desktop"></i>
                                        {'\u8bbe\u5907\u8be6\u60c5'}
                                    </div>
                                    <h3 className="truncate text-xl font-black text-white">{detailSeat.name || '\u672a\u547d\u540d\u8bbe\u5907'}</h3>
                                    <p className="mt-1 text-sm text-slate-300">{onlineIPs.includes(detailSeat.ip) ? '\u5728\u7ebf' : '\u79bb\u7ebf'}</p>
                                </div>
                                <button onClick={() => setDetailSeat(null)} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-white/8 text-white/80 hover:bg-white/15">
                                    <i className="fas fa-xmark"></i>
                                </button>
                            </div>
                            <div className="grid gap-3 text-sm sm:grid-cols-2">
                                {[
                                    ['IP \u5730\u5740', detailSeat.ip || '-'],
                                    ['MAC \u5730\u5740', getSeatMac(detailSeat) || '-'],
                                    ['\u8bbe\u5907\u540d\u79f0', detailSeat.name || '-'],
                                    ['\u5b66\u53f7', detailSeat.studentId || '-'],
                                    ['\u5ea7\u4f4d\u884c\u5217', `${detailSeat.row || '-'} \u884c / ${detailSeat.col || '-'} \u5217`],
                                    ['\u5728\u7ebf\u72b6\u6001', onlineIPs.includes(detailSeat.ip) ? '\u5728\u7ebf' : '\u79bb\u7ebf'],
                                ].map(([label, value]) => (
                                    <div key={label} className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3">
                                        <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</div>
                                        <div className="break-all font-mono text-slate-100">{value}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>,
                    document.body
                )}

                {showClassroomMenu && createPortal(
                    <div
                        ref={classroomMenuPopupRef}
                        className={`teacher-glass-dark rounded-[22px] py-2 ${(window.__getTeacherLayerClass?.('popup') || 'z-[10040]')} overflow-hidden shadow-[0_24px_60px_rgba(2,6,23,0.4)]`}
                        style={getPopupStyle(classroomMenuRef, { width: 256, align: 'left' })}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-[0.18em]">班级列表</span>
                            <button
                                onClick={() => { setShowAddClassroom(true); setShowClassroomMenu(false); }}
                                className="text-xs text-sky-300 hover:text-white transition-colors"
                            >
                                <i className="fas fa-plus mr-1"></i>新建
                            </button>
                        </div>
                        {Object.entries(classrooms).map(([id, cls]) => (
                            <div
                                key={id}
                                onClick={() => handleSwitchClassroom(id)}
                                className={`px-3 py-2.5 flex items-center justify-between group transition-colors cursor-pointer ${
                                    id === currentClassroomId ? 'bg-sky-300/16 text-sky-100' : 'hover:bg-white/10 text-slate-300'
                                }`}
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="truncate text-sm font-medium">{cls.name}</div>
                                    <div className="mt-0.5 text-xs text-slate-400">{cls.seats?.length || 0} 个座位</div>
                                </div>
                                {id !== currentClassroomId && (
                                    <button
                                        onClick={(e) => handleDeleteClassroom(e, id)}
                                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all p-1"
                                        title="删除班级"
                                    >
                                        <i className="fas fa-trash-can text-xs"></i>
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>,
                    document.body
                )}

                {showMoreMenu && createPortal(
                    <div
                        ref={moreMenuPopupRef}
                        className={`teacher-glass-dark rounded-[22px] py-2 ${(window.__getTeacherLayerClass?.('popup') || 'z-[10040]')} overflow-hidden shadow-[0_24px_60px_rgba(2,6,23,0.4)]`}
                        style={getPopupStyle(moreMenuRef, { width: 208, align: 'right' })}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <input ref={fileInputRef} type="file" accept=".csv,.txt,.json" className="hidden" onChange={(e) => { handleImportFile(e); setShowMoreMenu(false); }} />
                        <button onClick={() => { fileInputRef.current && fileInputRef.current.click(); }} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors flex items-center">
                            <i className="fas fa-file-import w-5 mr-2 text-center"></i>导入列表
                        </button>
                        <button onClick={() => { handleExportCsv(); setShowMoreMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors flex items-center">
                            <i className="fas fa-table-list w-5 mr-2 text-center"></i>导出 CSV
                        </button>
                        <button onClick={() => { handleExportJson(); setShowMoreMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors flex items-center">
                            <i className="fas fa-file-export w-5 mr-2 text-center"></i>导出 JSON
                        </button>
                        <div className="h-px bg-white/10 my-1 mx-2"></div>
                        <button onClick={() => { handleDownloadTemplate(); setShowMoreMenu(false); }} className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition-colors flex items-center">
                            <i className="fas fa-download w-5 mr-2 text-center"></i>下载模板
                        </button>
                    </div>,
                    document.body
                )}
            </div>
            </div>

            {editingId && (
                <div className={`fixed inset-0 bg-black/55 backdrop-blur-md flex items-center justify-center ${(window.__getTeacherLayerClass?.('modal') || 'z-[10020]')}`} onClick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) setEditingId(null); }}>
                    <div className="teacher-glass-dark w-[92vw] max-w-md rounded-[30px] p-6 border border-white/14 shadow-[0_28px_80px_rgba(2,6,23,0.42)]">
                        <div className="mb-5 flex items-center gap-3">
                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/14 bg-white/10 text-sky-100">
                                <i className="fas fa-user-pen"></i>
                            </div>
                            <div>
                                <h3 className="text-lg font-black text-white">编辑座位信息</h3>
                                <p className="text-sm text-slate-300">更新学生姓名和学号，不会影响 IP 与座位位置。</p>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm text-slate-300 mb-1">学生姓名</label>
                                <input
                                    autoFocus
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    className="w-full rounded-2xl border border-white/14 bg-white/8 px-4 py-3 text-white placeholder-slate-400 outline-none focus:border-sky-300"
                                    placeholder="输入学生姓名"
                                    onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null); }}
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-slate-300 mb-1">学号</label>
                                <input
                                    value={editStudentId}
                                    onChange={e => setEditStudentId(e.target.value)}
                                    className="w-full rounded-2xl border border-white/14 bg-white/8 px-4 py-3 text-white placeholder-slate-400 outline-none focus:border-sky-300"
                                    placeholder="输入学号（可选）"
                                    onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditingId(null); }}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setEditingId(null)} className="teacher-liquid-button rounded-2xl px-4 py-2 text-sm transition-colors">取消</button>
                            <button onClick={commitEdit} className="teacher-liquid-primary rounded-2xl px-4 py-2 text-sm font-bold transition-colors">保存</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
