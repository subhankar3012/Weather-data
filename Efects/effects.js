const canvas = document.getElementById('weather-canvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

let weatherState = 'rain'; // Default weather state
let particles = [];
let clouds = [];
let lightning = [];

// --- Particle Factories ---
function createRainDrop(x, y) {
    return { x, y, length: Math.random() * 20 + 10, vy: Math.random() * 3 + 2, opacity: Math.random() * 0.5 + 0.2 };
}

function createSnowFlake(x, y) {
    return { x, y, radius: Math.random() * 3 + 1, vx: Math.random() * 2 - 1, vy: Math.random() * 2 + 1, opacity: Math.random() * 0.5 + 0.3 };
}

function createCloud() {
    const baseSize = 120; // Control the overall size of the cloud
    const aspectRatio = 1.8;
    const cloudWidth = baseSize * aspectRatio;
    const cloudHeight = baseSize;

    const puffs = [
        // Replicating the CSS mask with puff configurations
        // {offsetX, offsetY, radiusX, radiusY, opacity}
        { x: 0.70, y: 0.00, rX: 0.25, rY: 0.50, o: 0.9 }, // 70% 0 / 50% 100%
        { x: 0.27, y: 0.18, rX: 0.13, rY: 0.20, o: 0.9 }, // 27% 18% / 26% 40%
        { x: 1.00, y: 1.00, rX: 0.15, rY: 0.30, o: 0.9 }, // 100% 100% / 30% 60%
        { x: 0.00, y: 1.00, rX: 0.18, rY: 0.34, o: 0.9 }, // 0 100% / 36% 68%
    ];

    // Convert percentage-based puffs to pixel values
    const configuredPuffs = puffs.map(p => ({
        offsetX: (p.x - 0.5) * cloudWidth,
        offsetY: (p.y - 0.5) * cloudHeight,
        radius: (p.rX * cloudWidth + p.rY * cloudHeight) / 2, // Average radius
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

// --- Initialization Functions ---
function init() {
    particles = [];
    clouds = [];
    lightning = [];
    switch (weatherState) {
        case 'rain': initRain(); break;
        case 'snow': initSnow(); break;
        case 'clouds': initClouds(); break;
        case 'lightning': initLightning(); break;
    }
}

function initRain() {
    for (let i = 0; i < 500; i++) particles.push(createRainDrop(Math.random() * canvas.width, Math.random() * canvas.height));
}

function initSnow() {
    for (let i = 0; i < 400; i++) particles.push(createSnowFlake(Math.random() * canvas.width, Math.random() * canvas.height));
}

function initClouds() {
    // Fewer clouds since they are larger and more detailed
    for (let i = 0; i < 7; i++) clouds.push(createCloud());
}

function initLightning() {
    initClouds(); // Lightning needs clouds
}

// --- Drawing Functions ---
function draw() {
    ctx.fillStyle = '#1c1c2c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    switch (weatherState) {
        case 'rain': drawRain(); break;
        case 'snow': drawSnow(); break;
        case 'clouds': drawClouds(); break;
        case 'lightning': drawClouds(); drawLightning(); break;
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

            // Make the center of the puff more opaque and fade out
            gradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
            gradient.addColorStop(0.7, 'rgba(255, 255, 255, 0.1)');
            gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(puffX, puffY, puff.radius, 0, Math.PI * 2);
            ctx.fill();
        });

        // Add the flat bottom part, also with a gradient to blend it
        const bottomX = cloud.x - (cloud.width * 0.335);
        const bottomY = cloud.y + (cloud.height * 0.29);
        const bottomW = cloud.width * 0.67;
        const bottomH = cloud.height * 0.58;
        const bottomGrad = ctx.createLinearGradient(bottomX, bottomY, bottomX, bottomY + bottomH);

        bottomGrad.addColorStop(0, 'rgba(255, 255, 255, 0.2)');
        bottomGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

        ctx.fillStyle = bottomGrad;
        ctx.fillRect(bottomX, bottomY, bottomW, bottomH);
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

// --- Update Functions ---
function update() {
    switch (weatherState) {
        case 'rain': updateRain(); break;
        case 'snow': updateSnow(); break;
        case 'clouds': updateClouds(); break;
        case 'lightning': updateClouds(); updateLightning(); break;
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
        if (cloud.x > canvas.width + cloud.width) { // Use cloud width for reset
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

// --- Animation Loop ---
function animate() {
    update();
    draw();
    requestAnimationFrame(animate);
}

// --- UI Control ---
function setWeather(weather) {
    weatherState = weather;
    init();
}

// --- Event Listeners ---
window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    init();
});

// Start the animation
init();
animate();

