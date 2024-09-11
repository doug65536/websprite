
const alignment = 64;
const frameDepth = 65536;

let spriteProgram;

// Direct access to sprite instance data
let instances;

let inverseFrameWLoc;
let inverseFrameHLoc;

export const canvas = document.querySelector('#render-canvas');

/** @type {WebGL2RenderingContext} */
export const gl = canvas.getContext('webgl2');

const ext = gl.getExtension('GMAN_debug_helper');
if (ext) {
    ext.setConfiguration({
        failUnsetSamplerUniforms: true,
    });
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

export async function getFile(url) {
    const response = await fetch(url);
    return await response.text();
}

export async function getJson(url) {
    const text = await getFile(url);
    return JSON.parse(text);
}

export async function getConfig() {
    return await getJson('config.json');
}

export function imageAsync(url) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.addEventListener('load', (event) => {
            resolve(img);
        });
        img.addEventListener('error', (event) => {
            reject(new Error(event.message));
        });
        img.src = url;
    });
}

export const arrayTraits = Object.freeze(Object.fromEntries([
    [gl.UNSIGNED_BYTE, {
        ctor: Uint8Array,
        size: Uint8Array.BYTES_PER_ELEMENT,
        floating: false
    }],
    [gl.UNSIGNED_SHORT, {
        ctor: Uint16Array,
        size: Uint16Array.BYTES_PER_ELEMENT,
        floating: false
    }],
    [gl.UNSIGNED_INT, {
        ctor: Uint32Array,
        size: Uint32Array.BYTES_PER_ELEMENT,
        floating: false
    }],
    [gl.BYTE, {
        ctor: Int8Array,
        size: Int8Array.BYTES_PER_ELEMENT,
        floating: false
    }],
    [gl.SHORT, {
        ctor: Int16Array,
        size: Int16Array.BYTES_PER_ELEMENT,
        floating: false
    }],
    [gl.INT, {
        ctor: Int32Array,
        size: Int32Array.BYTES_PER_ELEMENT,
        floating: false
    }],
    [gl.FLOAT, {
        ctor: Float32Array,
        size: Float32Array.BYTES_PER_ELEMENT,
        floating: true
    }]
]));

export class SoA {
    capacity = 0;
    count = 0;
    infos = [];
    buffer = null;
    fieldArrays = {};

    constructor(program, fields, capacity) {
        if (capacity & (alignment-1)) {
            capacity &= -alignment;
            capacity += alignment;
        }

        this.capacity = capacity;

        let infos = [];
        this.infos = infos;

        let offset = 0;
        for (let [fieldName, rawFieldInfo] of Object.entries(fields)) {
            let fieldInfo;
            if (typeof rawFieldInfo === 'number') {
                fieldInfo = {
                    type: rawFieldInfo
                }
            } else {
                fieldInfo = rawFieldInfo;
            }

            let traits = arrayTraits[fieldInfo.type];

            let size = traits.size * capacity;

            let components = fieldInfo.components || 1;

            infos.push({
                name: fieldName,
                index: infos.length,
                type: fieldInfo.type,
                size,
                normalized: fieldInfo.normalized || false,
                floating: traits.floating,
                components,
                data: null,
                ctor: traits.ctor,
                offset
            });

            offset += size * components;
        }

        let buffer = new ArrayBuffer(offset);
        this.buffer = buffer;

        for (let info of infos) {
            let loc = gl.getAttribLocation(program, info.name);

            console.log('configuring', info.name, 'at', loc, 'with', info);

            if (info.floating) {
                gl.vertexAttribPointer(loc,
                    info.components, info.type,
                    info.normalized, 0, info.offset);
            } else {
                gl.vertexAttribIPointer(loc,
                    info.components, info.type,
                    0, info.offset);
            }

            gl.vertexAttribDivisor(loc, 1);

            gl.enableVertexAttribArray(loc);

            // Create the typed view of the buffer subarray
            info.data = new info.ctor(buffer,
                info.offset, capacity);

            this.fieldArrays[info.name] = info.data;
        }
    }

    reserve(arbitraryCapacity) {
        let newCapacity = (this.capacity & 0x7fffffff) || alignment;
        while (newCapacity < arbitraryCapacity)
            newCapacity += newCapacity;
        this.expand(newCapacity);
    }

    expand(newCapacity = 0) {
        newCapacity = newCapacity || alignment;
        if (newCapacity <= this.capacity)
            return;
        let scale = newCapacity / this.capacity;
        if (scale !== (scale & 0x7fffffff) || !scale || (scale & (scale-1)))
            throw new Error('Invalid capacity, call reserve for easy mode');
        let newBuffer = new ArrayBuffer(this.buffer.byteLength * scale);
        let newFieldArrays = {};
        let newInfos = this.infos.map((fieldInfo, index) => {
            console.assert(fieldInfo.index === index);

            let type = fieldInfo.type;

            let traits = arrayTraits[type];

            let offset = fieldInfo.offset * scale;
            let size = fieldInfo.size * scale;

            // Create the new typed view of the buffer subarray
            let data = new traits.ctor(newBuffer, offset, size);

            let name = fieldInfo.name;

            newFieldArrays[name] = data;

            // Copy the old data into the new typed array
            data.set(fieldInfo.data);

            let updated = {
                name,
                index,
                type,
                size,
                normalized: fieldInfo.normalized || false,
                data,
                offset
            };

            return updated;
        });
        this.capacity = newCapacity;
        this.buffer = newBuffer;
        this.infos = newInfos;
        this.fieldArrays = newFieldArrays;
    }

    setField(name, i, value) {
        this.fieldArrays[name][i] = value;
    }

    getField(name, i) {
        return this.fieldArrays[name][i];
    }

    // Copy all fields into the given object and return it
    fields(row, startWith = {}) {
        for (let i = 0, e = infos.length; i < e; ++i)
            this.fieldAt(i, row, startWith);
        return startWith;
    }

    fieldAt(fieldIndex, rowIndex, startWith = {}) {
        let info = this.infos[fieldIndex];
        startWith[info.name] = info.data[rowIndex];
        return startWith;
    }

    set(i, obj, patch) {
        let infos = this.infos;
        for (let fi = 0; fi < infos.length; ++fi) {
            let info = infos[fi];
            let name = info.name;
            let value = obj[name];
            if (!patch || value !== undefined) {
                let fieldArray = this.fieldArrays[name];
                fieldArray[i] = value;
            }
        }
    }

    get(i, startWith = {}) {
        let infos = this.infos;
        for (let fi = 0; fi < infos.length; ++fi) {
            let info = infos[fi];
            let name = info.name;
            let fieldArray = this.fieldArrays[name];
            let value = fieldArray[i];
            startWith[name] = value;
        }
        return startWith;
    }

    push(obj) {
        if (this.count >= this.capacity)
            this.expand();

        return this.set(this.count++, obj);
    }

    pop(startWith = {}) {
        if (this.count > 0)
            return this.get(--this.count, startWith);
        return undefined;
    }

    upload() {
        gl.bufferData(gl.ARRAY_BUFFER,
            this.buffer, gl.STREAM_DRAW);
    }
};

export function dumpProgramVariables(program) {
    const activeUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
    const activeAttribs = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
    console.log('uniforms');
    for (let au = 0; au < activeUniforms; ++au) {
        console.log(au, gl.getActiveUniform(program, au));
    }
    console.log('attribs');
    for (let aa = 0; aa < activeAttribs; ++aa) {
        console.log(aa, gl.getActiveAttrib(program, aa));
    }
}

export async function setUpSpriteShaders() {
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

    spriteProgram = gl.createProgram();

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

    gl.attachShader(spriteProgram, vertexShader);
    gl.attachShader(spriteProgram, fragmentShader);
    gl.linkProgram(spriteProgram);

    gl.useProgram(spriteProgram);

    inverseFrameWLoc = gl.getUniformLocation(
        spriteProgram, 'inverseFrameW');
    inverseFrameHLoc = gl.getUniformLocation(
        spriteProgram, 'inverseFrameH');
    const inverseFrameDLoc = gl.getUniformLocation(
        spriteProgram, 'inverseFrameD');

    const inverseTexWLoc = gl.getUniformLocation(
        spriteProgram, 'inverseTexW');
    const inverseTexHLoc = gl.getUniformLocation(
        spriteProgram, 'inverseTexH');

    gl.uniform1f(inverseTexWLoc, 1 / atlas.width);
    gl.uniform1f(inverseTexHLoc, 1 / atlas.height);

    autoResize(spriteProgram);

    gl.uniform1f(inverseFrameDLoc, 1 / frameDepth);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const atlasLoc = gl.getUniformLocation(spriteProgram, 'atlas');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sheet);
    gl.uniform1i(atlasLoc, 0);

    const vertexNumbers = new Uint32Array([0, 2, 3, 1]);
    const vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,
        vertexNumbers, gl.STATIC_DRAW);
    const vertexNumberLoc = gl.getAttribLocation(spriteProgram, 'vertexNumber');
    gl.vertexAttribIPointer(vertexNumberLoc, 1, gl.INT, 0, 0);
    gl.enableVertexAttribArray(vertexNumberLoc);

    const instanceBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
    instances = new SoA(spriteProgram, spriteRenderData, 4096);

    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.BLEND);

    return {
        config,
        instances,
        vao
    };
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

export const frameHolder = {
    current: null
};

function requestFrame() {
    requestAnimationFrame(frameWrapper);
}

function frameWrapper() {
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
    frameHolder.current?.(spriteProgram);
    requestFrame();
}

frameWrapper();
