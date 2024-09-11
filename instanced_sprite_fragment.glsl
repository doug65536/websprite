#version 300 es
precision highp float;
precision highp int;
// fragment
uniform sampler2D atlas;
in vec2 tc;
out vec4 pixel;

void main() {
    vec4 texel = texture(atlas, tc);
    pixel = //tc.x != 0.0f ? vec4(1.0f, 0.0f, 0.0f, 0.0f) :
    texel;
}
