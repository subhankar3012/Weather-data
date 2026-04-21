const canvas = document.getElementById('weather-canvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let weatherState = '';
let particles = [];
let clouds = [];
let lightning = [];
let sun = null;

// --- Particle Factories ---
function createRainDrop(x, y) {
    return { x, y, length: Math.random() * 20 + 10, vy: Math.random() * 3 + 2, opacity: Math.random() * 0.5 + 0.2 };
}

function createSnowFlake(x, y) {
    return { x, y, radius: Math.random() * 3 + 1, vx: Math.random() * 2 - 1, vy: Math.random() * 2 + 1, opacity: Math.random() * 0.5 + 0.3 };
}

function createCloud() {
    const baseSize = 120;
    const aspectRatio = 1.8;
    const cloudWidth = baseSize * aspectRatio;
    const cloudHeight = baseSize;

    const puffs = [
        { x: 0.70, y: 0.00, rX: 0.25, rY: 0.50, o: 0.9 },
        { x: 0.27, y: 0.18, rX: 0.13, rY: 0.20, o: 0.9 },
        { x: 1.00, y: 1.00, rX: 0.15, rY: 0.30, o: 0.9 },
        { x: 0.00, y: 1.00, rX: 0.18, rY: 0.34, o: 0.9 },
    ];

    const configuredPuffs = puffs.map(p => ({
        offsetX: (p.x - 0.5) * cloudWidth,
        offsetY: (p.y - 0.5) * cloudHeight,
        radius: (p.rX * cloudWidth + p.rY * cloudHeight) / 2,
        opacity: p.o
    }));

    return {
        x: Math.random() * canvas.width,
        y: Math.random() * (canvas.height / 3),
        vx: Math.random() * 0.5 + 0.1,
        puffs: configuredPuffs,
        width: cloudWidth,
        height: cloudHeight
    };
}

function createLightning() {
    const x = Math.random() * canvas.width;
    const y = 0;
    const segments = [];
    let currentY = y;
    while (currentY < canvas.height) {
        const nextX = x + (Math.random() - 0.5) * 40;
        const nextY = currentY + Math.random() * 20 + 10;
        segments.push({ x1: x, y1: currentY, x2: nextX, y2: nextY });
        currentY = nextY;
    }
    return { segments, life: 30, alpha: 1 };
}

function createSun() {
    return {
        x: canvas.width * 0.8,
        y: canvas.height * 0.2,
        radius: 60,
        angle: 0,
        glow: 10
    };
}

// --- Initialization Functions ---
function init() {
    particles = [];
    clouds = [];
    lightning = [];
    sun = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    switch (weatherState) {
        case 'rain': initRain(); break;
        case 'snow': initSnow(); break;
        case 'clouds': initClouds(); break;
        case 'thunder': initLightning(); break;
        case 'clear': initSun(); break;
    }
}

function initRain() {
    for (let i = 0; i < 500; i++) particles.push(createRainDrop(Math.random() * canvas.width, Math.random() * canvas.height));
}

function initSnow() {
    for (let i = 0; i < 400; i++) particles.push(createSnowFlake(Math.random() * canvas.width, Math.random() * canvas.height));
}

function initClouds() {
    for (let i = 0; i < 7; i++) clouds.push(createCloud());
}

function initLightning() {
    initClouds();
}

function initSun() {
    sun = createSun();
}

// --- Drawing Functions ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    switch (weatherState) {
        case 'rain': drawRain(); break;
        case 'snow': drawSnow(); break;
        case 'clouds': drawClouds(); break;
        case 'thunder': drawClouds(); drawLightning(); break;
        case 'clear': drawSun(); break;
    }
}

function drawRain() {
    particles.forEach(p => {
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x, p.y + p.length);
        ctx.strokeStyle = `rgba(174,194,224,${p.opacity})`;
        ctx.lineWidth = 1;
        ctx.stroke();
    });
}

function drawSnow() {
    particles.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
        ctx.fill();
    });
}

function drawClouds() {
    clouds.forEach(cloud => {
        cloud.puffs.forEach(puff => {
            const puffX = cloud.x + puff.offsetX;
            const puffY = cloud.y + puff.offsetY;
            const gradient = ctx.createRadialGradient(puffX, puffY, 0, puffX, puffY, puff.radius);
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
            gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(puffX, puffY, puff.radius, 0, Math.PI * 2);
            ctx.fill();
        });
    });
}

function drawLightning() {
    lightning.forEach(l => {
        ctx.strokeStyle = `rgba(255, 255, 0, ${l.alpha})`;
        ctx.lineWidth = Math.random() * 3 + 1;
        l.segments.forEach(seg => {
            ctx.beginPath();
            ctx.moveTo(seg.x1, seg.y1);
            ctx.lineTo(seg.x2, seg.y2);
            ctx.stroke();
        });
    });
}

function drawSun() {
    if (!sun) return;

    // Glowing effect
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, sun.radius + sun.glow * Math.abs(Math.sin(sun.angle)), 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 0, ${0.2 * Math.abs(Math.sin(sun.angle))})`;
    ctx.fill();

    // Sun body
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, sun.radius, 0, Math.PI * 2);
    const gradient = ctx.createRadialGradient(sun.x, sun.y, 0, sun.x, sun.y, sun.radius);
    gradient.addColorStop(0, 'rgba(255, 220, 100, 1)');
    gradient.addColorStop(1, 'rgba(255, 165, 0, 1)');
    ctx.fillStyle = gradient;
    ctx.fill();
}

// --- Update Functions ---
function update() {
    switch (weatherState) {
        case 'rain': updateRain(); break;
        case 'snow': updateSnow(); break;
        case 'clouds': updateClouds(); break;
        case 'thunder': updateClouds(); updateLightning(); break;
        case 'clear': updateSun(); break;
    }
}

function updateRain() {
    particles.forEach(p => {
        p.y += p.vy;
        if (p.y > canvas.height) { p.y = 0 - p.length; p.x = Math.random() * canvas.width; }
    });
}

function updateSnow() {
    particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y > canvas.height) { p.y = 0; p.x = Math.random() * canvas.width; }
        if (p.x > canvas.width || p.x < 0) { p.vx *= -1; }
    });
}

function updateClouds() {
    clouds.forEach(cloud => {
        cloud.x += cloud.vx;
        if (cloud.x > canvas.width + cloud.width) {
            cloud.x = -cloud.width;
        }
    });
}

function updateLightning() {
    if (Math.random() < 0.02) lightning.push(createLightning());
    lightning.forEach((l, index) => {
        l.life--;
        l.alpha = l.life / 30;
        if (l.life <= 0) lightning.splice(index, 1);
    });
}

function updateSun() {
    if (!sun) return;
    sun.angle += 0.01;
}

// --- Animation Loop ---
let animationFrameId = null;
function animate() {
    update();
    draw();
    animationFrameId = requestAnimationFrame(animate);
}

function stopAnimation() {
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// --- UI Control ---
function setWeather(weather) {
    stopAnimation();
    weatherState = weather;
    if (weatherState) {
        init();
        animate();
    }
}

// --- Event Listeners ---
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    if (weatherState) {
        init();
    }
});
