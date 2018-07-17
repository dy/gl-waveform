precision highp float;

attribute float id, sign;

uniform sampler2D data;
uniform float opacity, thickness, step;
uniform vec2 scale, translate, dataShape;
uniform vec4 viewport, color;

varying vec4 fragColor;

float lerp(float a, float b, float t) {
	return t * b + (1. - t) * a;
}

void main() {
	gl_PointSize = 5.;

	vec2 scaleRatio = scale * viewport.zw;

	float pxOffset = step * id;

	vec2 uv = vec2(( id * step - translate.x * 2.) * scale.x * viewport.z, .5);

	vec4 sample = texture2D(data, uv / dataShape);

	// vec4 right = texture2D(data, vec2(step * (id + 1.) / dataShape.x, 0.));
	// float amp = lerp(nextSample.y, currSample);
	// vec2 prevDiff = aCoord - prevCoord;
	// vec2 currDiff = bCoord - aCoord;
	// vec2 nextDiff = nextCoord - bCoord;
	// vec2 prevNormal =

	float y = sample.x + sign * thickness / viewport.w;
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
