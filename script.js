"use strict";

const STORAGE_KEYS =
{
  clockFormat24h: "wallpaper.clockFormat24h",
  clockPosition: "wallpaper.clockPosition",
  calendarPosition: "wallpaper.calendarPosition",
  widgetScales: "wallpaper.widgetScales",
  musicWidgetPosition: "wallpaper.musicWidgetPosition",
};

const LONG_PRESS_MS = 100;
const DISABLE_MUSIC_WALLPAPER_SYSTEM = false;
const VISUALIZER_HEIGHT = 216;
const DEFAULT_VISUALIZER_SENSITIVITY = 7.5;

const WEEKDAYS_SHORT = ["Sun", "Mon", "Tues", "Wed", "Thurs", "Fri", "Sat"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SUPPORTS_POINTER_EVENTS = typeof window.PointerEvent === "function";

const memoryStorageFallback = Object.create(null);

const safeStorage =
{
    get(key)
    {
        try
        {
            return window.localStorage ? window.localStorage.getItem(key) : (memoryStorageFallback[key] ?? null);
        }
        catch (error)
        {
            return memoryStorageFallback[key] ?? null;
        }
    },
    set(key, value)
    {
        const stringValue = String(value);
        memoryStorageFallback[key] = stringValue;
        try
        {
            if (window.localStorage)
            {
                window.localStorage.setItem(key, stringValue);
            }
        }
        catch (error)
        {
            console.warn("localStorage save failed; using memory fallback.", error);
        }
    },
    remove(key)
    {
        delete memoryStorageFallback[key];
        try
        {
            if (window.localStorage)
            {
                window.localStorage.removeItem(key);
            }
        }
        catch (error)
        {
            console.warn("localStorage remove failed:", error);
        }
    },
};

const backgroundLayer = document.getElementById("backgroundLayer");

const clockWidget = document.getElementById("clockWidget");
const clockTime = document.getElementById("clockTime");
const clockDate = document.getElementById("clockDate");
const calendarWidget = document.getElementById("calendarWidget");
const calendarMonthLabel = document.getElementById("calendarMonthLabel");
const calendarGrid = document.getElementById("calendarGrid");

const musicWidget = document.getElementById("musicWidget");
const visualizerDock = document.getElementById("visualizerDock");
const musicAlbumArt = document.getElementById("musicAlbumArt");
const musicAlbumPlaceholder = document.getElementById("musicAlbumPlaceholder");
const musicSongTitle = document.getElementById("musicSongTitle");
const musicArtistLine = document.getElementById("musicArtistLine");
const musicPlatformHint = document.getElementById("musicPlatformHint");
const visualizerCanvas = document.getElementById("visualizerCanvas");

const widgetElements =
{
  clock: document.getElementById("clockWidget"),
  calendar: document.getElementById("calendarWidget"),
};

let clockIn24hMode = true;
let clockTimerId = null;
let renderedCalendarKey = "";

const clockDragState =
{
    pointerId: null,
    pressTimer: null,
    dragging: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
};

const calendarDragState =
{
    pointerId: null,
    pressTimer: null,
    dragging: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
};

const widgetScaleState =
{
    pointerId: null,
    pressTimer: null,
    active: false,
    widgetName: "",
    element: null,
    startX: 0,
    startY: 0,
    startScale: 1,
};

document.addEventListener("mousedown", function (e)
{
    const target = e.target;
    if (target.tagName === "TEXTAREA" || target.tagName === "INPUT")
    {
        e.stopPropagation();

        document.querySelectorAll('.proxy-active').forEach(el => el.classList.remove('proxy-active'));

        target.classList.add("proxy-active");

        setTimeout(() => target.focus(), 10);
    }
}, { capture: true });


function initializeSafely()
{
    const steps =
    [
        ["clock", initializeClock],
        ["calendar", initializeCalendar],
        ["widget scale controls", initializeWidgetScaleControls],
        ["wallpaper properties", initializeWallpaperProperties],
    ];

    steps.forEach(([label, step]) => runInitStep(label, step));

    if (!DISABLE_MUSIC_WALLPAPER_SYSTEM)
    {
        runInitStep("music wallpaper system", initializeMusicWallpaperSystem);
    }
    else if (musicPlatformHint)
    {
    musicPlatformHint.hidden = false;
    musicPlatformHint.textContent = "Music integration is temporarily disabled for WE compatibility diagnostics.";
    }

    runInitStep("bind events", bindEvents);
}

function runInitStep(label, step)
{
    try
    {
        step();
    }
    catch (error)
    {
        console.error(`[Init:${label}]`, error);
    }
}

function bindEvents()
{
    initializeClockDrag();

    safeAddEventListener(window, "resize", () =>
    {
        resizeVisualizerCanvas();
    });
}

function safeAddEventListener(target, type, handler, options)
{
    if (!target || typeof target.addEventListener !== "function")
    {
        return () => {};
    }
    target.addEventListener(type, handler, options);
    return () => target.removeEventListener(type, handler, options);
}

function getWallpaperProperty(properties, ...names)
{
    if (!properties)
    {
        return null;
    }

    for (const name of names)
    {
        if (properties[name])
        {
        return properties[name];
        }
    }

    const propertyNames = Object.keys(properties);

    for (const name of names)
    {
        const lowerName = String(name).toLowerCase();
        const matchedKey = propertyNames.find((key) => key.toLowerCase() === lowerName);
        if (matchedKey) {
        return properties[matchedKey];
        }
    }

  return null;
}

function initializeWallpaperProperties()
{
    window.wallpaperPropertyListener =
    {
        applyUserProperties(properties)
        {
        const backgroundProperty = getWallpaperProperty(properties, "custom_bg_image", "customBackground", "custombackground");
        const clockEnabledProperty = getWallpaperProperty(properties, "clockEnabled", "clockenabled");
        const musicEnabledProperty = getWallpaperProperty(properties, "musicEnabled", "musicenabled");
        const calendarEnabledProperty = getWallpaperProperty(properties, "calendarEnabled", "calendarenabled");
        const clockFormatProperty = getWallpaperProperty(properties, "clockFormat24h", "clockformat24h");
        const visualizerEnabledProperty = getWallpaperProperty(properties, "visualizerEnabled", "visualizerenabled");
        const visualizerSensitivityProperty = getWallpaperProperty(properties, "visualizerSensitivity", "visualizersensitivity");

            if (backgroundProperty)
            {
            applyCustomBackground(backgroundProperty.value);
            }

            if (clockEnabledProperty)
            {
                applyWidgetVisibility("clock", parseWallpaperBool(clockEnabledProperty.value));
            }

            if (musicEnabledProperty)
            {
                applyWidgetVisibility("music", parseWallpaperBool(musicEnabledProperty.value));
            }

            if (calendarEnabledProperty)
            {
                applyWidgetVisibility("calendar", parseWallpaperBool(calendarEnabledProperty.value));
            }

            if (clockFormatProperty)
            {
                clockIn24hMode = parseWallpaperBool(clockFormatProperty.value);
                safeStorage.set(STORAGE_KEYS.clockFormat24h, String(clockIn24hMode));
                updateClockText();
            }

            if (visualizerEnabledProperty)
            {
                setVisualizerEnabled(parseWallpaperBool(visualizerEnabledProperty.value));
            }

            if (visualizerSensitivityProperty)
            {
                setVisualizerSensitivity(parseWallpaperNumber(visualizerSensitivityProperty.value, DEFAULT_VISUALIZER_SENSITIVITY, 1, 24),);
            }
        },
    };
}

function applyCustomBackground(value)
{
    if (!value)
    {
        backgroundLayer.innerHTML = "";
        backgroundLayer.style.backgroundImage = "none";
        backgroundLayer.classList.remove("has-image");
        document.body.classList.remove("has-custom-background");
        return;
    }

    let decodedPath = "";

    try
    {
        decodedPath = decodeURIComponent(value);
    }
    catch (e)
    {
        decodedPath = value;
    }

    decodedPath = decodedPath.replace(/\\/g, "/");

    if (!decodedPath.startsWith("file://") && !decodedPath.startsWith("http"))
    {
        if (/^[a-zA-Z]:/.test(decodedPath))
        {
            decodedPath = "file:///" + decodedPath; 
        }
        else
        {
            decodedPath = "file://" + decodedPath;
        }
    }

    const safeUrl = encodeURI(decodedPath).replace(/#/g, "%23");

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

function parseWallpaperBool(value)
{
  return value === true || value === 1 || value === "1" || value === "true";
}

function parseWallpaperNumber(value, fallback, min, max)
{
    const parsed = Number(value);

    if (!Number.isFinite(parsed))
    {
        return fallback;
    }

    return clamp(parsed, min, max);
}

function addCompatPointerListener(target, pointerType, handler, options)
{
    if (!target || typeof target.addEventListener !== "function")
    {
        console.warn(`[PointerEvent] ${pointerType} listener skipped: target missing`);
        return () => {};
    }

    if (SUPPORTS_POINTER_EVENTS)
    {
        target.addEventListener(pointerType, handler, options);
        return () => target.removeEventListener(pointerType, handler, options);
    }

    const mouseType =
    {
        pointerdown: "mousedown",
        pointermove: "mousemove",
        pointerup: "mouseup",
    }[pointerType];

    if (!mouseType)
    {
        return () => {};
    }

    target.addEventListener(mouseType, handler, options);
    return () => target.removeEventListener(mouseType, handler, options);
}

function addCompatDragListeners(onMove, onUp)
{
    const removeMove = addCompatPointerListener(window, "pointermove", onMove);
    const removeUp = addCompatPointerListener(window, "pointerup", onUp);
    const removeCancel = SUPPORTS_POINTER_EVENTS
    ? addCompatPointerListener(window, "pointercancel", onUp)
        : () => { };

    return () =>
    {
        removeMove();
        removeUp();
        removeCancel();
    };
}

function safeSetPointerCapture(element, pointerId)
{
    if (element && typeof element.setPointerCapture === "function" && pointerId != null)
    {
        try
        {
            element.setPointerCapture(pointerId);
        }
        catch
        {
        /* ignore */
        }
    }
}

function safeReleasePointerCapture(element, pointerId)
{
    if (element && typeof element.releasePointerCapture === "function" && pointerId != null)
    {
        try
        {
            element.releasePointerCapture(pointerId);
        }
        catch
        {
        /* ignore */
        }
    }
}

function applyWidgetVisibility(widgetName, isEnabled)
{
    if (widgetName === "music")
    {
        [musicWidget].forEach((el) =>
        {
            if (el)
            {
                el.classList.toggle("hidden-widget", !isEnabled);
            }
        });

        return;
    }

    const target = widgetElements[widgetName];

    if (!target)
    {
        return;
    }

    if (Array.isArray(target))
    {
        target.forEach((el) => el.classList.toggle("hidden-widget", !isEnabled));
    }
    else
    {
        target.classList.toggle("hidden-widget", !isEnabled);
    }
}

function initializeClock()
{
    if (!clockWidget || !clockTime || !clockDate)
    {
        console.warn("Clock DOM is missing; skipping clock initialization.");
        return;
    }

    const savedFormat = safeStorage.get(STORAGE_KEYS.clockFormat24h);
    clockIn24hMode = savedFormat !== "false";
    restoreClockPosition();
    updateClockText();
    clockTimerId = setInterval(updateClockText, 1000);
}

function updateClockText()
{
    const now = new Date();
    clockTime.textContent = formatClockTime(now, clockIn24hMode);
    clockDate.textContent = formatOrdinalEnglishDate(now);
    renderCalendar(now);
}

function ordinalSuffix(day)
{
    const j = day % 10;
    const k = day % 100;

    if (j === 1 && k !== 11) return "st";
    if (j === 2 && k !== 12) return "nd";
    if (j === 3 && k !== 13) return "rd";

    return "th";
}

function formatOrdinalEnglishDate(date)
{
    const w = WEEKDAYS_SHORT[date.getDay()];
    const m = MONTHS_SHORT[date.getMonth()];
    const d = date.getDate();
    const y = date.getFullYear();

    return `${w}, ${m} ${d}${ordinalSuffix(d)}, ${y}`;
}

function initializeCalendar()
{
    renderCalendar(new Date(), true);
    restoreCalendarPosition();
    initializeCalendarDrag();
}

function renderCalendar(date = new Date(), force = false)
{
    if (!calendarWidget || !calendarMonthLabel || !calendarGrid)
    {
        return;
    }

    const year = date.getFullYear();
    const month = date.getMonth();
    const todayKey = `${year}-${month}-${date.getDate()}`;
    const renderKey = `${year}-${month}-${todayKey}`;

    if (!force && renderedCalendarKey === renderKey)
    {
        return;
    }

    renderedCalendarKey = renderKey;

    calendarMonthLabel.textContent = `${MONTHS_SHORT[month]} ${year}`;
    calendarGrid.innerHTML = "";

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i += 1)
    {
        const spacer = document.createElement("span");
        spacer.className = "calendar-day is-empty";
        spacer.setAttribute("aria-hidden", "true");
        calendarGrid.appendChild(spacer);
    }

    for (let day = 1; day <= daysInMonth; day += 1)
    {
        const dayDate = new Date(year, month, day);
        const dayEl = document.createElement("span");
        dayEl.className = "calendar-day";
        dayEl.textContent = String(day);

        if (dayDate.getDay() === 0 || dayDate.getDay() === 6)
        {
            dayEl.classList.add("is-weekend");
        }

        if (day === date.getDate())
        {
            dayEl.classList.add("is-today");
            dayEl.setAttribute("aria-current", "date");
        }

        calendarGrid.appendChild(dayEl);
    }
}

function formatClockTime(date, use24h)
{
    const minutes = String(date.getMinutes()).padStart(2, "0");

    if (use24h)
    {
        const hours = String(date.getHours()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");
        return `${hours}:${minutes}:${seconds}`;
    }

    let hours12 = date.getHours() % 12;

    if (hours12 === 0)
    {
        hours12 = 12;
    }

    const period = date.getHours() >= 12 ? "PM" : "AM";
    return `${hours12}:${minutes} ${period}`;
}

function initializeClockDrag()
{
    if (!clockWidget)
    {
        return;
    }

    addCompatPointerListener(clockWidget, "pointerdown", onClockPointerDown);
    addCompatPointerListener(clockWidget, "pointermove", onClockPointerMove);
    addCompatPointerListener(clockWidget, "pointerup", onClockPointerUp);
    addCompatPointerListener(clockWidget, "pointercancel", onClockPointerUp);
}

function onClockPointerDown(event)
{
    if (event.button !== 0 || event.target.closest(".widget-scale-corner"))
    {
        return;
    }

    clockDragState.pointerId = event.pointerId;
    clockDragState.startX = event.clientX;
    clockDragState.startY = event.clientY;
    clockDragState.offsetX = event.clientX - clockWidget.offsetLeft;
    clockDragState.offsetY = event.clientY - clockWidget.offsetTop;

    clockDragState.pressTimer = setTimeout(() =>
    {
        clockDragState.dragging = true;
        clockWidget.classList.add("is-drag-ready", "is-dragging", "glass-drag-mode");
        safeSetPointerCapture(clockWidget, event.pointerId);
    }, LONG_PRESS_MS);
}

function onClockPointerMove(event)
{
    if (clockDragState.pointerId !== event.pointerId)
    {
        return;
    }

    if (!clockDragState.dragging)
    {
        const moveDistance = Math.hypot(event.clientX - clockDragState.startX, event.clientY - clockDragState.startY);

        if (moveDistance > 8)
        {
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

function onClockPointerUp(event)
{
    if (clockDragState.pointerId !== event.pointerId)
    {
        return;
    }

    if (clockDragState.dragging)
    {
        persistClockPosition();
    }

    clearClockDragState();
}

function clearClockDragTimer()
{
    if (clockDragState.pressTimer)
    {
        clearTimeout(clockDragState.pressTimer);
        clockDragState.pressTimer = null;
    }
}

function clearClockDragState()
{
    clearClockDragTimer();
    clockDragState.pointerId = null;
    clockDragState.dragging = false;
    clockWidget.classList.remove("is-drag-ready", "is-dragging", "glass-drag-mode");
}

function persistClockPosition()
{
    const position =
    {
        left: clockWidget.style.left || "",
        top: clockWidget.style.top || "",
    };

    safeStorage.set(STORAGE_KEYS.clockPosition, JSON.stringify(position));
}

function restoreClockPosition()
{
    const raw = safeStorage.get(STORAGE_KEYS.clockPosition);
    if (!raw)
    {
        return;
    }

    try
    {
        const parsed = JSON.parse(raw);

        if (parsed.left && parsed.top)
        {
            clockWidget.style.left = parsed.left;
            clockWidget.style.top = parsed.top;
            clockWidget.style.right = "auto";
            clockWidget.style.bottom = "auto";
        }
    }
    catch (error)
    {
    console.warn("Clock position restore failed:", error);
    }
}

function initializeCalendarDrag()
{
    if (!calendarWidget)
    {
        return;
    }

    addCompatPointerListener(calendarWidget, "pointerdown", onCalendarPointerDown);
    addCompatPointerListener(calendarWidget, "pointermove", onCalendarPointerMove);
    addCompatPointerListener(calendarWidget, "pointerup", onCalendarPointerUp);
    addCompatPointerListener(calendarWidget, "pointercancel", onCalendarPointerUp);
}

function onCalendarPointerDown(event)
{
    if (event.button !== 0 || event.target.closest(".widget-scale-corner"))
    {
        return;
    }

    calendarDragState.pointerId = event.pointerId;
    calendarDragState.startX = event.clientX;
    calendarDragState.startY = event.clientY;
    calendarDragState.offsetX = event.clientX - calendarWidget.offsetLeft;
    calendarDragState.offsetY = event.clientY - calendarWidget.offsetTop;

    calendarDragState.pressTimer = setTimeout(() =>
    {
        calendarDragState.dragging = true;
        calendarWidget.classList.add("is-drag-ready", "is-dragging", "glass-drag-mode");
        safeSetPointerCapture(calendarWidget, event.pointerId);
    }, LONG_PRESS_MS);
}

function onCalendarPointerMove(event)
{
    if (calendarDragState.pointerId !== event.pointerId)
    {
        return;
    }

    if (!calendarDragState.dragging)
    {
        const moveDistance = Math.hypot(event.clientX - calendarDragState.startX, event.clientY - calendarDragState.startY);
        if (moveDistance > 8)
        {
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

function onCalendarPointerUp(event)
{
    if (calendarDragState.pointerId !== event.pointerId)
    {
        return;
    }

    if (calendarDragState.dragging)
    {
        persistCalendarPosition();
    }

    clearCalendarDragState();
}

function clearCalendarDragTimer()
{
    if (calendarDragState.pressTimer)
    {
        clearTimeout(calendarDragState.pressTimer);
        calendarDragState.pressTimer = null;
    }
}

function clearCalendarDragState()
{
    clearCalendarDragTimer();
    calendarDragState.pointerId = null;
    calendarDragState.dragging = false;
    calendarWidget.classList.remove("is-drag-ready", "is-dragging", "glass-drag-mode");
}

function persistCalendarPosition()
{
    const position =
    {
        left: calendarWidget.style.left || "",
        top: calendarWidget.style.top || "",
    };
    safeStorage.set(STORAGE_KEYS.calendarPosition, JSON.stringify(position));
}

function restoreCalendarPosition()
{
    const raw = safeStorage.get(STORAGE_KEYS.calendarPosition);

    if (!raw)
    {
        return;
    }
    try
    {
        const parsed = JSON.parse(raw);
        if (parsed.left && parsed.top)
        {
            calendarWidget.style.left = parsed.left;
            calendarWidget.style.top = parsed.top;
            calendarWidget.style.right = "auto";
            calendarWidget.style.bottom = "auto";
        }
    }
    catch (error)
    {
        console.warn("Calendar position restore failed:", error);
    }
}

function initializeWidgetScaleControls()
{
    const scalableWidgets =
    [
        { name: "clock", element: clockWidget },
        { name: "calendar", element: calendarWidget },
        { name: "music", element: musicWidget },
    ];

    scalableWidgets.forEach(({ name, element }) =>
    {
        if (!element || element.querySelector(".widget-scale-corner"))
        {
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

function onWidgetScalePointerDown(event, widgetName, element)
{
    if (event.button !== 0)
    {
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

    widgetScaleState.pressTimer = setTimeout(() =>
    {
        widgetScaleState.active = true;
        element.classList.add("is-scaling");
        safeSetPointerCapture(event.currentTarget, event.pointerId);
    }, LONG_PRESS_MS);

    const onMove = (moveEvent) => onWidgetScalePointerMove(moveEvent);
    const onUp = (upEvent) => onWidgetScalePointerUp(upEvent);
    widgetScaleState.cleanupDragListeners = addCompatDragListeners(onMove, onUp);
}

function onWidgetScalePointerMove(event)
{
    if (event.pointerId !== widgetScaleState.pointerId)
    {
        return;
    }

    const dx = event.clientX - widgetScaleState.startX;
    const dy = event.clientY - widgetScaleState.startY;
    const distance = Math.max(dx, dy);

    if (!widgetScaleState.active)
    {
        if (Math.hypot(dx, dy) > 8)
        {
            clearWidgetScaleTimer();
        }

        return;
    }

    const nextScale = clamp(widgetScaleState.startScale + distance / 260, 0.65, 1.85);
    setWidgetScale(widgetScaleState.element, nextScale);
}

function onWidgetScalePointerUp(event)
{
    if (event.pointerId !== widgetScaleState.pointerId)
    {
        return;
    }

    if (widgetScaleState.active)
    {
        persistWidgetScales();
    }

    clearWidgetScaleState();
}

function clearWidgetScaleTimer()
{
    if (widgetScaleState.pressTimer)
    {
      clearTimeout(widgetScaleState.pressTimer);
      widgetScaleState.pressTimer = null;
    }
}

function clearWidgetScaleState()
{
    clearWidgetScaleTimer();
    if (widgetScaleState.cleanupDragListeners)
    {
        widgetScaleState.cleanupDragListeners();
        widgetScaleState.cleanupDragListeners = null;
    }

    if (widgetScaleState.element)
    {
        widgetScaleState.element.classList.remove("is-scaling");
    }

    widgetScaleState.pointerId = null;
    widgetScaleState.active = false;
    widgetScaleState.widgetName = "";
    widgetScaleState.element = null;
}

function getWidgetScale(element)
{
    const value = parseFloat(element.dataset.widgetScale || "1");
    return Number.isFinite(value) ? value : 1;
}

function setWidgetScale(element, scale)
{
    if (!element)
    {
        return;
    }

    const normalized = clamp(scale, 0.65, 1.85);
    element.dataset.widgetScale = String(normalized);
    element.style.transform = `scale(${normalized})`;
}

function persistWidgetScales()
{
    const scales = {};
    [
        ["clock", clockWidget],
        ["calendar", calendarWidget],
        ["music", musicWidget],
    ].forEach(([name, element]) =>
    {
        if (element)
        {
            scales[name] = getWidgetScale(element);
        }
    });

    safeStorage.set(STORAGE_KEYS.widgetScales, JSON.stringify(scales));
}

function restoreWidgetScales()
{
    const raw = safeStorage.get(STORAGE_KEYS.widgetScales);
    if (!raw)
    {
        return;
    }

    try
    {
        const parsed = JSON.parse(raw);
        [
            ["clock", clockWidget],
            ["calendar", calendarWidget],
            ["music", musicWidget],
        ].forEach(([name, element]) =>
        {
            if (element && typeof parsed[name] === "number")
            {
                setWidgetScale(element, parsed[name]);
            }
        });
    }
    catch (error)
    {
        console.warn("Widget scale restore failed:", error);
    }
}

function clamp(value, min, max)
{
    return Math.min(Math.max(value, min), max);
}

const MUSIC_PLATFORM =
{
    YOUTUBE_MUSIC: "youtube_music",
    SPOTIFY: "spotify",
    APPLE_MUSIC: "apple_music",
    SOUNDCLOUD: "soundcloud",
    SUNO: "suno",
    MELON: "melon",
    MUSIC_PLAYER: "music_player",
    YOUTUBE: "youtube",
};

const musicWallpaperState =
{
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

const musicDragState =
{
    pointerId: null,
    pressTimer: null,
    dragging: false,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
};

function initializeMusicWallpaperSystem()
{
    restoreMusicWidgetPosition();
    setupMusicWidgetDrag();
    resizeVisualizerCanvas();
    setVisualizerEnabled(musicWallpaperState.visualizerEnabled);
    registerWallpaperEngineIntegrations();
}

function collectWallpaperMediaSearchText(event)
{
    if (!event || typeof event !== "object")
    {
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
    ].filter((value) => value != null)
        .map((value) => String(value).toLowerCase())
        .join(" ");
}

function firstMediaValue(source, names)
{
    if (!source || typeof source !== "object")
    {
        return "";
    }

    for (const name of names)
    {
        const value = source[name];

        if (Array.isArray(value))
        {
            const joined = value.map((item) => String(item || "").trim()).filter(Boolean).join(", ");

            if (joined)
            {
                return joined;
            }
        }
        else if (value != null && String(value).trim())
        {
            return String(value).trim();
        }
    }

    return "";
}

function inferWallpaperMediaPlatform(event)
{
    const combined = collectWallpaperMediaSearchText(event);
    const ct = (event.contentType || "").toLowerCase();

    if (combined.includes("youtube music"))
    {
        return MUSIC_PLATFORM.YOUTUBE_MUSIC;
    }

    if (combined.includes("spotify"))
    {
        return MUSIC_PLATFORM.SPOTIFY;
    }

    if (combined.includes("apple music") || combined.includes("music.apple") || combined.includes("itunes"))
    {
        return MUSIC_PLATFORM.APPLE_MUSIC;
    }

    if (combined.includes("soundcloud") || combined.includes("sound cloud"))
    {
        return MUSIC_PLATFORM.SOUNDCLOUD;
    }

    if (combined.includes("suno"))
    {
        return MUSIC_PLATFORM.SUNO;
    }

    if (combined.includes("melon") || combined.includes("硫쒕줎"))
    {
        return MUSIC_PLATFORM.MELON;
    }

    if (ct === "video")
    {
        if (combined.includes("youtube"))
        {
            return MUSIC_PLATFORM.YOUTUBE;
        }

        if (firstMediaValue(event, ["title", "artist", "albumTitle", "songTitle", "trackTitle", "track", "name"]))
        {
            return MUSIC_PLATFORM.MUSIC_PLAYER;
        }

        return null;
    }

    if (ct === "music")
    {
        return MUSIC_PLATFORM.MUSIC_PLAYER;
    }

    if (firstMediaValue(event, ["title", "artist", "albumTitle", "songTitle", "trackTitle", "track", "name"]))
    {
        return MUSIC_PLATFORM.MUSIC_PLAYER;
    }

    return null;
}

function formatYoutubeChannelArtist(raw)
{
    if (!raw || !String(raw).trim())
    {
        return "Unknown Artist";
    }
    const str = String(raw).trim();
    const parts = str
    .split(/[,|]|\s+\u00B7\s+| \/ |\s+&\s+|\s+feat\.|\s+ft\./i)
    .map((s) => s.trim())
        .filter(Boolean);

    if (parts.length <= 1)
    {
        return str;
    }

  return `${parts[0]} and others`;
}

function clearMusicDisplayForFiltered()
{
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
        "Waiting for media info from YouTube Music, Spotify, Apple Music, SoundCloud, Suno, Melon, Windows media, or YouTube.";
}

function applyMusicMediaProperties(event)
{
    const platform = inferWallpaperMediaPlatform(event);
    musicWallpaperState.platform = platform;

    if (!platform)
    {
        clearMusicDisplayForFiltered();
        return;
    }

    musicPlatformHint.hidden = true;
    musicWallpaperState.title = firstMediaValue(event, ["title", "songTitle", "trackTitle", "track", "name"]) || "Unknown Title";
    musicWallpaperState.artistRaw = firstMediaValue(event, ["artist", "artists", "albumArtist", "author", "creator", "channel"]) || "Unknown Artist";

    const artistLine =
        platform === MUSIC_PLATFORM.YOUTUBE
        ? formatYoutubeChannelArtist(musicWallpaperState.artistRaw)
        : musicWallpaperState.artistRaw;

    musicSongTitle.textContent = musicWallpaperState.title;
    musicArtistLine.textContent = artistLine;
}

function applyMusicThumbnail(event)
{
    const thumb = normalizeMediaThumbnail(event);

    if (!thumb || typeof thumb !== "string")
    {
        musicAlbumArt.removeAttribute("src");
        musicAlbumArt.classList.add("is-hidden");
        musicAlbumPlaceholder.classList.remove("is-hidden");
        return;
    }

    musicWallpaperState.thumbnail = thumb;
    musicAlbumArt.onload = () =>
    {
        musicAlbumArt.classList.remove("is-hidden");
        musicAlbumPlaceholder.classList.add("is-hidden");
    };

    musicAlbumArt.onerror = () =>
    {
        musicAlbumArt.classList.add("is-hidden");
        musicAlbumPlaceholder.classList.remove("is-hidden");
    };

    musicAlbumArt.src = thumb;
}

function normalizeMediaThumbnail(event)
{
    const raw =
        typeof event === "string"
        ? event
        : firstMediaValue(event, ["thumbnail", "image", "cover", "albumArt", "artwork", "url", "data"]);

    if (!raw)
    {
        return "";
    }

    const value = String(raw).trim();

    if (/^(data:image\/|file:|https?:)/i.test(value))
    {
        return value;
    }

    if (/^[a-zA-Z]:[\\/]/.test(value))
    {
        return `file:///${value.replace(/\\/g, "/")}`;
    }

    if (/^[A-Za-z0-9+/]+=*$/.test(value) && value.length > 128)
    {
        return `data:image/png;base64,${value}`;
    }

    return value;
}

function wallpaperMediaPlaybackBridge(event)
{
    const MI = window.wallpaperMediaIntegration;

    if (!MI)
    {
        musicWallpaperState.isPlaying = false;
        return;
    }

    const s = event.state;

    if (MI.PLAYBACK_PLAYING != null && s === MI.PLAYBACK_PLAYING)
    {
        musicWallpaperState.isPlaying = true;
        return;
    }

    if (MI.playback && MI.playback.PLAYING != null && s === MI.playback.PLAYING)
    {
        musicWallpaperState.isPlaying = true;
        return;
    }

    if (MI.PLAYBACK_PAUSED != null && s === MI.PLAYBACK_PAUSED)
    {
        musicWallpaperState.isPlaying = false;
        return;
    }

    if (MI.playback && MI.playback.PAUSED != null && s === MI.playback.PAUSED)
    {
        musicWallpaperState.isPlaying = false;
        return;
    }

    if (MI.PLAYBACK_STOPPED != null && s === MI.PLAYBACK_STOPPED)
    {
        musicWallpaperState.isPlaying = false;
        return;
    }

    if (MI.playback && MI.playback.STOPPED != null && s === MI.playback.STOPPED)
    {
        musicWallpaperState.isPlaying = false;
        return;
    }

    musicWallpaperState.isPlaying = false;
}

function wallpaperAudioVisualizerBridge(audioArray)
{
    if (!musicWallpaperState.visualizerEnabled) return;
    if (!audioArray || audioArray.length < 128) return;

    const canvas = visualizerCanvas;

    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = window.innerWidth;
    const cssH = VISUALIZER_HEIGHT;

    if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr))
    {
        resizeVisualizerCanvas();
    }

    // 珥덇린??(留??꾨젅??
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const barCount = 64;
    const gap = 2;
    const barW = (cssW / barCount) - gap;

    for (let i = 0; i < barCount; i++)
    {
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

function resizeVisualizerCanvas()
{
    const canvas = visualizerCanvas;

    if (!canvas)
    {
        return;
    }

    if (visualizerDock)
    {
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

function setVisualizerEnabled(enabled)
{
    musicWallpaperState.visualizerEnabled = !!enabled;
    document.body.classList.toggle("has-music-visualizer", !!enabled);

    if (visualizerDock)
    {
        visualizerDock.classList.toggle("hidden-widget", !enabled);
        visualizerDock.style.display = enabled ? "flex" : "none";
        visualizerDock.style.visibility = enabled ? "visible" : "hidden";
        visualizerDock.style.opacity = enabled ? "1" : "0";
    }

    if (enabled)
    {
        resizeVisualizerCanvas();
        drawVisualizerIdleFrame();
    }
}

function setVisualizerSensitivity(value)
{
    musicWallpaperState.visualizerSensitivity = clamp(Number(value) || DEFAULT_VISUALIZER_SENSITIVITY, 1, 24);
}

function drawVisualizerIdleFrame()
{
    const canvas = visualizerCanvas;

    if (!canvas || !musicWallpaperState.visualizerEnabled)
    {
        return;
    }

    const ctx = canvas.getContext("2d");

    if (!ctx)
    {
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

    for (let i = 0; i < barCount; i++)
    {
        const h = (4 + Math.sin(i * 0.8) * 2) * 3;
        ctx.fillRect((i * cssW) / barCount + 1, cssH - 8 - h, Math.max(2, barW), h);
    }
}

function registerWallpaperEngineIntegrations()
{
    const inWallpaperEngine =
        typeof window.wallpaperRegisterMediaPropertiesListener === "function" ||
        typeof window.wallpaperRegisterAudioListener === "function";

    if (!inWallpaperEngine) {
        musicPlatformHint.hidden = false;
        musicPlatformHint.textContent =
        "Browser preview cannot read system media or audio. Open this wallpaper in Wallpaper Engine.";
    }
    else
    {
        musicPlatformHint.hidden = true;
    }

    if (typeof window.wallpaperRegisterMediaStatusListener === "function")
    {
        window.wallpaperRegisterMediaStatusListener((event) => {
            const isEnabled =
                typeof event === "boolean"
                ? event
                : event && Object.prototype.hasOwnProperty.call(event, "enabled")
                    ? !!event.enabled
                    : true;

            musicWallpaperState.mediaIntegrationEnabled = isEnabled;

            if (!musicWallpaperState.mediaIntegrationEnabled)
            {
                musicPlatformHint.hidden = false;
                musicPlatformHint.textContent = "Enable media integration in Wallpaper Engine settings to show track info.";
            }
            else if (inWallpaperEngine)
            {
                musicPlatformHint.hidden = true;
            }
        });
    }

    if (typeof window.wallpaperRegisterMediaPropertiesListener === "function")
    {
        window.wallpaperRegisterMediaPropertiesListener(applyMusicMediaProperties);
    }

    if (typeof window.wallpaperRegisterMediaThumbnailListener === "function")
    {
        window.wallpaperRegisterMediaThumbnailListener(applyMusicThumbnail);
    }

    if (typeof window.wallpaperRegisterMediaPlaybackListener === "function")
    {
        window.wallpaperRegisterMediaPlaybackListener(wallpaperMediaPlaybackBridge);
    }

    if (typeof window.wallpaperRegisterAudioListener === "function" && !musicWallpaperState.weAudioRegistered)
    {
        window.wallpaperRegisterAudioListener(wallpaperAudioVisualizerBridge);
        musicWallpaperState.weAudioRegistered = true;
    }
}

function setupMusicWidgetDrag()
{
    if (!musicWidget)
    {
        return;
    }

    addCompatPointerListener(musicWidget, "pointerdown", onMusicWidgetPointerDown);
    addCompatPointerListener(musicWidget, "pointermove", onMusicWidgetPointerMove);
    addCompatPointerListener(musicWidget, "pointerup", onMusicWidgetPointerUp);
    addCompatPointerListener(musicWidget, "pointercancel", onMusicWidgetPointerUp);
}

function onMusicWidgetPointerDown(event)
{
    if (event.button !== 0 || event.target.closest(".widget-scale-corner") || !event.target.closest("#musicWidget"))
    {
        return;
    }

    musicDragState.pointerId = event.pointerId;
    musicDragState.startX = event.clientX;
    musicDragState.startY = event.clientY;
    musicDragState.offsetX = event.clientX - musicWidget.offsetLeft;
    musicDragState.offsetY = event.clientY - musicWidget.offsetTop;

    musicDragState.pressTimer = setTimeout(() =>
    {
        musicDragState.dragging = true;
        musicWidget.classList.add("is-dragging");
        safeSetPointerCapture(musicWidget, event.pointerId);
    }, LONG_PRESS_MS);
}

function onMusicWidgetPointerMove(event)
{
    if (musicDragState.pointerId !== event.pointerId)
    {
        return;
    }

    if (!musicDragState.dragging)
    {
        const moveDistance = Math.hypot(event.clientX - musicDragState.startX, event.clientY - musicDragState.startY);
        if (moveDistance > 8)
        {
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

function onMusicWidgetPointerUp(event)
{
    if (musicDragState.pointerId !== event.pointerId)
    {
        return;
    }

    if (musicDragState.dragging)
    {
        persistMusicWidgetPosition();
    }

    clearMusicDragState();
}

function clearMusicDragTimer()
{
    if (musicDragState.pressTimer)
    {
        clearTimeout(musicDragState.pressTimer);
        musicDragState.pressTimer = null;
    }
}

function clearMusicDragState()
{
    clearMusicDragTimer();
    musicDragState.pointerId = null;
    musicDragState.dragging = false;
    musicWidget.classList.remove("is-dragging");
}

function persistMusicWidgetPosition()
{
    safeStorage.set
    (
        STORAGE_KEYS.musicWidgetPosition,
        JSON.stringify
        ({
            left: musicWidget.style.left || "",
            top: musicWidget.style.top || "",
        }),
    );
}

function restoreMusicWidgetPosition()
{
    const raw = safeStorage.get(STORAGE_KEYS.musicWidgetPosition);

    if (!raw)
    {
        return;
    }

    try
    {
        const parsed = JSON.parse(raw);

        if (parsed.left && parsed.top)
        {
            musicWidget.style.left = parsed.left;
            musicWidget.style.top = parsed.top;
            musicWidget.style.right = "auto";
            musicWidget.style.bottom = "auto";
        }
    }
    catch (error)
    {
        console.warn("Music widget position restore failed:", error);
    }
}

initializeSafely();

