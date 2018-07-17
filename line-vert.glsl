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

	vec4 sampleLeft = pick(id * samplesPerStep);
	vec4 sampleRight = pick(id * samplesPerStep + samplesPerStep);

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

// vec3 getSample (float id) {
// 	float dataWidth = dataShape.x - 2.;
// 	float left = id * step / viewport.z;
// 	float sampleId = left * count + offset;
// 	float x = (mod(sampleId, dataWidth) + 1.5) / dataShape.x;
// 	float y = (floor(sampleId / dataWidth) + .5) / dataShape.y;
// 	vec4 sample = texture2D(data, vec2(x, y));

// 	return sample.xyz;
// }

// void main () {
// 	float samplesPerStep = count * step / (viewport.z);
// 	float left = id / viewport.z;

// 	fragColor = vec4(0,0,0,1);

// 	float avg, sdev;

// 	// vec3 leftSample = getSample(id - .5);
// 	// vec3 rightSample = getSample(id + .5);
// 	// avg = (rightSample.y - leftSample.y) / samplesPerStep;

// 	//TODO: make manual lerp here
// 	float sampleWidth = 1. / count;
// 	float stop = id / viewport.z;
// 	float leftStop = floor(stop * count) / count;
// 	float rightStop = ceil(stop * count) / count;
// 	// if (leftStop == rightStop) {
// 	// 	rightStop = floor(stop * count + 1.) / count;
// 	// }
// 	float ratio = (rightStop - leftStop);
// 	vec4 leftSample = texture2D(data, vec2( leftStop, 0));
// 	vec4 rightSample = texture2D(data, vec2( rightStop, 0));

// 	avg = (rightSample.y - leftSample.y) / (50.);

// 	gl_PointSize = 2.;
// 	gl_Position = vec4( left * 2. - 1., avg + .1 * sign, 0, 1);
// }
