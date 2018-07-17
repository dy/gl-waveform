precision highp float;

attribute float id, sign;

uniform sampler2D data;
uniform float opacity, thickness, step;
uniform vec2 scale, translate, dataShape;
uniform vec4 viewport, color;

varying vec4 fragColor;

vec4 lerp(vec4 a, vec4 b, float t) {
	return t * b + (1. - t) * a;
}

// pick sample from the source texture
vec4 pick(float offset) {
	float offsetLeft = floor(offset);
	float offsetRight = ceil(offset);
	float t = offset - offsetLeft;
	if (offsetLeft == offsetRight) {
		offsetRight = ceil(offset + .5);
		t = 0.;
	}
	vec2 uvLeft = vec2(offsetLeft, .5);
	vec2 uvRight = vec2(offsetRight, .5);
	vec4 left = texture2D(data, uvLeft / dataShape);
	vec4 right = texture2D(data, uvRight / dataShape);
	return lerp(left, right, t);
}

void main() {
	gl_PointSize = 5.;

	vec2 scaleRatio = scale * viewport.zw;
	float pxOffset = step * id;

	float samplesPerStep = step / scaleRatio.x;

	vec4 sampleLeft = pick(-translate.x * 2. + id * samplesPerStep);
	vec4 sampleRight = pick(-translate.x * 2. + id * samplesPerStep + samplesPerStep);

	// uvLeft.x = (uvLeft.x - translate.x * 2.) * scale.x * viewport.z;
	// uvRight.x = (uvRight.x - translate.x * 2.) * scale.x * viewport.z;
	// vec2 prevDiff = aCoord - prevCoord;
	// vec2 currDiff = bCoord - aCoord;
	// vec2 nextDiff = nextCoord - bCoord;
	// vec2 prevNormal =

	float avg = (sampleRight.y - sampleLeft.y) / samplesPerStep;
	float sdev = (sampleRight.z - sampleLeft.z) - avg * avg;

	float y = avg + sign * (thickness / viewport.w);
	gl_Position = vec4(pxOffset / viewport.z - 1., y, 0, 1);

	fragColor = color / 255.;
	fragColor.a *= opacity;
}
