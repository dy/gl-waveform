// fragment shader with fading based on distance from average

precision highp float;

uniform vec4 viewport;
uniform float thickness;

varying vec4 fragColor;
varying float normThickness;
varying float avgMin, avgMax, sdevMin, sdevMax;

const float TAU = 6.283185307179586;

float pdf (float x, float mean, float variance) {
	if (variance == 0.) return x == mean ? 9999. : 0.;
	else return exp(-.5 * pow(x - mean, 2.) / variance) / sqrt(TAU * variance);
}

void main() {
	float halfThickness = normThickness * .5;

	float x = (gl_FragCoord.x - viewport.x) / viewport.z;
	float y = (gl_FragCoord.y - viewport.y) / viewport.w;

	gl_FragColor = fragColor;

	float dist = 1.;

	// limit outside by sdevMin
	// limit inside by sdevMax
	// pdfCoef makes sure pdf is normalized - has 1. value at the max
	// local max
	if (y > avgMax + halfThickness) {
		dist = min(y - avgMin, avgMax - y);
		float sdev = sdevMax * .5 + sdevMin * .5;
		float pdfCoef = pdf(0., 0., sdev * sdev );
		dist = pdf(dist, 0., sdev * sdev  ) / pdfCoef;
		gl_FragColor.a *= dist;
	}
	// local min
	else if(y < avgMin - halfThickness) {
		dist = min(y - avgMin, avgMax - y);
		float sdev = sdevMax * .5 + sdevMin * .5;
		float pdfCoef = pdf(0., 0., sdev * sdev );
		dist = pdf(dist, 0., sdev * sdev  ) / pdfCoef;
		gl_FragColor.a *= dist;
	}

	if (dist == 0.) { discard; return; }

	// gl_FragColor.a *= dist;
}
