
const alignment = 64;

export const canvas = document.querySelector('#render-canvas');

/** @type {WebGL2RenderingContext} */
export const gl = canvas.getContext('webgl2');

const ext = gl.getExtension('GMAN_debug_helper');
if (ext) {
    ext.setConfiguration({
        failUnsetSamplerUniforms: true,
    });
}

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

export const frameHolder = {
    current: null
};

function requestFrame() {
    requestAnimationFrame(frameWrapper);
}

function frameWrapper() {
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);
    frameHolder.current?.();
    requestFrame();
}

frameWrapper();
