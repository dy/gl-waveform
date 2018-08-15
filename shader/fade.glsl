// fragment shader with fading based on distance from average

precision highp float;

uniform vec4 viewport;

varying vec4 fragColor;
varying float avgPrev, avgCurr, avgNext, sdev;

const float TAU = 6.283185307179586;

float pdf (float x, float mean, float variance) {
	if (variance == 0.) return x == mean ? 9999. : 0.;
	else return exp(-.5 * pow(x - mean, 2.) / variance) / sqrt(TAU * variance);
}

void main() {
	float x = (gl_FragCoord.x - viewport.x) / viewport.z;
	float y = (gl_FragCoord.y - viewport.y) / viewport.w;

	float dist = min(max(
		abs(avgNext - y),
		abs(avgPrev - y)
	), abs(avgCurr - y));

	// gl_FragColor = fragColor;
	// gl_FragColor.a *= dist;

	gl_FragColor = vec4(vec3(dist * 3.), 1.);
}
