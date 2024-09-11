import {
    gl, canvas, frameHolder, getFile, getConfig, imageAsync, SoA
} from "./websprite.js";

const frameDepth = 65536;
const scale = 2;
let sprites = [];

/** @type {WebGLTexture} */
let sheet = gl.createTexture();

const vertexShaderSourcePromise =
    getFile('instanced_sprite_vertex.glsl');

const fragmentShaderSourcePromise =
    getFile('instanced_sprite_fragment.glsl');

const config = await getConfig();

const atlasPromise = imageAsync(config.atlas);

const vertexShaderSource = await vertexShaderSourcePromise;
const fragmentShaderSource = await fragmentShaderSourcePromise;
const atlas = await atlasPromise;

await init(atlas);

async function init(/** @type {HTMLImageElement} */ atlas) {
    if (atlas.width & (atlas.width - 1))
        throw new Error("Atlas width is not a power of two");
    if (atlas.height & (atlas.height - 1))
        throw new Error("Atlas width is not a power of two");

    gl.bindTexture(gl.TEXTURE_2D, sheet);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA,
        gl.UNSIGNED_BYTE, atlas);
}


const spriteRenderData = {
    // Screen position
    dx: gl.FLOAT,
    dy: gl.FLOAT,
    dz: gl.FLOAT,

    // Screen size
    dw: gl.FLOAT,
    dh: gl.FLOAT,

    // Texture atlas position
    sx: gl.FLOAT,
    sy: gl.FLOAT,

    // Texture atlas size
    sw: gl.FLOAT,
    sh: gl.FLOAT
};

const program = gl.createProgram();

const vertexShader = gl.createShader(gl.VERTEX_SHADER);
const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

gl.shaderSource(vertexShader, vertexShaderSource);
gl.shaderSource(fragmentShader, fragmentShaderSource);

gl.compileShader(vertexShader);
gl.compileShader(fragmentShader);

const vertexDiagnostics = gl.getShaderInfoLog(vertexShader);
const fragmentDiagnostics = gl.getShaderInfoLog(fragmentShader);

if (vertexDiagnostics)
    console.log('vertex diagnostics:\n' + vertexDiagnostics);
if (fragmentDiagnostics)
    console.log('fragment diagnostics:\n' + fragmentDiagnostics);

gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);

gl.useProgram(program);
const inverseFrameWLoc = gl.getUniformLocation(
    program, 'inverseFrameW');
const inverseFrameHLoc = gl.getUniformLocation(
    program, 'inverseFrameH');
const inverseFrameDLoc = gl.getUniformLocation(
    program, 'inverseFrameD');

const inverseTexWLoc = gl.getUniformLocation(
    program, 'inverseTexW');
const inverseTexHLoc = gl.getUniformLocation(
    program, 'inverseTexH');

gl.uniform1f(inverseTexWLoc, 1 / atlas.width);
gl.uniform1f(inverseTexHLoc, 1 / atlas.height);

autoResize(program);

gl.uniform1f(inverseFrameDLoc, 1 / frameDepth);

const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
const atlasLoc = gl.getUniformLocation(program, 'atlas');
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, sheet);
gl.uniform1i(atlasLoc, 0);

const vertexNumbers = new Uint32Array([0, 2, 3, 1]);
const vertexBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
gl.bufferData(gl.ARRAY_BUFFER,
    vertexNumbers, gl.STATIC_DRAW);
const vertexNumberLoc = gl.getAttribLocation(program, 'vertexNumber');
gl.vertexAttribIPointer(vertexNumberLoc, 1, gl.INT, 0, 0);
gl.enableVertexAttribArray(vertexNumberLoc);

const instanceBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
const instances = new SoA(program, spriteRenderData, 4096);

gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
gl.enable(gl.BLEND);

for (let sy = 0; sy + config.tileH <= config.atlasH; sy += config.tileH) {
    for (let sx = 0; sx + config.tileW <= config.atlasW; sx += config.tileW) {
        instances.push({
            dx: 0,
            dy: 0,
            dz: 0,

            dw: config.tileW * scale,
            dh: config.tileH * scale,

            sx,
            sy,

            sw: config.tileW,
            sh: config.tileH
        });
    }
}

instances.upload();

const demoCount = 4096;
const spriteData = [];
initPositions();

function initPositions() {
    const diagonal = false;
    const w = +canvas.width;
    const h = +canvas.height;
    for (let i = 0; i < instances.count; ++i) {
        if (diagonal) {
            spriteData.push({
                x: Math.random() * (w - config.tileW),
                y: Math.random() * (h - config.tileH),
                vx: 2 * (Math.random() >= 0.5) - 1,
                vy: 2 * (Math.random() >= 0.5) - 1,
            });
        } else {
            const speed = 4 * Math.random();
            spriteData.push({
                x: Math.random() * (w - config.tileW),
                y: Math.random() * (h - config.tileH),
                vx: (2 * Math.random() - 1) * speed,
                vy: (2 * Math.random() - 1) * speed,
            });
        }
    }
}

let last = Date.now();
let avg = 1/60;

function animatePositions() {
    let now = Date.now();
    let elap = now - last;
    avg = avg * 0.95 + elap * 0.05;
    if (Math.random() < 0.001)
        console.log((1000/avg).toFixed(2),'fps');
    last = now;
    frames = avg / 120;
    const w = +canvas.width;
    const h = +canvas.height;

    if (true) {
        for (let i = 0; i < instances.count; ++i) {
            let sprite = spriteData[i];

            if (sprite.x + config.tileW > canvas.width)
                sprite.x = canvas.width - config.tileW;
            if (sprite.y + config.tileH > canvas.height)
                sprite.y = canvas.height - config.tileH;

            sprite.x += sprite.vx * frames;
            sprite.y += sprite.vy * frames;

            if (sprite.vx > 0 && sprite.x > w - config.tileW * scale)
                sprite.vx *= -1;
            else if (sprite.vx < 0 && sprite.x <= 0)
                sprite.vx *= -1;

            if (sprite.vy < 0 && sprite.y <= 0)
                sprite.vy *= -1;
            else if (sprite.vy > 0 && sprite.y > h - config.tileH * scale)
                sprite.vy *= -1;

            instances.set(i, {
                dx: sprite.x | 0,
                dy: sprite.y | 0
            }, true);
        }
        instances.upload();
        return;
    } else {
        const off = (Date.now() % 15000) / 15000 * Math.PI * 2;
        const step = Math.PI * 2 / instances.count;
        let a = off;
        const halfW = (+canvas.width - config.tileW) / 2;
        const halfH = (+canvas.height - config.tileH) / 2;
        for (let i = 0; i < instances.count; ++i, a += step) {
            const f = i / instances.count;
            instances.set(instances.count - i - 1, {
                dx: Math.sin(-a * 8 + f * Math.PI * 2) * f * halfW + halfW,
                dy: Math.cos(-a * 8 + f * Math.PI * 2) * f * halfH + halfH
            }, true);
        }
        instances.upload();
    }
}

frameHolder.current = function frame() {
    animatePositions();

    gl.useProgram(program);
    gl.bindVertexArray(vao);
    instances.upload();
    gl.drawArraysInstanced(gl.TRIANGLE_FAN,
        0, 4, instances.count);
    gl.bindVertexArray(null);
    gl.useProgram(null);
}


function updateSize(program) {
    const w = window.innerWidth;
    const h = window.innerHeight;

    canvas.width = w;
    canvas.height = h;

    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    gl.useProgram(program);

    gl.uniform1f(inverseFrameWLoc, 1 / w);
    gl.uniform1f(inverseFrameHLoc, 1 / h);
    gl.viewport(0, 0, w, h);
}

function autoResize(program) {
    window.addEventListener('resize', updateSize.bind(null, program));
    updateSize(program);
}
