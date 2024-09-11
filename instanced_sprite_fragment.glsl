#version 300 es
// fragment
precision highp float;
precision highp int;
uniform sampler2D atlas;
in vec2 tc;
out vec4 pixel;

void main() {
    vec4 texel = texture(atlas, tc);
    pixel = texel;
}
