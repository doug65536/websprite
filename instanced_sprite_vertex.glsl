#version 300 es
// vertex
precision highp float;
precision highp int;

// It is probably way faster to convert integer to float,
// and multiply by inverse, than it would be to
// divide by the dimensions
uniform float inverseFrameW;
uniform float inverseFrameH;
uniform float inverseFrameD;
uniform float inverseTexW;
uniform float inverseTexH;

//
// Input vertex (just a vertex number)

in int vertexNumber;

//
// Instanced from AoSoA

in float dx, dy, dz;
in float dw, dh;
in float sx, sy;
in float sw, sh;

//
// To fragment shader

out vec2 tc;

void main() {
    int i = vertexNumber;

    float ndw = dw;
    float ndx = dx;

    float ndh = dh;
    float ndy = dy;

    float ndz = dz;

    ndw *= inverseFrameW;
    ndx *= inverseFrameW;

    ndh *= inverseFrameH;
    ndy *= inverseFrameH;

    ndz *= inverseFrameD;

    ndw *= 2.0f;
    ndx *= 2.0f;

    ndh *= 2.0f;
    ndy *= 2.0f;

    ndz *= 2.0f;

    ndx -= 1.0f;
    ndy -= 1.0f;
    ndz -= 1.0f;

    float tx = sx;
    float ty = sy;

    // 0--1
    // |  |
    // 2--3 <- the bottom side numbers have bit 1 set (because they are >= 2)
    //    ^
    //     \_ The right side ones have bit 0 set (because they're odd)

    // When rendered, we do a triangle fan with 0 2 3 1
    // 023 is the bottom left half
    // the final 1 forms 031 triangle, top right half

    if ((i & 1) != 0) {
        // Right side texcoord
        tx += sw;

        // Right side screen position
        ndx += ndw;
    }

    if ((i & 2) != 0) {
        // Bottom texcoord
        ty += sh;

        // Bottom position
        ndy += ndh;
    }

    gl_Position = vec4(ndx, -ndy, ndz, 1.0f);

    tc = vec2(tx * inverseTexW, ty * inverseTexH);
}
