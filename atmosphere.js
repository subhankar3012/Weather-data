/**
 * ═══════════════════════════════════════════════════════════════
 * ATMOSPHERE.JS — Advanced Immersive Weather Rendering Engine v2
 * ═══════════════════════════════════════════════════════════════
 *
 * 4-Layer Architecture:
 *   Layer 0: Sky         — Sunrise/sunset-aware gradient + sun/moon/stars
 *   Layer 1: Weather     — Particles (rain, snow, clouds, fog, lightning)
 *   Layer 2: Effects     — Temp color grading + AQI overlay + humidity
 *   Layer 3: UI          — HTML/CSS adaptive glass cards (external)
 *
 * Key Feature: Uses REAL sunrise/sunset times from the API,
 *   converted to the searched city's local timezone.
 */

// ─── CANVAS SETUP ───────────────────────────────────────────
const canvas = document.getElementById('weather-canvas');
const ctx = canvas.getContext('2d');

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resizeCanvas();

// ─── ATMOSPHERE STATE ───────────────────────────────────────
const Atmosphere = {
    // API-sourced
    timezoneOffset: 0,
    weatherMain: '',
    weatherDesc: '',
    temperature: 25,
    humidity: 50,
    windSpeed: 0,
    windDeg: 0,
    sunrise: 0,
    sunset: 0,
    aqiValue: -1,           // -1 = unknown

    // Computed
    localHour: 12,
    sunriseHour: 6,
    sunsetHour: 18,
    timeSegment: 'day',

    // Performance
    performanceMode: false,

    // Animation
    animFrameId: null,
    running: false,

    // Particle pools
    raindrops: [],
    snowflakes: [],
    clouds: [],
    lightning: [],
    stars: [],

    // Previous state for transitions
    _prevWeather: '',
};

// ─── TIMEZONE RESOLVER ──────────────────────────────────────
function getCityLocalHour(timezoneOffset) {
    const now = new Date();
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    const cityMs = utcMs + (timezoneOffset * 1000);
    const cityDate = new Date(cityMs);
    return cityDate.getHours() + cityDate.getMinutes() / 60;
}

function unixToLocalHour(unixTimestamp, timezoneOffset) {
    const ms = (unixTimestamp + timezoneOffset) * 1000;
    const d = new Date(ms);
    return d.getUTCHours() + d.getUTCMinutes() / 60;
}

// ─── REAL SUNRISE/SUNSET TIME SEGMENTS ──────────────────────
function getTimeSegment(hour, sunriseH, sunsetH) {
    const dawnStart = sunriseH - 1;       // ~1h before sunrise
    const morningEnd = sunriseH + 3;      // ~3h after sunrise
    const eveningStart = sunsetH - 1.5;   // ~1.5h before sunset
    const nightStart = sunsetH + 0.5;     // ~30min after sunset

    if (hour >= dawnStart && hour < morningEnd) return 'morning';
    if (hour >= morningEnd && hour < eveningStart) return 'day';
    if (hour >= eveningStart && hour < nightStart) return 'evening';
    return 'night';
}

/**
 * Global API: Is the searched city currently in night mode?
 */
function isNightMode() {
    return Atmosphere.timeSegment === 'night';
}

// ─── SKY COLOR PALETTES ────────────────────────────────────
const SKY_PALETTES = {
    morning: [
        [26, 10, 45],     // deep purple top
        [74, 25, 66],     // magenta
        [212, 119, 107],  // warm coral
        [244, 164, 96],   // sandy orange horizon
    ],
    day: [
        [10, 22, 40],
        [30, 58, 95],
        [74, 144, 217],
        [135, 206, 235],
    ],
    evening: [
        [13, 13, 43],
        [74, 25, 66],
        [196, 78, 46],
        [244, 164, 96],
    ],
    night: [
        [2, 1, 17],
        [11, 17, 32],
        [13, 27, 62],
        [22, 41, 85],
    ],
};

function blendSkyPalettes(paletteA, paletteB, t) {
    return paletteA.map((colorA, i) => {
        const colorB = paletteB[i];
        return [
            Math.round(colorA[0] + (colorB[0] - colorA[0]) * t),
            Math.round(colorA[1] + (colorB[1] - colorA[1]) * t),
            Math.round(colorA[2] + (colorB[2] - colorA[2]) * t),
        ];
    });
}

function getSkyColorsForHour(hour) {
    const sr = Atmosphere.sunriseHour;
    const ss = Atmosphere.sunsetHour;

    const transitions = [
        { start: sr - 1, end: sr, from: 'night', to: 'morning' },
        { start: sr + 2.5, end: sr + 3.5, from: 'morning', to: 'day' },
        { start: ss - 2, end: ss - 1, from: 'day', to: 'evening' },
        { start: ss, end: ss + 0.5, from: 'evening', to: 'night' },
    ];

    for (const t of transitions) {
        if (hour >= t.start && hour < t.end) {
            const blend = (hour - t.start) / (t.end - t.start);
            return blendSkyPalettes(SKY_PALETTES[t.from], SKY_PALETTES[t.to], blend);
        }
    }

    const segment = getTimeSegment(hour, sr, ss);
    return SKY_PALETTES[segment];
}

// ─── SKY RENDERER ───────────────────────────────────────────
function drawSky(colors) {
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, `rgb(${colors[0].join(',')})`);
    grad.addColorStop(0.35, `rgb(${colors[1].join(',')})`);
    grad.addColorStop(0.65, `rgb(${colors[2].join(',')})`);
    grad.addColorStop(1, `rgb(${colors[3].join(',')})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ─── STARS ──────────────────────────────────────────────────
function initStars() {
    const count = Atmosphere.performanceMode ? 80 : 200;
    Atmosphere.stars = [];
    for (let i = 0; i < count; i++) {
        Atmosphere.stars.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height * 0.7,
            radius: Math.random() * 1.5 + 0.3,
            baseOpacity: Math.random() * 0.6 + 0.3,
            twinkleSpeed: Math.random() * 0.03 + 0.01,
            twinklePhase: Math.random() * Math.PI * 2,
        });
    }
}

function drawStars(opacity) {
    if (opacity <= 0) return;
    const time = performance.now() / 1000;
    Atmosphere.stars.forEach(star => {
        const twinkle = 0.5 + 0.5 * Math.sin(time * star.twinkleSpeed * 60 + star.twinklePhase);
        const alpha = star.baseOpacity * twinkle * opacity;
        ctx.beginPath();
        ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
    });
}

// ─── SUN RENDERER ───────────────────────────────────────────
function drawSun(hour) {
    const sr = Atmosphere.sunriseHour;
    const ss = Atmosphere.sunsetHour;
    if (hour < sr - 0.5 || hour > ss + 0.5) return;

    const dayLength = ss - sr;
    const sunProgress = (hour - sr) / dayLength;
    const sunX = canvas.width * (0.1 + Math.min(Math.max(sunProgress, 0), 1) * 0.8);
    const sunArc = Math.sin(Math.min(Math.max(sunProgress, 0), 1) * Math.PI);
    const sunY = canvas.height * (0.85 - sunArc * 0.7);

    let sunAlpha = 1;
    if (hour < sr) sunAlpha = (hour - (sr - 0.5)) * 2;
    else if (hour > ss) sunAlpha = ((ss + 0.5) - hour) * 2;
    if (sunAlpha <= 0) return;
    sunAlpha = Math.min(sunAlpha, 1);

    const radius = 35 + sunArc * 18;

    // Outer glow
    const glow = ctx.createRadialGradient(sunX, sunY, radius * 0.5, sunX, sunY, radius * 4);
    glow.addColorStop(0, `rgba(255, 200, 50, ${0.15 * sunAlpha})`);
    glow.addColorStop(0.5, `rgba(255, 150, 50, ${0.05 * sunAlpha})`);
    glow.addColorStop(1, 'rgba(255, 100, 0, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Sun body
    const bodyGrad = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, radius);
    bodyGrad.addColorStop(0, `rgba(255, 240, 180, ${sunAlpha})`);
    bodyGrad.addColorStop(0.7, `rgba(255, 200, 80, ${sunAlpha})`);
    bodyGrad.addColorStop(1, `rgba(255, 160, 20, ${0.6 * sunAlpha})`);
    ctx.beginPath();
    ctx.arc(sunX, sunY, radius, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrad;
    ctx.fill();
}

// ─── MOON RENDERER ──────────────────────────────────────────
function getMoonPhase() {
    const now = new Date();
    let r = now.getFullYear() % 100;
    r %= 19;
    if (r > 9) r -= 19;
    r = ((r * 11) % 30) + (now.getMonth() + 1) + now.getDate();
    if (now.getMonth() + 1 < 3) r += 2;
    r -= ((now.getFullYear() < 2000) ? 4 : 8.3);
    r = Math.floor(r + 0.5) % 30;
    return (r < 0) ? r + 30 : r;
}

function drawMoon(hour) {
    const ss = Atmosphere.sunsetHour;
    const sr = Atmosphere.sunriseHour;
    const isNight = hour >= ss || hour < sr;
    if (!isNight) return;

    let moonProgress;
    if (hour >= ss) moonProgress = (hour - ss) / (24 - ss + sr);
    else moonProgress = (hour + 24 - ss) / (24 - ss + sr);

    const moonX = canvas.width * (0.15 + moonProgress * 0.7);
    const moonArc = Math.sin(moonProgress * Math.PI);
    const moonY = canvas.height * (0.7 - moonArc * 0.55);
    const radius = 28;

    // Moon glow
    const glow = ctx.createRadialGradient(moonX, moonY, radius, moonX, moonY, radius * 3);
    glow.addColorStop(0, 'rgba(200, 220, 255, 0.1)');
    glow.addColorStop(1, 'rgba(200, 220, 255, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(moonX, moonY, radius * 3, 0, Math.PI * 2);
    ctx.fill();

    // Moon body
    ctx.beginPath();
    ctx.arc(moonX, moonY, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#e8e8f0';
    ctx.fill();

    // Phase shadow
    const phase = getMoonPhase();
    const shadowOffset = ((phase / 30) - 0.5) * radius * 2.5;
    ctx.beginPath();
    ctx.arc(moonX + shadowOffset, moonY, radius * 0.95, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(2, 1, 17, 0.9)';
    ctx.fill();
}

// ─── CLOUD SYSTEM ───────────────────────────────────────────
function createCloud(isStorm) {
    const baseWidth = Math.random() * 150 + 100;
    const baseHeight = baseWidth * 0.45;
    const numPuffs = Math.floor(Math.random() * 4) + 4;
    const puffs = [];
    for (let i = 0; i < numPuffs; i++) {
        puffs.push({
            offsetX: (Math.random() - 0.5) * baseWidth * 0.8,
            offsetY: (Math.random() - 0.3) * baseHeight * 0.6,
            radius: Math.random() * baseHeight * 0.4 + baseHeight * 0.25,
        });
    }
    return {
        x: Math.random() * (canvas.width + 400) - 200,
        y: Math.random() * (canvas.height * 0.35) + 20,
        baseWidth, baseHeight, puffs,
        speed: (Math.random() * 0.3 + 0.1),
        opacity: isStorm ? 0.7 : 0.45,
        dark: isStorm,
    };
}

function initClouds(count, isStorm) {
    Atmosphere.clouds = [];
    for (let i = 0; i < count; i++) Atmosphere.clouds.push(createCloud(isStorm));
}

function updateClouds() {
    const windFactor = Math.max(Atmosphere.windSpeed * 0.25, 0.2);
    Atmosphere.clouds.forEach(cloud => {
        cloud.x += cloud.speed * windFactor;
        if (cloud.x > canvas.width + cloud.baseWidth) {
            cloud.x = -cloud.baseWidth - 50;
            cloud.y = Math.random() * (canvas.height * 0.35) + 20;
        }
    });
}

function drawClouds() {
    const night = isNightMode();
    Atmosphere.clouds.forEach(cloud => {
        cloud.puffs.forEach(puff => {
            const px = cloud.x + puff.offsetX;
            const py = cloud.y + puff.offsetY;
            const grad = ctx.createRadialGradient(px, py, 0, px, py, puff.radius);
            if (cloud.dark) {
                grad.addColorStop(0, `rgba(40, 40, 50, ${cloud.opacity})`);
                grad.addColorStop(0.6, `rgba(30, 30, 40, ${cloud.opacity * 0.6})`);
                grad.addColorStop(1, 'rgba(20, 20, 30, 0)');
            } else if (night) {
                grad.addColorStop(0, `rgba(60, 65, 80, ${cloud.opacity})`);
                grad.addColorStop(0.6, `rgba(40, 45, 60, ${cloud.opacity * 0.5})`);
                grad.addColorStop(1, 'rgba(30, 35, 50, 0)');
            } else {
                grad.addColorStop(0, `rgba(220, 225, 240, ${cloud.opacity})`);
                grad.addColorStop(0.6, `rgba(200, 210, 230, ${cloud.opacity * 0.4})`);
                grad.addColorStop(1, 'rgba(180, 190, 210, 0)');
            }
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(px, py, puff.radius, 0, Math.PI * 2);
            ctx.fill();
        });
    });
}

// ─── RAIN SYSTEM ────────────────────────────────────────────
function initRain(count) {
    Atmosphere.raindrops = [];
    const c = Atmosphere.performanceMode ? Math.floor(count * 0.5) : count;
    for (let i = 0; i < c; i++) {
        Atmosphere.raindrops.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            length: Math.random() * 18 + 8,
            speed: Math.random() * 4 + 3,
            opacity: Math.random() * 0.35 + 0.15,
            width: Math.random() * 1.2 + 0.4,
        });
    }
}

function updateRain() {
    const windAngle = (Atmosphere.windDeg * Math.PI) / 180;
    const windInfluence = Math.min(Atmosphere.windSpeed * 0.25, 4);
    Atmosphere.raindrops.forEach(drop => {
        drop.y += drop.speed;
        drop.x += Math.sin(windAngle) * windInfluence;
        if (drop.y > canvas.height) { drop.y = -drop.length; drop.x = Math.random() * (canvas.width + 200) - 100; }
        if (drop.x > canvas.width + 50) drop.x = -50;
        if (drop.x < -50) drop.x = canvas.width + 50;
    });
}

function drawRain() {
    const windAngle = (Atmosphere.windDeg * Math.PI) / 180;
    const windInfluence = Math.min(Atmosphere.windSpeed * 0.15, 3);
    Atmosphere.raindrops.forEach(drop => {
        ctx.beginPath();
        ctx.moveTo(drop.x, drop.y);
        ctx.lineTo(drop.x + Math.sin(windAngle) * windInfluence * 2, drop.y + drop.length);
        ctx.strokeStyle = `rgba(174, 194, 224, ${drop.opacity})`;
        ctx.lineWidth = drop.width;
        ctx.stroke();
    });
}

// ─── SNOW SYSTEM ────────────────────────────────────────────
function initSnow(count) {
    Atmosphere.snowflakes = [];
    const c = Atmosphere.performanceMode ? Math.floor(count * 0.5) : count;
    for (let i = 0; i < c; i++) {
        Atmosphere.snowflakes.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            radius: Math.random() * 3 + 1,
            speed: Math.random() * 1.5 + 0.5,
            drift: Math.random() * 0.5 - 0.25,
            opacity: Math.random() * 0.5 + 0.3,
            wobblePhase: Math.random() * Math.PI * 2,
            wobbleSpeed: Math.random() * 0.02 + 0.005,
        });
    }
}

function updateSnow() {
    const windInfluence = Math.cos(Atmosphere.windDeg * Math.PI / 180) * Atmosphere.windSpeed * 0.12;
    Atmosphere.snowflakes.forEach(flake => {
        flake.y += flake.speed;
        flake.wobblePhase += flake.wobbleSpeed;
        flake.x += flake.drift + Math.sin(flake.wobblePhase) * 0.3 + windInfluence;
        if (flake.y > canvas.height + 5) { flake.y = -5; flake.x = Math.random() * canvas.width; }
        if (flake.x > canvas.width + 10) flake.x = -10;
        if (flake.x < -10) flake.x = canvas.width + 10;
    });
}

function drawSnow() {
    Atmosphere.snowflakes.forEach(flake => {
        ctx.beginPath();
        ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${flake.opacity})`;
        ctx.fill();
    });
}

// ─── LIGHTNING SYSTEM ───────────────────────────────────────
let lastLightningTime = 0;
let screenFlashAlpha = 0;

function createLightningBolt() {
    const startX = Math.random() * canvas.width;
    const segments = [];
    let x = startX, y = 0;
    while (y < canvas.height * 0.7) {
        const nextX = x + (Math.random() - 0.5) * 60;
        const nextY = y + Math.random() * 30 + 15;
        segments.push({ x1: x, y1: y, x2: nextX, y2: nextY });
        x = nextX; y = nextY;
        if (Math.random() < 0.2) {
            segments.push({ x1: x, y1: y, x2: x + (Math.random() - 0.5) * 80, y2: y + Math.random() * 40 + 20, branch: true });
        }
    }
    return { segments, life: 30, maxLife: 30, alpha: 1 };
}

function updateLightning() {
    const now = performance.now();
    if (now - lastLightningTime > (Math.random() * 4000 + 2000)) {
        Atmosphere.lightning.push(createLightningBolt());
        lastLightningTime = now;
        screenFlashAlpha = 0.15;
    }
    screenFlashAlpha *= 0.9;
    if (screenFlashAlpha < 0.01) screenFlashAlpha = 0;
    Atmosphere.lightning = Atmosphere.lightning.filter(bolt => {
        bolt.life--;
        bolt.alpha = bolt.life / bolt.maxLife;
        return bolt.life > 0;
    });
}

function drawLightning() {
    if (screenFlashAlpha > 0) {
        ctx.fillStyle = `rgba(200, 200, 255, ${screenFlashAlpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    Atmosphere.lightning.forEach(bolt => {
        bolt.segments.forEach(seg => {
            ctx.beginPath();
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
            ctx.strokeStyle = `rgba(200, 200, 255, ${bolt.alpha * (seg.branch ? 0.4 : 0.8)})`;
            ctx.lineWidth = seg.branch ? 1 : (Math.random() * 2 + 1.5);
            ctx.shadowColor = `rgba(150, 150, 255, ${bolt.alpha * 0.5})`;
            ctx.shadowBlur = 10;
            ctx.stroke();
        });
    });
    ctx.shadowBlur = 0;
}

// ─── FOG / MIST / HAZE / SMOKE ─────────────────────────────
function drawFogOverlay(type) {
    let color, alpha;
    switch (type) {
        case 'fog': case 'mist': color = [220, 225, 235]; alpha = 0.25; break;
        case 'haze': case 'smoke': color = [180, 170, 130]; alpha = 0.18; break;
        default: return;
    }
    if (Atmosphere.performanceMode) {
        ctx.fillStyle = `rgba(${color.join(',')}, ${alpha * 0.5})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        return;
    }
    for (let i = 0; i < 3; i++) {
        const yOffset = canvas.height * (0.3 + i * 0.2);
        const bandH = canvas.height * 0.4;
        const grad = ctx.createLinearGradient(0, yOffset - bandH / 2, 0, yOffset + bandH / 2);
        grad.addColorStop(0, `rgba(${color.join(',')}, 0)`);
        grad.addColorStop(0.4, `rgba(${color.join(',')}, ${alpha * 0.6})`);
        grad.addColorStop(0.6, `rgba(${color.join(',')}, ${alpha * 0.8})`);
        grad.addColorStop(1, `rgba(${color.join(',')}, 0)`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, yOffset - bandH / 2, canvas.width, bandH);
    }
    ctx.fillStyle = `rgba(${color.join(',')}, ${alpha * 0.3})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ─── TEMPERATURE COLOR GRADING ──────────────────────────────
function drawTemperatureOverlay(temp) {
    let color, alpha;
    if (temp > 35) {
        color = [255, 100, 0];
        alpha = 0.06 + Math.min((temp - 35) * 0.005, 0.06);
    } else if (temp > 20) {
        return;
    } else if (temp > 5) {
        color = [100, 150, 255];
        alpha = 0.03 + (20 - temp) * 0.002;
    } else {
        color = [80, 130, 255];
        alpha = 0.08 + Math.min((5 - temp) * 0.004, 0.08);
    }
    ctx.fillStyle = `rgba(${color.join(',')}, ${alpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ─── AQI VISUAL OVERLAY ────────────────────────────────────
function drawAQIOverlay(aqi) {
    if (aqi <= 0 || aqi <= 50) return; // Good — no overlay
    let color, alpha;
    if (aqi <= 100) {
        color = [180, 170, 130]; alpha = 0.04;
    } else if (aqi <= 200) {
        color = [180, 160, 100]; alpha = 0.10;
    } else {
        color = [150, 140, 90]; alpha = 0.18;
    }
    ctx.fillStyle = `rgba(${color.join(',')}, ${alpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

// ─── HUMIDITY EFFECT ────────────────────────────────────────
function drawHumidityOverlay(humidity) {
    if (humidity > 80) {
        // High humidity: soft warm glow at bottom
        const grad = ctx.createLinearGradient(0, canvas.height * 0.6, 0, canvas.height);
        grad.addColorStop(0, 'rgba(200, 200, 220, 0)');
        grad.addColorStop(1, `rgba(200, 200, 220, ${0.04 + (humidity - 80) * 0.002})`);
        ctx.fillStyle = grad;
        ctx.fillRect(0, canvas.height * 0.6, canvas.width, canvas.height * 0.4);
    }
    // Low humidity: no effect (natural sharpness)
}

// ─── WEATHER INITIALIZATION ─────────────────────────────────
function initWeatherParticles(weather) {
    Atmosphere.raindrops = [];
    Atmosphere.snowflakes = [];
    Atmosphere.clouds = [];
    Atmosphere.lightning = [];
    const w = weather.toLowerCase();
    if (w === 'thunderstorm') { initRain(400); initClouds(8, true); lastLightningTime = performance.now(); }
    else if (w === 'rain') { initRain(450); initClouds(5, false); }
    else if (w === 'drizzle') { initRain(180); initClouds(4, false); }
    else if (w === 'snow') { initSnow(350); initClouds(3, false); }
    else if (w === 'clouds') { initClouds(7, false); }
    else if (w === 'mist' || w === 'fog' || w === 'haze' || w === 'smoke') { initClouds(3, false); }
}

// ─── UPDATE LOOP ────────────────────────────────────────────
function updateAll() {
    const w = Atmosphere.weatherMain.toLowerCase();
    if (w === 'rain' || w === 'drizzle' || w === 'thunderstorm') updateRain();
    if (w === 'thunderstorm') updateLightning();
    if (w === 'snow') updateSnow();
    if (Atmosphere.clouds.length > 0) updateClouds();
}

// ─── DRAW LOOP ──────────────────────────────────────────────
function drawAll() {
    const hour = Atmosphere.localHour;
    const w = Atmosphere.weatherMain.toLowerCase();

    // Layer 0: Sky
    drawSky(getSkyColorsForHour(hour));

    // Stars
    let starOpacity = 0;
    const sr = Atmosphere.sunriseHour;
    const ss = Atmosphere.sunsetHour;
    if (hour >= ss + 0.5 || hour < sr - 1) starOpacity = 1;
    else if (hour >= sr - 1 && hour < sr) starOpacity = 1 - (hour - (sr - 1));
    else if (hour >= ss && hour < ss + 0.5) starOpacity = (hour - ss) * 2;
    drawStars(starOpacity);

    // Celestial
    if (w === 'clear' || w === '') {
        drawSun(hour);
        drawMoon(hour);
    } else if (w === 'clouds') {
        ctx.globalAlpha = 0.4;
        drawSun(hour);
        drawMoon(hour);
        ctx.globalAlpha = 1;
    }

    // Layer 1: Weather
    drawClouds();
    if (w === 'rain' || w === 'drizzle' || w === 'thunderstorm') drawRain();
    if (w === 'thunderstorm') drawLightning();
    if (w === 'snow') drawSnow();
    if (w === 'mist' || w === 'fog' || w === 'haze' || w === 'smoke') drawFogOverlay(w);

    // Layer 2: Effects
    drawTemperatureOverlay(Atmosphere.temperature);
    drawAQIOverlay(Atmosphere.aqiValue);
    drawHumidityOverlay(Atmosphere.humidity);
}

// ─── ANIMATION LOOP ─────────────────────────────────────────
function atmosphereLoop() {
    Atmosphere.localHour = getCityLocalHour(Atmosphere.timezoneOffset);
    Atmosphere.timeSegment = getTimeSegment(Atmosphere.localHour, Atmosphere.sunriseHour, Atmosphere.sunsetHour);
    updateAll();
    drawAll();
    applyThemeMode();
    Atmosphere.animFrameId = requestAnimationFrame(atmosphereLoop);
}

function startAtmosphere() {
    if (Atmosphere.running) return;
    Atmosphere.running = true;
    if (Atmosphere.stars.length === 0) initStars();
    atmosphereLoop();
}

function stopAtmosphere() {
    if (Atmosphere.animFrameId) {
        cancelAnimationFrame(Atmosphere.animFrameId);
        Atmosphere.animFrameId = null;
    }
    Atmosphere.running = false;
}

// ─── THEME MODE (DAY/NIGHT CSS) ────────────────────────────
let _lastAppliedMode = null;

function applyThemeMode() {
    const mode = isNightMode() ? 'night' : 'day';
    if (mode === _lastAppliedMode) return;
    _lastAppliedMode = mode;

    document.body.classList.remove('day-mode', 'night-mode');
    document.body.classList.add(mode + '-mode');

    // Wet-glass effect for rain
    updateWetGlass();

    // Dispatch event for chart/map listeners
    window.dispatchEvent(new CustomEvent('atmosphere-theme-change', { detail: { mode } }));
}

// ─── WET-GLASS RAIN EFFECT ─────────────────────────────────
function updateWetGlass() {
    let overlay = document.getElementById('wet-glass-overlay');
    const w = Atmosphere.weatherMain.toLowerCase();
    const shouldShow = (w === 'rain' || w === 'thunderstorm' || w === 'drizzle');

    if (shouldShow) {
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'wet-glass-overlay';
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                pointer-events: none; z-index: 1;
                backdrop-filter: blur(1.5px); -webkit-backdrop-filter: blur(1.5px);
                background: linear-gradient(180deg, rgba(100,130,180,0.03) 0%, rgba(100,130,180,0.06) 100%);
                transition: opacity 1s ease;
            `;
            document.body.appendChild(overlay);
        }
        overlay.style.opacity = '1';
    } else if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 1000);
    }
}

// ─── AI SMART SUGGESTIONS ───────────────────────────────────
function generateSmartSuggestions(data, aqiValue, forecastData) {
    const suggestions = [];
    const cityName = data.name || 'this area';
    const temp = data.main.temp;
    const feelsLike = data.main.feels_like;
    const weather = data.weather[0].main.toLowerCase();
    const wind = data.wind.speed;
    const humidity = data.main.humidity;
    const hour = Atmosphere.localHour;
    const timeOfDay = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : hour < 20 ? 'evening' : 'tonight';

    // Priority 1: Severe weather
    if (weather === 'thunderstorm') {
        suggestions.push({ icon: '⛈️', text: `Thunderstorm active in ${cityName}. Stay indoors and avoid open areas.`, priority: 1, type: 'severe' });
    }
    if (wind > 15) {
        suggestions.push({ icon: '🌪️', text: `Very strong winds (${(wind * 3.6).toFixed(0)} km/h). Secure loose objects.`, priority: 1, type: 'severe' });
    }

    // Priority 2: AQI warnings
    if (aqiValue > 200) {
        suggestions.push({ icon: '😷', text: `Hazardous air quality (AQI ${aqiValue}). Wear N95 mask outdoors.`, priority: 2, type: 'warning' });
    } else if (aqiValue > 150) {
        suggestions.push({ icon: '🫁', text: `Unhealthy air quality detected (AQI ${aqiValue}). Limit outdoor activity.`, priority: 2, type: 'warning' });
    }

    // Priority 3: Rain/umbrella
    if (weather === 'rain' || weather === 'drizzle') {
        suggestions.push({ icon: '☂️', text: `Carry an umbrella in ${cityName} this ${timeOfDay}.`, priority: 3, type: 'info' });
    }
    if (weather === 'snow') {
        suggestions.push({ icon: '🧥', text: `Snowfall in ${cityName}. Bundle up and drive carefully.`, priority: 3, type: 'info' });
    }

    // Priority 4: Temperature
    if (temp > 40) {
        suggestions.push({ icon: '🥵', text: `Extreme heat (${temp.toFixed(0)}°C). Stay hydrated, avoid direct sun.`, priority: 1, type: 'severe' });
    } else if (temp > 35) {
        suggestions.push({ icon: '☀️', text: `Very hot (${temp.toFixed(0)}°C). Stay hydrated and seek shade.`, priority: 4, type: 'info' });
    } else if (temp < 0) {
        suggestions.push({ icon: '🥶', text: `Freezing temperature (${temp.toFixed(0)}°C). Dress in warm layers.`, priority: 4, type: 'info' });
    } else if (temp < 5) {
        suggestions.push({ icon: '🧊', text: `Very cold this ${timeOfDay}. Watch for ice on roads.`, priority: 4, type: 'info' });
    }

    // Feels-like difference
    if (Math.abs(feelsLike - temp) > 5) {
        const direction = feelsLike < temp ? 'colder' : 'warmer';
        suggestions.push({ icon: '🌡️', text: `Feels ${direction} than actual (${feelsLike.toFixed(0)}°C vs ${temp.toFixed(0)}°C) due to wind chill.`, priority: 5, type: 'tip' });
    }

    // Priority 5: Humidity/mist
    if (humidity > 85 && weather !== 'rain') {
        suggestions.push({ icon: '💧', text: `High humidity (${humidity}%). May feel muggy this ${timeOfDay}.`, priority: 5, type: 'tip' });
    }
    if (weather === 'fog' || weather === 'mist') {
        suggestions.push({ icon: '🌫️', text: `Low visibility. Drive with care and use fog lights.`, priority: 3, type: 'info' });
    }

    // Sort by priority, take top 3
    suggestions.sort((a, b) => a.priority - b.priority);
    return suggestions.slice(0, 3);
}

function renderSuggestions(suggestions) {
    const container = document.getElementById('ai-suggestions');
    if (!container) return;
    if (suggestions.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';

    const typeColors = {
        severe: 'border-rose-500/40 bg-rose-500/10',
        warning: 'border-amber-500/40 bg-amber-500/10',
        info: 'border-sky-500/40 bg-sky-500/10',
        tip: 'border-accent-400/30 bg-accent-500/5',
    };

    container.innerHTML = suggestions.map(s => {
        const colorClass = typeColors[s.type] || typeColors.tip;
        return `<div class="flex items-start gap-3 p-3 rounded-xl border-l-4 ${colorClass} mb-2" style="animation: fadeInUp 0.6s ease both;">
            <span class="text-xl flex-shrink-0">${s.icon}</span>
            <span class="text-sm leading-relaxed">${s.text}</span>
        </div>`;
    }).join('');
}

// ─── TEMPERATURE COUNTER ANIMATION ──────────────────────────
function animateTemperatureCounter(targetValue, elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const startVal = 0;
    const duration = 1200; // ms
    const startTime = performance.now();
    const unit = tempUnitSymbol();

    function step(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const ease = 1 - Math.pow(1 - progress, 3);
        const currentVal = startVal + (targetValue - startVal) * ease;
        el.textContent = currentVal.toFixed(1) + unit;
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// ─── PUBLIC API ─────────────────────────────────────────────
function updateAtmosphere(data) {
    Atmosphere.timezoneOffset = data.timezone || 0;
    Atmosphere.weatherMain = data.weather[0].main || '';
    Atmosphere.weatherDesc = data.weather[0].description || '';
    Atmosphere.temperature = data.main.temp || 25;
    Atmosphere.humidity = data.main.humidity || 50;
    Atmosphere.windSpeed = data.wind.speed || 0;
    Atmosphere.windDeg = data.wind.deg || 0;
    Atmosphere.sunrise = data.sys.sunrise || 0;
    Atmosphere.sunset = data.sys.sunset || 0;

    // Compute city local time
    Atmosphere.localHour = getCityLocalHour(Atmosphere.timezoneOffset);

    // Compute real sunrise/sunset in city local hours
    Atmosphere.sunriseHour = unixToLocalHour(data.sys.sunrise, Atmosphere.timezoneOffset);
    Atmosphere.sunsetHour = unixToLocalHour(data.sys.sunset, Atmosphere.timezoneOffset);
    Atmosphere.timeSegment = getTimeSegment(Atmosphere.localHour, Atmosphere.sunriseHour, Atmosphere.sunsetHour);

    // Init particles if weather changed
    if (Atmosphere._prevWeather !== Atmosphere.weatherMain) {
        initWeatherParticles(Atmosphere.weatherMain);
        Atmosphere._prevWeather = Atmosphere.weatherMain;
    }

    if (Atmosphere.stars.length === 0) initStars();
    document.body.style.background = 'transparent';

    // Apply theme immediately
    applyThemeMode();

    if (!Atmosphere.running) startAtmosphere();

    // Temperature counter animation
    const tempDisplay = convertTemp(data.main.temp);
    animateTemperatureCounter(parseFloat(tempDisplay), 'temperature');

    // Card fade-in
    document.querySelectorAll('.glass, .forecast-card').forEach((el, i) => {
        el.style.animation = `fadeInUp 0.5s ease ${i * 0.08}s both`;
    });

    // Generate AI suggestions
    const suggestions = generateSmartSuggestions(data, Atmosphere.aqiValue);
    renderSuggestions(suggestions);

    console.log(
        `[Atmosphere] TZ: ${Atmosphere.timezoneOffset}s | Hour: ${Atmosphere.localHour.toFixed(1)} | ` +
        `Segment: ${Atmosphere.timeSegment} | Sunrise: ${Atmosphere.sunriseHour.toFixed(1)} | ` +
        `Sunset: ${Atmosphere.sunsetHour.toFixed(1)} | Weather: ${Atmosphere.weatherMain} | ` +
        `Temp: ${Atmosphere.temperature}°C | AQI: ${Atmosphere.aqiValue}`
    );
}

/**
 * Called from showAQI() when AQI data is fetched.
 */
function updateAtmosphereAQI(aqiValue) {
    Atmosphere.aqiValue = aqiValue;
    // Regenerate suggestions with updated AQI
    if (window._lastWeatherData) {
        const suggestions = generateSmartSuggestions(window._lastWeatherData, aqiValue);
        renderSuggestions(suggestions);
    }
}

// ─── PERFORMANCE MODE ───────────────────────────────────────
function togglePerformanceMode() {
    Atmosphere.performanceMode = !Atmosphere.performanceMode;
    initStars();
    if (Atmosphere.weatherMain) initWeatherParticles(Atmosphere.weatherMain);
    console.log(`[Atmosphere] Performance mode: ${Atmosphere.performanceMode ? 'ON' : 'OFF'}`);
    return Atmosphere.performanceMode;
}

// ─── RESIZE ─────────────────────────────────────────────────
window.addEventListener('resize', () => {
    resizeCanvas();
    initStars();
    if (Atmosphere.weatherMain) initWeatherParticles(Atmosphere.weatherMain);
});
