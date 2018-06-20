precision highp float;

uniform sampler2D data;
uniform vec4 viewport;
uniform vec2 dataShape;
uniform float offset, count;

varying vec4 fragColor;

void main() {
	float rowWidth = dataShape.x - 2.;
	float offset = offset + (gl_FragCoord.x - .5) * count / viewport.w;
	float x = mod(offset, rowWidth);
	float y = floor(offset / rowWidth);
	vec4 sample = texture2D(data, vec2(x + 1.5, y + .5) / dataShape);
	float dist = abs(gl_FragCoord.y / viewport.w - sample.x * .5 - .5);

	gl_FragColor = vec4(vec3(dist),1);
}
