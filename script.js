"use strict";

const STORAGE_KEYS = {
  panelCollapsed: "wallpaper.panelCollapsed",
  widgetToggleState: "wallpaper.widgetToggles",
  memoItems: "wallpaper.memoItems",
  stickyNotes: "wallpaper.stickyNotes",
  stickyThemeRgb: "wallpaper.stickyThemeRgb",
  clockFormat24h: "wallpaper.clockFormat24h",
  clockPosition: "wallpaper.clockPosition",
  calendarPosition: "wallpaper.calendarPosition",
  widgetScales: "wallpaper.widgetScales",
  memoManagerCollapsed: "wallpaper.memoManagerCollapsed",
  musicWidgetPosition: "wallpaper.musicWidgetPosition",
};

const LONG_PRESS_MS = 100;
const DISABLE_MUSIC_WALLPAPER_SYSTEM = false;
const VISUALIZER_HEIGHT = 216;
const DEFAULT_VISUALIZER_SENSITIVITY = 7.5;

const DEFAULT_STICKY_RGB = { r: 255, g: 248, b: 191 };
const STICKY_BG_ALPHA = 0.92;
const STICKY_DRAG_ALPHA = 0.72;

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tues", "Wed", "Thurs", "Fri", "Sat"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SUPPORTS_POINTER_EVENTS = typeof window.PointerEvent === "function";
const cssEscape =
  window.CSS && typeof window.CSS.escape === "function"
    ? window.CSS.escape.bind(window.CSS)
    : (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");

const memoryStorageFallback = Object.create(null);

const safeStorage = {
  get(key) {
    try {
      return window.localStorage ? window.localStorage.getItem(key) : (memoryStorageFallback[key] ?? null);
    } catch (error) {
      return memoryStorageFallback[key] ?? null;
    }
  },
  set(key, value) {
    const stringValue = String(value);
    memoryStorageFallback[key] = stringValue;
    try {
      if (window.localStorage) {
        window.localStorage.setItem(key, stringValue);
      }
    } catch (error) {
      console.warn("localStorage 저장 실패, 메모리 저장소로 대체:", error);
    }
  },
  remove(key) {
    delete memoryStorageFallback[key];
    try {
      if (window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch (error) {
      console.warn("localStorage 삭제 실패:", error);
    }
  },
};

const backgroundLayer = document.getElementById("backgroundLayer");
const widgetToggles = Array.from(document.querySelectorAll('input[type="checkbox"][data-widget]'));

const clockWidget = document.getElementById("clockWidget");
const clockTime = document.getElementById("clockTime");
const clockDate = document.getElementById("clockDate");
const clockFormat12Button = document.getElementById("clockFormat12Button");
const clockFormat24Button = document.getElementById("clockFormat24Button");
const calendarWidget = document.getElementById("calendarWidget");
const calendarMonthLabel = document.getElementById("calendarMonthLabel");
const calendarGrid = document.getElementById("calendarGrid");

const memoManagerToggleButton = document.getElementById("memoManagerToggleButton");
const memoManagerPanel = document.getElementById("memoManagerPanel");
const addStickyNoteButton = document.getElementById("addStickyNoteButton");
const memoAdminList = document.getElementById("memoAdminList");
const stickyNotesRoot = document.getElementById("stickyNotesRoot");

const stickyColorToggleButton = document.getElementById("stickyColorToggleButton");
const rgbPaletteWidget = document.getElementById("rgbPaletteWidget");
const colorPaletteCanvas = document.getElementById("colorPaletteCanvas");
const rgbInputR = document.getElementById("rgbInputR");
const rgbInputG = document.getElementById("rgbInputG");
const rgbInputB = document.getElementById("rgbInputB");
const rgbApplyButton = document.getElementById("rgbApplyButton");
const rgbResetButton = document.getElementById("rgbResetButton");

const musicWidget = document.getElementById("musicWidget");
const visualizerDock = document.getElementById("visualizerDock");
const musicAlbumArt = document.getElementById("musicAlbumArt");
const musicAlbumPlaceholder = document.getElementById("musicAlbumPlaceholder");
const musicSongTitle = document.getElementById("musicSongTitle");
const musicArtistLine = document.getElementById("musicArtistLine");
const musicPlatformHint = document.getElementById("musicPlatformHint");
const visualizerCanvas = document.getElementById("visualizerCanvas");

const widgetElements = {
  clock: document.getElementById("clockWidget"),
  calendar: document.getElementById("calendarWidget"),
  memo: null,
};

let stickyNotes = [];
let clockIn24hMode = true;
let clockTimerId = null;
let renderedCalendarKey = "";
let nextStickyZ = 10;

const clockDragState = {
  pointerId: null,
  pressTimer: null,
  dragging: false,
  startX: 0,
  startY: 0,
  offsetX: 0,
  offsetY: 0,
};

const calendarDragState = {
  pointerId: null,
  pressTimer: null,
  dragging: false,
  startX: 0,
  startY: 0,
  offsetX: 0,
  offsetY: 0,
};

const widgetScaleState = {
  pointerId: null,
  pressTimer: null,
  active: false,
  widgetName: "",
  element: null,
  startX: 0,
  startY: 0,
  startScale: 1,
};

/* 크로미움 엔진 내부 포커스 강제 획득 및 대리 입력기 연결 처리 */
document.addEventListener("mousedown", function (e) {
    const target = e.target;
    // 메모장(TEXTAREA)이나 입력창(INPUT) 클릭 시
    if (target.tagName === "TEXTAREA" || target.tagName === "INPUT") {
        e.stopPropagation();

        // 기존에 선택되었던 강조 효과 제거
        document.querySelectorAll('.proxy-active').forEach(el => el.classList.remove('proxy-active'));

        // 현재 클릭한 창을 '입력 대상'으로 지정하고 강조 클래스 추가
        target.classList.add("proxy-active");

        // 포커스 강제 유지
        setTimeout(() => target.focus(), 10);
    }
}, { capture: true });


function initializeSafely() {
  const steps = [
    ["widget references", () => {
      widgetElements.memo = [memoManagerToggleButton, memoManagerPanel, stickyNotesRoot].filter(Boolean);
    }],
    ["memo manager state", restoreMemoManagerState],
    ["clock", initializeClock],
    ["calendar", initializeCalendar],
    ["widget scale controls", initializeWidgetScaleControls],
    ["wallpaper properties", initializeWallpaperProperties],
  ];

  steps.forEach(([label, step]) => runInitStep(label, step));

  if (!DISABLE_MUSIC_WALLPAPER_SYSTEM) {
    runInitStep("music wallpaper system", initializeMusicWallpaperSystem);
  } else if (musicPlatformHint) {
    musicPlatformHint.hidden = false;
    musicPlatformHint.textContent = "음악 시스템은 WE 호환성 진단을 위해 임시 비활성화되었습니다.";
  }

  runInitStep("bind events", bindEvents);
}

function runInitStep(label, step) {
  try {
    step();
  } catch (error) {
    console.error(`[Init:${label}]`, error);
  }
}

function bindEvents() {
  safeAddEventListener(memoManagerToggleButton, "click", () => {
    const shouldCollapse = !memoManagerPanel.classList.contains("is-collapsed");
    setMemoManagerCollapsed(shouldCollapse);
  });

  safeAddEventListener(clockFormat12Button, "click", () => {
    clockIn24hMode = false;
    safeStorage.set(STORAGE_KEYS.clockFormat24h, "false");
    syncClockFormatButtons();
    updateClockText();
  });

  safeAddEventListener(clockFormat24Button, "click", () => {
    clockIn24hMode = true;
    safeStorage.set(STORAGE_KEYS.clockFormat24h, "true");
    syncClockFormatButtons();
    updateClockText();
  });

  safeAddEventListener(addStickyNoteButton, "click", () => createStickyNote());

  safeAddEventListener(stickyColorToggleButton, "click", toggleRgbPaletteWidget);
  safeAddEventListener(rgbApplyButton, "click", applyRgbFromInputs);
  safeAddEventListener(rgbResetButton, "click", resetStickyColorTheme);
  addCompatPointerListener(colorPaletteCanvas, "pointerdown", onPalettePointerPick);

  initializeClockDrag();
  addCompatPointerListener(stickyNotesRoot, "pointerdown", onStickyNotesPointerDown, true);

  widgetToggles.forEach((toggle) => {
    safeAddEventListener(toggle, "change", () => {
      const widgetName = toggle.dataset.widget || "unknown-widget";
      const isEnabled = toggle.checked;

      persistToggleState();
      console.log(`[Widget Toggle] ${widgetName}: ${isEnabled ? "ON" : "OFF"}`);
      applyWidgetVisibility(widgetName, isEnabled);

      if (widgetName === "memo" && isEnabled) {
        renderMemoAdminList();
        stickyNotesRoot.querySelectorAll(".sticky-note-body").forEach((ta) => {
          requestAnimationFrame(() => updateStickyBodyScroll(ta));
        });
      }

    });
  });

  safeAddEventListener(window, "resize", () => {
    if (stickyNotesRoot) {
      stickyNotesRoot.querySelectorAll(".sticky-note-body").forEach((ta) => {
        requestAnimationFrame(() => updateStickyBodyScroll(ta));
      });
    }
    resizeVisualizerCanvas();
  });
}

function safeAddEventListener(target, type, handler, options) {
  if (!target || typeof target.addEventListener !== "function") {
    return () => {};
  }
  target.addEventListener(type, handler, options);
  return () => target.removeEventListener(type, handler, options);
}

function getWallpaperProperty(properties, ...names) {
  if (!properties) {
    return null;
  }

  for (const name of names) {
    if (properties[name]) {
      return properties[name];
    }
  }

  const propertyNames = Object.keys(properties);
  for (const name of names) {
    const lowerName = String(name).toLowerCase();
    const matchedKey = propertyNames.find((key) => key.toLowerCase() === lowerName);
    if (matchedKey) {
      return properties[matchedKey];
    }
  }

  return null;
}

function initializeWallpaperProperties() {
  window.wallpaperPropertyListener = {
    applyUserProperties(properties) {
      const backgroundProperty = getWallpaperProperty(properties, "custom_bg_image", "customBackground", "custombackground");
      const keyboardProxyProperty = getWallpaperProperty(properties, "keyboardProxy", "keyboardproxy");
      const initialStateProperty = getWallpaperProperty(properties, "initialStateJson", "initialstatejson");
      const clockEnabledProperty = getWallpaperProperty(properties, "clockEnabled", "clockenabled");
      const musicEnabledProperty = getWallpaperProperty(properties, "musicEnabled", "musicenabled");
      const calendarEnabledProperty = getWallpaperProperty(properties, "calendarEnabled", "calendarenabled");
      const clockFormatProperty = getWallpaperProperty(properties, "clockFormat24h", "clockformat24h");
      const visualizerEnabledProperty = getWallpaperProperty(properties, "visualizerEnabled", "visualizerenabled");
      const visualizerSensitivityProperty = getWallpaperProperty(properties, "visualizerSensitivity", "visualizersensitivity");

      if (backgroundProperty) {
        applyCustomBackground(backgroundProperty.value);
      }

      if (keyboardProxyProperty) {
        const targetInput = document.querySelector(".proxy-active") || document.querySelector(".sticky-note-body");
        if (targetInput) {
          targetInput.value = keyboardProxyProperty.value;
          targetInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }

      if (initialStateProperty) {
        applyInitialStateJson(initialStateProperty.value);
      }
      if (clockEnabledProperty) {
        applyWidgetVisibility("clock", parseWallpaperBool(clockEnabledProperty.value));
      }
      if (musicEnabledProperty) {
        applyWidgetVisibility("music", parseWallpaperBool(musicEnabledProperty.value));
      }
      if (calendarEnabledProperty) {
        applyWidgetVisibility("calendar", parseWallpaperBool(calendarEnabledProperty.value));
      }
      if (clockFormatProperty) {
        clockIn24hMode = parseWallpaperBool(clockFormatProperty.value);
        safeStorage.set(STORAGE_KEYS.clockFormat24h, String(clockIn24hMode));
        syncClockFormatButtons();
        updateClockText();
      }
      if (visualizerEnabledProperty) {
        setVisualizerEnabled(parseWallpaperBool(visualizerEnabledProperty.value));
      }
      if (visualizerSensitivityProperty) {
        setVisualizerSensitivity(
          parseWallpaperNumber(visualizerSensitivityProperty.value, DEFAULT_VISUALIZER_SENSITIVITY, 1, 24),
        );
      }
    },
  };
}
function applyCustomBackground(value) {
    if (!value) {
        backgroundLayer.innerHTML = "";
        backgroundLayer.style.backgroundImage = "none";
        backgroundLayer.classList.remove("has-image");
        document.body.classList.remove("has-custom-background");
        return;
    }

    // 1. WE가 넘겨준 기형적인 문자열(C%3A 등)을 정상적인 로컬 경로로 완전히 해독(디코딩)
    let decodedPath = "";
    try {
        decodedPath = decodeURIComponent(value);
    } catch (e) {
        decodedPath = value;
    }

    // 2. 윈도우 역슬래시(\)를 웹용 슬래시(/)로 통일
    decodedPath = decodedPath.replace(/\\/g, "/");

    // 3. 앞에 브라우저 로컬 파일 규격인 file:/// 이 없으면 강제 추가
    if (!decodedPath.startsWith("file://") && !decodedPath.startsWith("http")) {
        if (/^[a-zA-Z]:/.test(decodedPath)) {
            decodedPath = "file:///" + decodedPath; // C:/... 형태
        } else {
            decodedPath = "file://" + decodedPath;
        }
    }

    // 4. 깨끗해진 file:///C:/... 경로를 크로미움 img 태그가 읽을 수 있도록 한 번만 완벽하게 인코딩
    const safeUrl = encodeURI(decodedPath).replace(/#/g, "%23");

    // 화면 초기화 및 적용
    backgroundLayer.style.backgroundImage = "none";
    backgroundLayer.innerHTML = "";

    const bgImage = document.createElement("img");
    bgImage.src = safeUrl;
    bgImage.style.width = "100%";
    bgImage.style.height = "100%";
    bgImage.style.objectFit = "cover";
    bgImage.style.display = "block";

    backgroundLayer.appendChild(bgImage);
    backgroundLayer.classList.add("has-image");
    document.body.classList.add("has-custom-background");
}

function normalizeWallpaperFileUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "";
  }
  if (/^(file|https?):\/\//i.test(raw)) {
    return raw.replace(/\\/g, "/");
  }
  const normalized = raw.replace(/\\/g, "/");
  if (/^[a-zA-Z]:\//.test(normalized)) {
    return `file:///${normalized}`;
  }
  return normalized;
}

function createId(prefix = "id") {
  const randomPart = Math.random().toString(36).substring(2, 15);
  const timePart = Date.now().toString(36);
  return `${prefix}-${timePart}-${randomPart}`;
}

function parseWallpaperBool(value) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function parseWallpaperNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return clamp(parsed, min, max);
}

function applyInitialStateJson(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return;
  }

  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn("WE 초기 상태 JSON 파싱 실패:", error);
    return;
  }

  if (!parsed || typeof parsed !== "object") {
    return;
  }

  if (parsed.storage && typeof parsed.storage === "object") {
    Object.keys(parsed.storage).forEach((key) => {
      if (Object.values(STORAGE_KEYS).includes(key)) {
        safeStorage.set(key, parsed.storage[key]);
      }
    });
  }

  if (Array.isArray(parsed.stickyNotes)) {
    safeStorage.set(STORAGE_KEYS.stickyNotes, JSON.stringify(parsed.stickyNotes));
    loadStickyNotes();
    renderAllStickyNotes();
    renderMemoAdminList();
  }

  if (parsed.widgetToggleState && typeof parsed.widgetToggleState === "object") {
    safeStorage.set(STORAGE_KEYS.widgetToggleState, JSON.stringify(parsed.widgetToggleState));
    restoreToggleState();
  }
}

function addCompatPointerListener(target, pointerType, handler, options) {
  if (!target || typeof target.addEventListener !== "function") {
    console.warn(`[PointerEvent] ${pointerType} listener skipped: target missing`);
    return () => {};
  }
  if (SUPPORTS_POINTER_EVENTS) {
    target.addEventListener(pointerType, handler, options);
    return () => target.removeEventListener(pointerType, handler, options);
  }

  const mouseType = {
    pointerdown: "mousedown",
    pointermove: "mousemove",
    pointerup: "mouseup",
  }[pointerType];

  if (!mouseType) {
    return () => {};
  }

  target.addEventListener(mouseType, handler, options);
  return () => target.removeEventListener(mouseType, handler, options);
}

function addCompatDragListeners(onMove, onUp) {
  const removeMove = addCompatPointerListener(window, "pointermove", onMove);
  const removeUp = addCompatPointerListener(window, "pointerup", onUp);
  const removeCancel = SUPPORTS_POINTER_EVENTS
    ? addCompatPointerListener(window, "pointercancel", onUp)
    : () => {};
  return () => {
    removeMove();
    removeUp();
    removeCancel();
  };
}

function safeSetPointerCapture(element, pointerId) {
  if (element && typeof element.setPointerCapture === "function" && pointerId != null) {
    try {
      element.setPointerCapture(pointerId);
    } catch {
      /* ignore */
    }
  }
}

function safeReleasePointerCapture(element, pointerId) {
  if (element && typeof element.releasePointerCapture === "function" && pointerId != null) {
    try {
      element.releasePointerCapture(pointerId);
    } catch {
      /* ignore */
    }
  }
}

function observeElementResize(element, callback) {
  if (!element) {
    return () => {};
  }
  if (typeof ResizeObserver === "function") {
    const resizeObserver = new ResizeObserver(callback);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }

  let previousWidth = element.offsetWidth;
  let previousHeight = element.offsetHeight;
  const intervalId = window.setInterval(() => {
    const nextWidth = element.offsetWidth;
    const nextHeight = element.offsetHeight;
    if (nextWidth !== previousWidth || nextHeight !== previousHeight) {
      previousWidth = nextWidth;
      previousHeight = nextHeight;
      callback();
    }
  }, 250);
  return () => window.clearInterval(intervalId);
}

function setMemoManagerCollapsed(collapsed) {
  if (!memoManagerPanel || !memoManagerToggleButton) {
    return;
  }
  memoManagerPanel.classList.toggle("is-collapsed", collapsed);
  memoManagerToggleButton.setAttribute("aria-expanded", String(!collapsed));
  safeStorage.set(STORAGE_KEYS.memoManagerCollapsed, String(collapsed));
}

function restoreMemoManagerState() {
  const saved = safeStorage.get(STORAGE_KEYS.memoManagerCollapsed);
  if (saved === "true") {
    setMemoManagerCollapsed(true);
  }
}

function persistToggleState() {
  const state = {};
  widgetToggles.forEach((toggle) => {
    state[toggle.dataset.widget] = toggle.checked;
  });
  safeStorage.set(STORAGE_KEYS.widgetToggleState, JSON.stringify(state));
}

function restoreToggleState() {
  const raw = safeStorage.get(STORAGE_KEYS.widgetToggleState);
  if (!raw) {
    widgetToggles.forEach((toggle) => {
      applyWidgetVisibility(toggle.dataset.widget, toggle.checked);
    });
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    widgetToggles.forEach((toggle) => {
      const widgetName = toggle.dataset.widget;
      if (typeof parsed[widgetName] === "boolean") {
        toggle.checked = parsed[widgetName];
      }
      applyWidgetVisibility(widgetName, toggle.checked);
    });
  } catch (error) {
    console.warn("Widget toggle state 복원 실패:", error);
  }
}

function applyWidgetVisibility(widgetName, isEnabled) {
  if (widgetName === "music") {
    [musicWidget].forEach((el) => {
      if (el) {
        el.classList.toggle("hidden-widget", !isEnabled);
      }
    });
    return;
  }

  const target = widgetElements[widgetName];
  if (!target) {
    return;
  }
  if (Array.isArray(target)) {
    target.forEach((el) => el.classList.toggle("hidden-widget", !isEnabled));
  } else {
    target.classList.toggle("hidden-widget", !isEnabled);
  }
}

function initializeClock() {
  if (!clockWidget || !clockTime || !clockDate) {
    console.warn("시계 DOM을 찾을 수 없어 시계 초기화를 건너뜁니다.");
    return;
  }
  const savedFormat = safeStorage.get(STORAGE_KEYS.clockFormat24h);
  clockIn24hMode = savedFormat !== "false";
  syncClockFormatButtons();
  restoreClockPosition();
  updateClockText();
  clockTimerId = setInterval(updateClockText, 1000);
}

function syncClockFormatButtons() {
  if (clockFormat12Button) {
    clockFormat12Button.classList.toggle("active", !clockIn24hMode);
  }
  if (clockFormat24Button) {
    clockFormat24Button.classList.toggle("active", clockIn24hMode);
  }
}

function updateClockText() {
  const now = new Date();
  clockTime.textContent = formatClockTime(now, clockIn24hMode);
  clockDate.textContent = formatOrdinalEnglishDate(now);
  renderCalendar(now);
}

function ordinalSuffix(day) {
  const j = day % 10;
  const k = day % 100;
  if (j === 1 && k !== 11) return "st";
  if (j === 2 && k !== 12) return "nd";
  if (j === 3 && k !== 13) return "rd";
  return "th";
}

function formatOrdinalEnglishDate(date) {
  const w = WEEKDAYS_SHORT[date.getDay()];
  const m = MONTHS_SHORT[date.getMonth()];
  const d = date.getDate();
  const y = date.getFullYear();
  return `${w}, ${m} ${d}${ordinalSuffix(d)}, ${y}`;
}

function initializeCalendar() {
  renderCalendar(new Date(), true);
  restoreCalendarPosition();
  initializeCalendarDrag();
}

function renderCalendar(date = new Date(), force = false) {
  if (!calendarWidget || !calendarMonthLabel || !calendarGrid) {
    return;
  }

  const year = date.getFullYear();
  const month = date.getMonth();
  const todayKey = `${year}-${month}-${date.getDate()}`;
  const renderKey = `${year}-${month}-${todayKey}`;
  if (!force && renderedCalendarKey === renderKey) {
    return;
  }
  renderedCalendarKey = renderKey;

  calendarMonthLabel.textContent = `${MONTHS_SHORT[month]} ${year}`;
  calendarGrid.innerHTML = "";

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDay; i += 1) {
    const spacer = document.createElement("span");
    spacer.className = "calendar-day is-empty";
    spacer.setAttribute("aria-hidden", "true");
    calendarGrid.appendChild(spacer);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayDate = new Date(year, month, day);
    const dayEl = document.createElement("span");
    dayEl.className = "calendar-day";
    dayEl.textContent = String(day);
    if (dayDate.getDay() === 0 || dayDate.getDay() === 6) {
      dayEl.classList.add("is-weekend");
    }
    if (day === date.getDate()) {
      dayEl.classList.add("is-today");
      dayEl.setAttribute("aria-current", "date");
    }
    calendarGrid.appendChild(dayEl);
  }
}

function formatClockTime(date, use24h) {
  const minutes = String(date.getMinutes()).padStart(2, "0");
  if (use24h) {
    const hours = String(date.getHours()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  }

  let hours12 = date.getHours() % 12;
  if (hours12 === 0) {
    hours12 = 12;
  }
  const period = date.getHours() >= 12 ? "PM" : "AM";
  return `${hours12}:${minutes} ${period}`;
}

function initializeClockDrag() {
  if (!clockWidget) {
    return;
  }
  addCompatPointerListener(clockWidget, "pointerdown", onClockPointerDown);
  addCompatPointerListener(clockWidget, "pointermove", onClockPointerMove);
  addCompatPointerListener(clockWidget, "pointerup", onClockPointerUp);
  addCompatPointerListener(clockWidget, "pointercancel", onClockPointerUp);
}

function onClockPointerDown(event) {
  if (event.button !== 0 || event.target.closest(".widget-scale-corner")) {
    return;
  }
  clockDragState.pointerId = event.pointerId;
  clockDragState.startX = event.clientX;
  clockDragState.startY = event.clientY;
  clockDragState.offsetX = event.clientX - clockWidget.offsetLeft;
  clockDragState.offsetY = event.clientY - clockWidget.offsetTop;
  clockDragState.pressTimer = setTimeout(() => {
    clockDragState.dragging = true;
    clockWidget.classList.add("is-drag-ready", "is-dragging", "glass-drag-mode");
    safeSetPointerCapture(clockWidget, event.pointerId);
  }, LONG_PRESS_MS);
}

function onClockPointerMove(event) {
  if (clockDragState.pointerId !== event.pointerId) {
    return;
  }

  if (!clockDragState.dragging) {
    const moveDistance = Math.hypot(event.clientX - clockDragState.startX, event.clientY - clockDragState.startY);
    if (moveDistance > 8) {
      clearClockDragTimer();
    }
    return;
  }

  const maxLeft = Math.max(window.innerWidth - clockWidget.offsetWidth - 12, 0);
  const maxTop = Math.max(window.innerHeight - clockWidget.offsetHeight - 12, 0);
  const nextLeft = clamp(event.clientX - clockDragState.offsetX, 12, maxLeft);
  const nextTop = clamp(event.clientY - clockDragState.offsetY, 12, maxTop);

  clockWidget.style.left = `${nextLeft}px`;
  clockWidget.style.top = `${nextTop}px`;
  clockWidget.style.right = "auto";
  clockWidget.style.bottom = "auto";
}

function onClockPointerUp(event) {
  if (clockDragState.pointerId !== event.pointerId) {
    return;
  }

  if (clockDragState.dragging) {
    persistClockPosition();
  }
  clearClockDragState();
}

function clearClockDragTimer() {
  if (clockDragState.pressTimer) {
    clearTimeout(clockDragState.pressTimer);
    clockDragState.pressTimer = null;
  }
}

function clearClockDragState() {
  clearClockDragTimer();
  clockDragState.pointerId = null;
  clockDragState.dragging = false;
  clockWidget.classList.remove("is-drag-ready", "is-dragging", "glass-drag-mode");
}

function persistClockPosition() {
  const position = {
    left: clockWidget.style.left || "",
    top: clockWidget.style.top || "",
  };
  safeStorage.set(STORAGE_KEYS.clockPosition, JSON.stringify(position));
}

function restoreClockPosition() {
  const raw = safeStorage.get(STORAGE_KEYS.clockPosition);
  if (!raw) {
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed.left && parsed.top) {
      clockWidget.style.left = parsed.left;
      clockWidget.style.top = parsed.top;
      clockWidget.style.right = "auto";
      clockWidget.style.bottom = "auto";
    }
  } catch (error) {
    console.warn("Clock 위치 복원 실패:", error);
  }
}

function initializeCalendarDrag() {
  if (!calendarWidget) {
    return;
  }
  addCompatPointerListener(calendarWidget, "pointerdown", onCalendarPointerDown);
  addCompatPointerListener(calendarWidget, "pointermove", onCalendarPointerMove);
  addCompatPointerListener(calendarWidget, "pointerup", onCalendarPointerUp);
  addCompatPointerListener(calendarWidget, "pointercancel", onCalendarPointerUp);
}

function onCalendarPointerDown(event) {
  if (event.button !== 0 || event.target.closest(".widget-scale-corner")) {
    return;
  }
  calendarDragState.pointerId = event.pointerId;
  calendarDragState.startX = event.clientX;
  calendarDragState.startY = event.clientY;
  calendarDragState.offsetX = event.clientX - calendarWidget.offsetLeft;
  calendarDragState.offsetY = event.clientY - calendarWidget.offsetTop;
  calendarDragState.pressTimer = setTimeout(() => {
    calendarDragState.dragging = true;
    calendarWidget.classList.add("is-drag-ready", "is-dragging", "glass-drag-mode");
    safeSetPointerCapture(calendarWidget, event.pointerId);
  }, LONG_PRESS_MS);
}

function onCalendarPointerMove(event) {
  if (calendarDragState.pointerId !== event.pointerId) {
    return;
  }

  if (!calendarDragState.dragging) {
    const moveDistance = Math.hypot(event.clientX - calendarDragState.startX, event.clientY - calendarDragState.startY);
    if (moveDistance > 8) {
      clearCalendarDragTimer();
    }
    return;
  }

  const maxLeft = Math.max(window.innerWidth - calendarWidget.offsetWidth - 12, 0);
  const maxTop = Math.max(window.innerHeight - calendarWidget.offsetHeight - 12, 0);
  const nextLeft = clamp(event.clientX - calendarDragState.offsetX, 12, maxLeft);
  const nextTop = clamp(event.clientY - calendarDragState.offsetY, 12, maxTop);

  calendarWidget.style.left = `${nextLeft}px`;
  calendarWidget.style.top = `${nextTop}px`;
  calendarWidget.style.right = "auto";
  calendarWidget.style.bottom = "auto";
}

function onCalendarPointerUp(event) {
  if (calendarDragState.pointerId !== event.pointerId) {
    return;
  }

  if (calendarDragState.dragging) {
    persistCalendarPosition();
  }
  clearCalendarDragState();
}

function clearCalendarDragTimer() {
  if (calendarDragState.pressTimer) {
    clearTimeout(calendarDragState.pressTimer);
    calendarDragState.pressTimer = null;
  }
}

function clearCalendarDragState() {
  clearCalendarDragTimer();
  calendarDragState.pointerId = null;
  calendarDragState.dragging = false;
  calendarWidget.classList.remove("is-drag-ready", "is-dragging", "glass-drag-mode");
}

function persistCalendarPosition() {
  const position = {
    left: calendarWidget.style.left || "",
    top: calendarWidget.style.top || "",
  };
  safeStorage.set(STORAGE_KEYS.calendarPosition, JSON.stringify(position));
}

function restoreCalendarPosition() {
  const raw = safeStorage.get(STORAGE_KEYS.calendarPosition);
  if (!raw) {
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed.left && parsed.top) {
      calendarWidget.style.left = parsed.left;
      calendarWidget.style.top = parsed.top;
      calendarWidget.style.right = "auto";
      calendarWidget.style.bottom = "auto";
    }
  } catch (error) {
    console.warn("Calendar position restore failed:", error);
  }
}

function initializeWidgetScaleControls() {
  const scalableWidgets = [
    { name: "clock", element: clockWidget },
    { name: "calendar", element: calendarWidget },
    { name: "music", element: musicWidget },
  ];

  scalableWidgets.forEach(({ name, element }) => {
    if (!element || element.querySelector(".widget-scale-corner")) {
      return;
    }
    element.style.transformOrigin = "center center";
    const handle = document.createElement("span");
    handle.className = "widget-scale-corner";
    handle.setAttribute("aria-hidden", "true");
    handle.dataset.widgetScaleTarget = name;
    element.appendChild(handle);
    addCompatPointerListener(handle, "pointerdown", (event) => onWidgetScalePointerDown(event, name, element));
  });

  restoreWidgetScales();
}

function onWidgetScalePointerDown(event, widgetName, element) {
  if (event.button !== 0) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();

  widgetScaleState.pointerId = event.pointerId;
  widgetScaleState.active = false;
  widgetScaleState.widgetName = widgetName;
  widgetScaleState.element = element;
  widgetScaleState.startX = event.clientX;
  widgetScaleState.startY = event.clientY;
  widgetScaleState.startScale = getWidgetScale(element);

  widgetScaleState.pressTimer = setTimeout(() => {
    widgetScaleState.active = true;
    element.classList.add("is-scaling");
    safeSetPointerCapture(event.currentTarget, event.pointerId);
  }, LONG_PRESS_MS);

  const onMove = (moveEvent) => onWidgetScalePointerMove(moveEvent);
  const onUp = (upEvent) => onWidgetScalePointerUp(upEvent);
  widgetScaleState.cleanupDragListeners = addCompatDragListeners(onMove, onUp);
}

function onWidgetScalePointerMove(event) {
  if (event.pointerId !== widgetScaleState.pointerId) {
    return;
  }

  const dx = event.clientX - widgetScaleState.startX;
  const dy = event.clientY - widgetScaleState.startY;
  const distance = Math.max(dx, dy);

  if (!widgetScaleState.active) {
    if (Math.hypot(dx, dy) > 8) {
      clearWidgetScaleTimer();
    }
    return;
  }

  const nextScale = clamp(widgetScaleState.startScale + distance / 260, 0.65, 1.85);
  setWidgetScale(widgetScaleState.element, nextScale);
}

function onWidgetScalePointerUp(event) {
  if (event.pointerId !== widgetScaleState.pointerId) {
    return;
  }
  if (widgetScaleState.active) {
    persistWidgetScales();
  }
  clearWidgetScaleState();
}

function clearWidgetScaleTimer() {
  if (widgetScaleState.pressTimer) {
    clearTimeout(widgetScaleState.pressTimer);
    widgetScaleState.pressTimer = null;
  }
}

function clearWidgetScaleState() {
  clearWidgetScaleTimer();
  if (widgetScaleState.cleanupDragListeners) {
    widgetScaleState.cleanupDragListeners();
    widgetScaleState.cleanupDragListeners = null;
  }
  if (widgetScaleState.element) {
    widgetScaleState.element.classList.remove("is-scaling");
  }
  widgetScaleState.pointerId = null;
  widgetScaleState.active = false;
  widgetScaleState.widgetName = "";
  widgetScaleState.element = null;
}

function getWidgetScale(element) {
  const value = parseFloat(element.dataset.widgetScale || "1");
  return Number.isFinite(value) ? value : 1;
}

function setWidgetScale(element, scale) {
  if (!element) {
    return;
  }
  const normalized = clamp(scale, 0.65, 1.85);
  element.dataset.widgetScale = String(normalized);
  element.style.transform = `scale(${normalized})`;
}

function persistWidgetScales() {
  const scales = {};
  [
    ["clock", clockWidget],
    ["calendar", calendarWidget],
    ["music", musicWidget],
  ].forEach(([name, element]) => {
    if (element) {
      scales[name] = getWidgetScale(element);
    }
  });
  safeStorage.set(STORAGE_KEYS.widgetScales, JSON.stringify(scales));
}

function restoreWidgetScales() {
  const raw = safeStorage.get(STORAGE_KEYS.widgetScales);
  if (!raw) {
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    [
      ["clock", clockWidget],
      ["calendar", calendarWidget],
      ["music", musicWidget],
    ].forEach(([name, element]) => {
      if (element && typeof parsed[name] === "number") {
        setWidgetScale(element, parsed[name]);
      }
    });
  } catch (error) {
    console.warn("Widget scale restore failed:", error);
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function hsvToRgbBytes(h, s, v) {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) {
    [rp, gp, bp] = [c, x, 0];
  } else if (hh < 120) {
    [rp, gp, bp] = [x, c, 0];
  } else if (hh < 180) {
    [rp, gp, bp] = [0, c, x];
  } else if (hh < 240) {
    [rp, gp, bp] = [0, x, c];
  } else if (hh < 300) {
    [rp, gp, bp] = [x, 0, c];
  } else {
    [rp, gp, bp] = [c, 0, x];
  }
  return [Math.round((rp + m) * 255), Math.round((gp + m) * 255), Math.round((bp + m) * 255)];
}

function drawColorPalette() {
  const canvas = colorPaletteCanvas;
  if (!canvas || !canvas.getContext) {
    return;
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.createImageData(w, h);
  const { data } = imgData;
  let idx = 0;
  for (let y = 0; y < h; y++) {
    const sat = y / h;
    for (let x = 0; x < w; x++) {
      const hue = (x / w) * 360;
      const val = 1;
      const [r, g, b] = hsvToRgbBytes(hue, sat, val);
      data[idx++] = r;
      data[idx++] = g;
      data[idx++] = b;
      data[idx++] = 255;
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

function getRgbFromPaletteEvent(event) {
  const canvas = colorPaletteCanvas;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  const px = clamp(Math.floor((event.clientX - rect.left) * scaleX), 0, canvas.width - 1);
  const py = clamp(Math.floor((event.clientY - rect.top) * scaleY), 0, canvas.height - 1);
  const pixel = ctx.getImageData(px, py, 1, 1).data;
  return { r: pixel[0], g: pixel[1], b: pixel[2] };
}

function onPalettePointerPick(event) {
  event.preventDefault();
  const rgb = getRgbFromPaletteEvent(event);
  syncRgbInputsToRgb(rgb.r, rgb.g, rgb.b);
  applyStickyRgbTheme(rgb.r, rgb.g, rgb.b, { persist: true });
}

function toggleRgbPaletteWidget() {
  const nextHidden = !rgbPaletteWidget.hidden;
  rgbPaletteWidget.hidden = nextHidden;
  stickyColorToggleButton.setAttribute("aria-expanded", String(!nextHidden));
  if (!nextHidden) {
    syncRgbInputsToCurrentThemeOrDefault();
  }
}

function readRgbInputs() {
  const r = clamp(Number.parseInt(String(rgbInputR.value), 10) || 0, 0, 255);
  const g = clamp(Number.parseInt(String(rgbInputG.value), 10) || 0, 0, 255);
  const b = clamp(Number.parseInt(String(rgbInputB.value), 10) || 0, 0, 255);
  return { r, g, b };
}

function applyRgbFromInputs() {
  const { r, g, b } = readRgbInputs();
  syncRgbInputsToRgb(r, g, b);
  applyStickyRgbTheme(r, g, b, { persist: true });
}

function syncRgbInputsToRgb(r, g, b) {
  rgbInputR.value = String(r);
  rgbInputG.value = String(g);
  rgbInputB.value = String(b);
}

function getCurrentStickyRgbOrDefault() {
  const root = document.documentElement;
  const bg = getComputedStyle(root).getPropertyValue("--sticky-bg").trim();
  const match = bg.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (match) {
    return { r: Number(match[1]), g: Number(match[2]), b: Number(match[3]) };
  }
  return { ...DEFAULT_STICKY_RGB };
}

function syncRgbInputsToCurrentThemeOrDefault() {
  const raw = safeStorage.get(STORAGE_KEYS.stickyThemeRgb);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (
        typeof parsed.r === "number" &&
        typeof parsed.g === "number" &&
        typeof parsed.b === "number"
      ) {
        syncRgbInputsToRgb(
          clamp(Math.round(parsed.r), 0, 255),
          clamp(Math.round(parsed.g), 0, 255),
          clamp(Math.round(parsed.b), 0, 255),
        );
        return;
      }
    } catch {
      /* fall through */
    }
  }
  const cur = getCurrentStickyRgbOrDefault();
  syncRgbInputsToRgb(cur.r, cur.g, cur.b);
}

function stickyTextColorForBackground(r, g, b) {
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.55 ? "#1a1a1a" : "#f5f5f5";
}

function applyStickyRgbTheme(r, g, b, options = {}) {
  const { persist = false } = options;
  const rr = clamp(Math.round(r), 0, 255);
  const gg = clamp(Math.round(g), 0, 255);
  const bb = clamp(Math.round(b), 0, 255);
  const text = stickyTextColorForBackground(rr, gg, bb);
  const root = document.documentElement;
  root.style.setProperty("--sticky-bg", `rgba(${rr},${gg},${bb},${STICKY_BG_ALPHA})`);
  root.style.setProperty("--sticky-bg-drag", `rgba(${rr},${gg},${bb},${STICKY_DRAG_ALPHA})`);
  root.style.setProperty("--sticky-text", text);
  if (persist) {
    safeStorage.set(STORAGE_KEYS.stickyThemeRgb, JSON.stringify({ r: rr, g: gg, b: bb }));
  }
}

function resetStickyColorTheme() {
  document.documentElement.style.removeProperty("--sticky-bg");
  document.documentElement.style.removeProperty("--sticky-bg-drag");
  document.documentElement.style.removeProperty("--sticky-text");
  safeStorage.remove(STORAGE_KEYS.stickyThemeRgb);
  syncRgbInputsToRgb(DEFAULT_STICKY_RGB.r, DEFAULT_STICKY_RGB.g, DEFAULT_STICKY_RGB.b);
}

function restoreStickyThemeFromStorage() {
  const raw = safeStorage.get(STORAGE_KEYS.stickyThemeRgb);
  if (!raw) {
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed.r === "number" &&
      typeof parsed.g === "number" &&
      typeof parsed.b === "number"
    ) {
      applyStickyRgbTheme(parsed.r, parsed.g, parsed.b, { persist: false });
    }
  } catch (error) {
    console.warn("스티커 테마 복원 실패:", error);
  }
}

function updateStickyBodyScroll(textarea) {
  if (!textarea || !textarea.isConnected) {
    return;
  }
  const needsScroll = textarea.scrollHeight > textarea.clientHeight + 1;
  textarea.classList.toggle("sticky-note-body--scroll", needsScroll);
}

function loadStickyNotes() {
  const rawSticky = safeStorage.get(STORAGE_KEYS.stickyNotes);
  if (rawSticky) {
    try {
      const parsed = JSON.parse(rawSticky);
      if (Array.isArray(parsed)) {
        stickyNotes = parsed.filter((item) => item && typeof item.id === "string");
        stickyNotes.forEach(normalizeStickyNoteShape);
      }
    } catch (error) {
      console.warn("스티커 메모 복원 실패:", error);
    }
    migrateLegacyMemoItemsOnce();
    return;
  }

  migrateLegacyMemoItemsOnce();
}

function migrateLegacyMemoItemsOnce() {
  const rawLegacy = safeStorage.get(STORAGE_KEYS.memoItems);
  if (!rawLegacy || stickyNotes.length > 0) {
    persistStickyNotes();
    return;
  }
  try {
    const legacy = JSON.parse(rawLegacy);
    if (!Array.isArray(legacy)) {
      return;
    }
    let offset = 0;
    legacy.forEach((item) => {
      if (!item || typeof item.id !== "string" || typeof item.text !== "string") {
        return;
      }
      stickyNotes.push(
        normalizeStickyNoteShape({
          id: item.id,
          text: item.text,
          left: 120 + offset * 28,
          top: 140 + offset * 28,
          width: 260,
          height: 180,
          z: offset,
        }),
      );
      offset += 1;
    });
    safeStorage.remove(STORAGE_KEYS.memoItems);
    persistStickyNotes();
  } catch (error) {
    console.warn("레거시 메모 마이그레이션 실패:", error);
  }
}

function normalizeStickyNoteShape(note) {
  const w = Math.min(Math.max(note.width ?? 260, 180), window.innerWidth - 40);
  const h = Math.min(Math.max(note.height ?? 180, 120), window.innerHeight - 40);
  const maxLeft = window.innerWidth - w - 12;
  const maxTop = window.innerHeight - h - 12;
  note.left = clamp(note.left ?? 80, 12, Math.max(maxLeft, 12));
  note.top = clamp(note.top ?? 80, 12, Math.max(maxTop, 12));
  note.width = w;
  note.height = h;
  note.text = typeof note.text === "string" ? note.text : "";
  note.z = typeof note.z === "number" ? note.z : 0;
  return note;
}

function persistStickyNotes() {
  safeStorage.set(STORAGE_KEYS.stickyNotes, JSON.stringify(stickyNotes));
}

function createStickyNote(preset) {
  const id = preset?.id || createId("sticky");
  const count = stickyNotes.length;
  const note = normalizeStickyNoteShape({
    id,
    text: preset?.text ?? "",
    left: preset?.left ?? 60 + (count % 8) * 24,
    top: preset?.top ?? 120 + (count % 8) * 22,
    width: preset?.width ?? 268,
    height: preset?.height ?? 188,
    z: nextStickyZ++,
  });
  stickyNotes.push(note);
  persistStickyNotes();
  renderStickyNoteElement(note);
  renderMemoAdminList();
  return note;
}

function renderAllStickyNotes() {
  if (!stickyNotesRoot) {
    return;
  }
  stickyNotesRoot.innerHTML = "";
  stickyNotes.forEach(renderStickyNoteElement);
}

function findNoteById(id) {
  return stickyNotes.find((n) => n.id === id) || null;
}

function renderStickyNoteElement(noteData) {
  if (!stickyNotesRoot || !noteData) {
    return;
  }
  const existing = stickyNotesRoot.querySelector(`[data-sticky-id="${cssEscape(noteData.id)}"]`);
  if (existing) {
    existing.remove();
  }

  const wrapper = document.createElement("article");
  wrapper.className = "sticky-note draggable-widget";
  wrapper.dataset.stickyId = noteData.id;
  wrapper.style.left = `${noteData.left}px`;
  wrapper.style.top = `${noteData.top}px`;
  wrapper.style.width = `${noteData.width}px`;
  wrapper.style.height = `${noteData.height}px`;
  wrapper.style.zIndex = String(noteData.z ?? 1);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "sticky-note-close";
  closeBtn.textContent = "×";
  closeBtn.title = "이 메모 삭제";
  safeAddEventListener(closeBtn, "click", () => deleteStickyNote(noteData.id));

  const dragStrip = document.createElement("div");
  dragStrip.className = "sticky-drag-strip";
  dragStrip.title = "약 0.1초 누른 뒤 드래그로 이동";

  const bodyWrap = document.createElement("div");
  bodyWrap.className = "sticky-body-wrap";

  const textarea = document.createElement("textarea");
  textarea.className = "sticky-note-body";
  textarea.value = noteData.text;
  textarea.spellcheck = false;
  safeAddEventListener(textarea, "input", () => {
    noteData.text = textarea.value;
    persistStickyNotes();
    renderMemoAdminList();
    updateStickyBodyScroll(textarea);
  });

  const resize = document.createElement("div");
  resize.className = "sticky-resize-handle";
  resize.dataset.resizeFor = noteData.id;
  addCompatPointerListener(resize, "pointerdown", (event) => startStickyResize(event, noteData.id));

  bodyWrap.appendChild(textarea);
  wrapper.append(dragStrip, closeBtn, bodyWrap, resize);
  stickyNotesRoot.appendChild(wrapper);

  const scheduleScroll = () => {
    requestAnimationFrame(() => updateStickyBodyScroll(textarea));
  };
  scheduleScroll();
  observeElementResize(wrapper, scheduleScroll);
  addCompatPointerListener(
    wrapper,
    "pointerup",
    () => {
      scheduleScroll();
    },
    true,
  );
}

function deleteStickyNote(id) {
  stickyNotes = stickyNotes.filter((n) => n.id !== id);
  persistStickyNotes();
  const el = stickyNotesRoot ? stickyNotesRoot.querySelector(`[data-sticky-id="${cssEscape(id)}"]`) : null;
  if (el) {
    el.remove();
  }
  renderMemoAdminList();
}

function renderMemoAdminList() {
  if (!memoAdminList) {
    return;
  }
  memoAdminList.innerHTML = "";

  if (stickyNotes.length === 0) {
    const li = document.createElement("li");
    li.className = "memo-admin-item is-empty";
    li.textContent = "등록된 메모가 없습니다. 추가 버튼으로 노트를 만드세요.";
    memoAdminList.appendChild(li);
    return;
  }

  stickyNotes
    .slice()
    .sort((a, b) => String(b.id).localeCompare(String(a.id)))
    .forEach((note) => {
      const preview = note.text.trim() || "(내용 없음)";
      const short = preview.length > 140 ? `${preview.slice(0, 140)}…` : preview;
      const li = document.createElement("li");
      li.className = "memo-admin-item";
      li.textContent = short;
      memoAdminList.appendChild(li);
    });
}

/** Sticky: long-press drag + resize (capture-based) */

const stickyInteraction = new Map();

function onStickyNotesPointerDown(event) {
  const memoToggle = widgetToggles.find((t) => t.dataset.widget === "memo");
  if (!memoToggle || !memoToggle.checked) {
    return;
  }

  const noteEl = event.target.closest(".sticky-note");
  if (!noteEl) {
    return;
  }

  if (event.button !== 0) {
    return;
  }

  if (event.target.closest(".sticky-note-close")) {
    return;
  }

  if (event.target.closest(".sticky-resize-handle")) {
    return;
  }

  if (!event.target.closest(".sticky-drag-strip")) {
    return;
  }

  const id = noteEl.dataset.stickyId;
  const noteData = findNoteById(id);
  if (!noteData) {
    return;
  }

  bringStickyToFront(noteData, noteEl);

  const state = {
    pointerId: event.pointerId,
    pressTimer: null,
    dragging: false,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: event.clientX - noteData.left,
    offsetY: event.clientY - noteData.top,
    element: noteEl,
    noteData,
  };

  stickyInteraction.set(id, state);

  state.pressTimer = setTimeout(() => {
    state.dragging = true;
    noteEl.classList.add("is-drag-ready", "is-dragging");
    safeSetPointerCapture(noteEl, event.pointerId);
  }, LONG_PRESS_MS);

  const onMove = (e) => onStickyDragMove(id, e);
  const onUp = (e) => {
    if (state._cleanupDragListeners) {
      state._cleanupDragListeners();
      state._cleanupDragListeners = null;
    }
    onStickyDragEnd(id, e);
  };

  state._cleanupDragListeners = addCompatDragListeners(onMove, onUp);

  state._onMove = onMove;
  state._onUp = onUp;
}

function onStickyDragMove(id, event) {
  const state = stickyInteraction.get(id);
  if (!state || state.pointerId !== event.pointerId) {
    return;
  }

  if (!state.dragging) {
    const moveDistance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);
    if (moveDistance > 10) {
      clearStickyPressTimer(state);
    }
    return;
  }

  const { noteData } = state;
  const width = noteData.width;
  const height = noteData.height;
  const maxLeft = Math.max(window.innerWidth - width - 12, 0);
  const maxTop = Math.max(window.innerHeight - height - 12, 0);

  noteData.left = clamp(event.clientX - state.offsetX, 12, maxLeft);
  noteData.top = clamp(event.clientY - state.offsetY, 12, maxTop);

  state.element.style.left = `${noteData.left}px`;
  state.element.style.top = `${noteData.top}px`;
}

function onStickyDragEnd(id, event) {
  const state = stickyInteraction.get(id);
  if (!state || event.pointerId !== state.pointerId) {
    stickyInteraction.delete(id);
    return;
  }

  clearStickyPressTimer(state);

  if (state.dragging) {
    persistStickyNotes();
  }

  state.element.classList.remove("is-drag-ready", "is-dragging");

  try {
    safeReleasePointerCapture(state.element, state.pointerId);
  } catch {
    /* ignore */
  }

  stickyInteraction.delete(id);
}

function clearStickyPressTimer(state) {
  if (state.pressTimer) {
    clearTimeout(state.pressTimer);
    state.pressTimer = null;
  }
}

function bringStickyToFront(noteData, el) {
  noteData.z = nextStickyZ++;
  el.style.zIndex = String(noteData.z);
  persistStickyNotes();
}

/** Resize corner */

let resizeSession = null;

function startStickyResize(event, noteId) {
  event.preventDefault();
  event.stopPropagation();
  const memoToggle = widgetToggles.find((t) => t.dataset.widget === "memo");
  if (!memoToggle || !memoToggle.checked) {
    return;
  }

  const noteData = findNoteById(noteId);
  const el = stickyNotesRoot.querySelector(`[data-sticky-id="${cssEscape(noteId)}"]`);
  if (!noteData || !el) {
    return;
  }

  bringStickyToFront(noteData, el);

  resizeSession = {
    pointerId: event.pointerId,
    noteData,
    el,
    resizeHandle: event.currentTarget,
    startX: event.clientX,
    startY: event.clientY,
    startW: noteData.width,
    startH: noteData.height,
  };

  safeSetPointerCapture(event.currentTarget, event.pointerId);

  resizeSession.handlerMove = (e) => {
    if (e.pointerId !== resizeSession.pointerId) return;
    const dx = e.clientX - resizeSession.startX;
    const dy = e.clientY - resizeSession.startY;
    const nextW = Math.min(
      Math.max(resizeSession.startW + dx, 180),
      window.innerWidth - resizeSession.noteData.left - 12,
    );
    const nextH = Math.min(
      Math.max(resizeSession.startH + dy, 120),
      window.innerHeight - resizeSession.noteData.top - 12,
    );

    resizeSession.noteData.width = nextW;
    resizeSession.noteData.height = nextH;
    resizeSession.el.style.width = `${nextW}px`;
    resizeSession.el.style.height = `${nextH}px`;
  };

  resizeSession.handlerUp = (e) => {
    if (!resizeSession || e.pointerId !== resizeSession.pointerId) return;
    if (resizeSession.cleanupDragListeners) {
      resizeSession.cleanupDragListeners();
    }
    normalizeStickyNoteShape(resizeSession.noteData);
    resizeSession.el.style.width = `${resizeSession.noteData.width}px`;
    resizeSession.el.style.height = `${resizeSession.noteData.height}px`;
    persistStickyNotes();
    const ta = resizeSession.el.querySelector(".sticky-note-body");
    if (ta) {
      requestAnimationFrame(() => updateStickyBodyScroll(ta));
    }
    try {
      safeReleasePointerCapture(resizeSession.resizeHandle, resizeSession.pointerId);
    } catch {
      /* ignore */
    }
    resizeSession = null;
  };

  resizeSession.cleanupDragListeners = addCompatDragListeners(resizeSession.handlerMove, resizeSession.handlerUp);
}

const MUSIC_PLATFORM = {
  YOUTUBE_MUSIC: "youtube_music",
  SPOTIFY: "spotify",
  APPLE_MUSIC: "apple_music",
  SOUNDCLOUD: "soundcloud",
  SUNO: "suno",
  MELON: "melon",
  MUSIC_PLAYER: "music_player",
  YOUTUBE: "youtube",
};

const musicWallpaperState = {
  platform: null,
  title: "",
  artistRaw: "",
  thumbnail: "",
  isPlaying: false,
  visualizerEnabled: true,
  visualizerSensitivity: DEFAULT_VISUALIZER_SENSITIVITY,
  mediaIntegrationEnabled: true,
  weAudioRegistered: false,
};

const musicDragState = {
  pointerId: null,
  pressTimer: null,
  dragging: false,
  startX: 0,
  startY: 0,
  offsetX: 0,
  offsetY: 0,
};

function initializeMusicWallpaperSystem() {
  restoreMusicWidgetPosition();
  setupMusicWidgetDrag();
  resizeVisualizerCanvas();
  setVisualizerEnabled(musicWallpaperState.visualizerEnabled);
  registerWallpaperEngineIntegrations();
}

function collectWallpaperMediaSearchText(event) {
  if (!event || typeof event !== "object") {
    return "";
  }
  return [
    event.title,
    event.artist,
    event.albumTitle,
    event.subTitle,
    event.genres,
    event.contentType,
    event.url,
    event.source,
    event.app,
    event.appName,
    event.application,
    event.applicationName,
    event.player,
    event.playerName,
    event.owner,
    event.name,
  ]
    .filter((value) => value != null)
    .map((value) => String(value).toLowerCase())
    .join(" ");
}

function inferWallpaperMediaPlatform(event) {
  const combined = collectWallpaperMediaSearchText(event);
  const ct = (event.contentType || "").toLowerCase();

  if (combined.includes("youtube music")) {
    return MUSIC_PLATFORM.YOUTUBE_MUSIC;
  }

  if (combined.includes("spotify")) {
    return MUSIC_PLATFORM.SPOTIFY;
  }

  if (combined.includes("apple music") || combined.includes("music.apple") || combined.includes("itunes")) {
    return MUSIC_PLATFORM.APPLE_MUSIC;
  }

  if (combined.includes("soundcloud") || combined.includes("sound cloud")) {
    return MUSIC_PLATFORM.SOUNDCLOUD;
  }

  if (combined.includes("suno")) {
    return MUSIC_PLATFORM.SUNO;
  }

  if (combined.includes("melon") || combined.includes("멜론")) {
    return MUSIC_PLATFORM.MELON;
  }

  if (ct === "video") {
    if (combined.includes("youtube")) {
      return MUSIC_PLATFORM.YOUTUBE;
    }
    return null;
  }

  if (ct === "music") {
    return MUSIC_PLATFORM.MUSIC_PLAYER;
  }

  return null;
}

function formatYoutubeChannelArtist(raw) {
  if (!raw || !String(raw).trim()) {
    return "—";
  }
  const str = String(raw).trim();
  const parts = str
    .split(/[,，]|\s+·\s+| \u00B7 | \/ | \| |\s+&\s+|\s+feat\.|\s+ft\./i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 1) {
    return str;
  }
  return `${parts[0]} 등`;
}

function clearMusicDisplayForFiltered() {
  musicWallpaperState.platform = null;
  musicWallpaperState.title = "";
  musicWallpaperState.artistRaw = "";
  musicWallpaperState.thumbnail = "";
  musicSongTitle.textContent = "---";
  musicArtistLine.textContent = "---";
  musicAlbumArt.removeAttribute("src");
  musicAlbumArt.classList.add("is-hidden");
  musicAlbumPlaceholder.classList.remove("is-hidden");
  musicPlatformHint.hidden = false;
  musicPlatformHint.textContent =
    "YouTube Music · Spotify · Apple Music · SoundCloud · Suno · Melon · Windows media · YouTube만 표시합니다.";
}
function applyMusicMediaProperties(event) {
  const platform = inferWallpaperMediaPlatform(event);
  musicWallpaperState.platform = platform;

  if (!platform) {
    clearMusicDisplayForFiltered();
    return;
  }

  musicPlatformHint.hidden = true;
  musicWallpaperState.title = (event.title && String(event.title).trim()) || "—";
  musicWallpaperState.artistRaw = (event.artist && String(event.artist).trim()) || "—";

  const artistLine =
    platform === MUSIC_PLATFORM.YOUTUBE
      ? formatYoutubeChannelArtist(musicWallpaperState.artistRaw)
      : musicWallpaperState.artistRaw;

  musicSongTitle.textContent = musicWallpaperState.title;
  musicArtistLine.textContent = artistLine;
}

function applyMusicThumbnail(event) {
  if (!musicWallpaperState.platform) {
    return;
  }
  const thumb = event.thumbnail;
  if (!thumb || typeof thumb !== "string") {
    musicAlbumArt.removeAttribute("src");
    musicAlbumArt.classList.add("is-hidden");
    musicAlbumPlaceholder.classList.remove("is-hidden");
    return;
  }
  musicWallpaperState.thumbnail = thumb;
  musicAlbumArt.onload = () => {
    musicAlbumArt.classList.remove("is-hidden");
    musicAlbumPlaceholder.classList.add("is-hidden");
  };
  musicAlbumArt.onerror = () => {
    musicAlbumArt.classList.add("is-hidden");
    musicAlbumPlaceholder.classList.remove("is-hidden");
  };
  musicAlbumArt.src = thumb;
}

function wallpaperMediaPlaybackBridge(event) {
  const MI = window.wallpaperMediaIntegration;
  if (!MI) {
    musicWallpaperState.isPlaying = false;
    return;
  }
  const s = event.state;
  if (MI.PLAYBACK_PLAYING != null && s === MI.PLAYBACK_PLAYING) {
    musicWallpaperState.isPlaying = true;
    return;
  }
  if (MI.playback && MI.playback.PLAYING != null && s === MI.playback.PLAYING) {
    musicWallpaperState.isPlaying = true;
    return;
  }
  if (MI.PLAYBACK_PAUSED != null && s === MI.PLAYBACK_PAUSED) {
    musicWallpaperState.isPlaying = false;
    return;
  }
  if (MI.playback && MI.playback.PAUSED != null && s === MI.playback.PAUSED) {
    musicWallpaperState.isPlaying = false;
    return;
  }
  if (MI.PLAYBACK_STOPPED != null && s === MI.PLAYBACK_STOPPED) {
    musicWallpaperState.isPlaying = false;
    return;
  }
  if (MI.playback && MI.playback.STOPPED != null && s === MI.playback.STOPPED) {
    musicWallpaperState.isPlaying = false;
    return;
  }
  musicWallpaperState.isPlaying = false;
}

function wallpaperAudioVisualizerBridge(audioArray) {
    if (!musicWallpaperState.visualizerEnabled) return;
    if (!audioArray || audioArray.length < 128) return;
    const canvas = visualizerCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = window.innerWidth;
    const cssH = VISUALIZER_HEIGHT;

    if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
        resizeVisualizerCanvas();
    }

    // 초기화 (매 프레임)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const barCount = 64;
    const gap = 2;
    const barW = (cssW / barCount) - gap;

    for (let i = 0; i < barCount; i++) {
        const left = (i * cssW) / barCount + gap * 0.5;

        const sensitivity = musicWallpaperState.visualizerSensitivity;
        const hL = cssH * Math.min((audioArray[i] ?? 0) * sensitivity, 1);
        const hR = cssH * Math.min((audioArray[i + 64] ?? 0) * sensitivity, 1);
        const h = Math.max(hL, hR, 9);

        const grad = ctx.createLinearGradient(0, cssH, 0, cssH - h);
        grad.addColorStop(0, "rgba(134, 168, 255, 0.50)");
        grad.addColorStop(1, "rgba(93, 143, 255, 0.50)");

        ctx.fillStyle = grad;
        ctx.fillRect(left, cssH - h, Math.max(2, barW), h);
    }
}

function resizeVisualizerCanvas() {
  const canvas = visualizerCanvas;
  if (!canvas) {
    return;
  }
  if (visualizerDock) {
    visualizerDock.style.display = "flex";
    visualizerDock.style.visibility = "visible";
    visualizerDock.style.opacity = "1";
    visualizerDock.style.zIndex = "20";
    visualizerDock.style.bottom = "0";
    visualizerDock.style.height = `${VISUALIZER_HEIGHT}px`;
    visualizerDock.style.background = "rgba(6, 8, 20, 0)";
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = window.innerWidth;
  const cssH = VISUALIZER_HEIGHT;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;
}

function setVisualizerEnabled(enabled) {
  musicWallpaperState.visualizerEnabled = !!enabled;
  document.body.classList.toggle("has-music-visualizer", !!enabled);
  if (visualizerDock) {
    visualizerDock.classList.toggle("hidden-widget", !enabled);
    visualizerDock.style.display = enabled ? "flex" : "none";
    visualizerDock.style.visibility = enabled ? "visible" : "hidden";
    visualizerDock.style.opacity = enabled ? "1" : "0";
  }
  if (enabled) {
    resizeVisualizerCanvas();
    drawVisualizerIdleFrame();
  }
}

function setVisualizerSensitivity(value) {
  musicWallpaperState.visualizerSensitivity = clamp(Number(value) || DEFAULT_VISUALIZER_SENSITIVITY, 1, 24);
}

function drawVisualizerIdleFrame() {
  const canvas = visualizerCanvas;
  if (!canvas || !musicWallpaperState.visualizerEnabled) {
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const cssW = window.innerWidth;
  const cssH = VISUALIZER_HEIGHT;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "rgba(134, 168, 255, 0.50)";
  const barCount = 48;
  const barW = cssW / barCount - 2;
  for (let i = 0; i < barCount; i++) {
    const h = (4 + Math.sin(i * 0.8) * 2) * 3;
    ctx.fillRect((i * cssW) / barCount + 1, cssH - 8 - h, Math.max(2, barW), h);
  }
}

function registerWallpaperEngineIntegrations() {
  const inWallpaperEngine =
    typeof window.wallpaperRegisterMediaPropertiesListener === "function" ||
    typeof window.wallpaperRegisterAudioListener === "function";

  if (!inWallpaperEngine) {
    musicPlatformHint.hidden = false;
    musicPlatformHint.textContent =
      "브라우저 단독 실행 시 시스템 미디어·오디오 분석은 동작하지 않습니다. Wallpaper Engine에서 프로젝트를 열어 주세요.";
  } else {
    musicPlatformHint.hidden = true;
  }

  if (typeof window.wallpaperRegisterMediaStatusListener === "function") {
    window.wallpaperRegisterMediaStatusListener((event) => {
      musicWallpaperState.mediaIntegrationEnabled = !!event.enabled;
      if (!musicWallpaperState.mediaIntegrationEnabled) {
        musicPlatformHint.hidden = false;
        musicPlatformHint.textContent = "Wallpaper Engine 설정에서 미디어 연동을 켜면 곡 정보가 표시됩니다.";
      } else if (inWallpaperEngine) {
        musicPlatformHint.hidden = true;
      }
    });
  }

  if (typeof window.wallpaperRegisterMediaPropertiesListener === "function") {
    window.wallpaperRegisterMediaPropertiesListener(applyMusicMediaProperties);
  }

  if (typeof window.wallpaperRegisterMediaThumbnailListener === "function") {
    window.wallpaperRegisterMediaThumbnailListener(applyMusicThumbnail);
  }

  if (typeof window.wallpaperRegisterMediaPlaybackListener === "function") {
    window.wallpaperRegisterMediaPlaybackListener(wallpaperMediaPlaybackBridge);
  }

  if (typeof window.wallpaperRegisterAudioListener === "function" && !musicWallpaperState.weAudioRegistered) {
    window.wallpaperRegisterAudioListener(wallpaperAudioVisualizerBridge);
    musicWallpaperState.weAudioRegistered = true;
  }
}

function setupMusicWidgetDrag() {
  if (!musicWidget) {
    return;
  }
  addCompatPointerListener(musicWidget, "pointerdown", onMusicWidgetPointerDown);
  addCompatPointerListener(musicWidget, "pointermove", onMusicWidgetPointerMove);
  addCompatPointerListener(musicWidget, "pointerup", onMusicWidgetPointerUp);
  addCompatPointerListener(musicWidget, "pointercancel", onMusicWidgetPointerUp);
}

function onMusicWidgetPointerDown(event) {
  if (event.button !== 0 || event.target.closest(".widget-scale-corner") || !event.target.closest("#musicWidget")) {
    return;
  }
  musicDragState.pointerId = event.pointerId;
  musicDragState.startX = event.clientX;
  musicDragState.startY = event.clientY;
  musicDragState.offsetX = event.clientX - musicWidget.offsetLeft;
  musicDragState.offsetY = event.clientY - musicWidget.offsetTop;
  musicDragState.pressTimer = setTimeout(() => {
    musicDragState.dragging = true;
    musicWidget.classList.add("is-dragging");
    safeSetPointerCapture(musicWidget, event.pointerId);
  }, LONG_PRESS_MS);
}

function onMusicWidgetPointerMove(event) {
  if (musicDragState.pointerId !== event.pointerId) {
    return;
  }
  if (!musicDragState.dragging) {
    const moveDistance = Math.hypot(event.clientX - musicDragState.startX, event.clientY - musicDragState.startY);
    if (moveDistance > 8) {
      clearMusicDragTimer();
    }
    return;
  }
  const maxLeft = Math.max(window.innerWidth - musicWidget.offsetWidth - 12, 0);
  const maxTop = Math.max(window.innerHeight - musicWidget.offsetHeight - 12, 0);
  const nextLeft = clamp(event.clientX - musicDragState.offsetX, 12, maxLeft);
  const nextTop = clamp(event.clientY - musicDragState.offsetY, 12, maxTop);
  musicWidget.style.left = `${nextLeft}px`;
  musicWidget.style.top = `${nextTop}px`;
  musicWidget.style.right = "auto";
  musicWidget.style.bottom = "auto";
}

function onMusicWidgetPointerUp(event) {
  if (musicDragState.pointerId !== event.pointerId) {
    return;
  }
  if (musicDragState.dragging) {
    persistMusicWidgetPosition();
  }
  clearMusicDragState();
}

function clearMusicDragTimer() {
  if (musicDragState.pressTimer) {
    clearTimeout(musicDragState.pressTimer);
    musicDragState.pressTimer = null;
  }
}

function clearMusicDragState() {
  clearMusicDragTimer();
  musicDragState.pointerId = null;
  musicDragState.dragging = false;
  musicWidget.classList.remove("is-dragging");
}

function persistMusicWidgetPosition() {
  safeStorage.set(
    STORAGE_KEYS.musicWidgetPosition,
    JSON.stringify({
      left: musicWidget.style.left || "",
      top: musicWidget.style.top || "",
    }),
  );
}

function restoreMusicWidgetPosition() {
  const raw = safeStorage.get(STORAGE_KEYS.musicWidgetPosition);
  if (!raw) {
    return;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed.left && parsed.top) {
      musicWidget.style.left = parsed.left;
      musicWidget.style.top = parsed.top;
      musicWidget.style.right = "auto";
      musicWidget.style.bottom = "auto";
    }
  } catch (error) {
    console.warn("음악 위젯 위치 복원 실패:", error);
  }
}

initializeSafely();
