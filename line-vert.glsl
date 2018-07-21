precision highp float;

attribute float id, sign;

uniform sampler2D data;
uniform float opacity, thickness, step;
uniform vec2 scale, translate, dataShape;
uniform vec4 viewport, color;

varying vec4 fragColor;

const float lessThanThickness = 0.;

// linear interpolation
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
	gl_PointSize = 3.;

	float pxOffset = step * id;

	float samplesPerStep = step / scale.x / viewport.z;

	// calc average of curr..next sampling points
	vec4 sample0 = pick(-translate.x * 2. + id * samplesPerStep);
	vec4 sample1 = pick(-translate.x * 2. + id * samplesPerStep + samplesPerStep);
	float avgCurr = (sample1.y - sample0.y) / samplesPerStep;
	float sdev = (sample1.z - sample0.z) - avgCurr * avgCurr;

	// less than thickness sdev works as simple normal line slope
	if (lessThanThickness == 0.) {
		vec4 sampleNext = pick(-translate.x * 2. + id * samplesPerStep + samplesPerStep * 2.);
		vec4 samplePrev = pick(-translate.x * 2. + id * samplesPerStep - samplesPerStep);

		float avgNext = (sampleNext.y - sample1.y) / samplesPerStep;
		float avgPrev = (sample0.y - samplePrev.y) / samplesPerStep;

		float x = .5 * step / viewport.z;
		vec2 normalRight = normalize(vec2(
			-(avgNext - avgCurr) * .5, x
		) / viewport.zw);
		vec2 normalLeft = normalize(vec2(
			-(avgCurr - avgPrev) * .5, x
		) / viewport.zw);

		vec2 join = normalize(normalLeft + normalRight);
		float joinLength = abs(1. / dot(normalLeft, join));

		// vec2 tangentA = vec2(.5, -.5);
		// vec2 tangentB = normalize(diffB * scaleRatio);
		// vec2 normalB = vec2(-tangentB.y, tangentB.x);

		vec2 position = vec2(.5 * step * id / viewport.z, avgCurr * .5 + .5);
		position += sign * joinLength * join * .5 * thickness / viewport.zw;

		gl_Position = vec4(position * 2. - 1., 0, 1);
	}

	// sdev more than normal but less than projected to vertical value rotates point towards
	// else if () {

	// }

	// more than thickness sdev maps to vertical
	else {
		float y = avgCurr + sign * (thickness / viewport.w);
		gl_Position = vec4(pxOffset / viewport.z - 1., y, id / 100., 1);
	}

	fragColor = color / 255.;
	fragColor.a *= opacity;
}
