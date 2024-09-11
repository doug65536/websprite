import {
    gl, canvas, frameHolder, setUpSpriteShaders
} from "./websprite.js";

const scale = 2;
let sprites = [];

const {
    config,
    instances,
    vao
 } = await setUpSpriteShaders();

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

frameHolder.current = function frame(program) {
    animatePositions();

    gl.useProgram(program);
    gl.bindVertexArray(vao);
    instances.upload();
    gl.drawArraysInstanced(gl.TRIANGLE_FAN,
        0, 4, instances.count);
    gl.bindVertexArray(null);
    gl.useProgram(null);
}
