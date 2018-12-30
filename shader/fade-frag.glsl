// fragment shader with fading based on distance from average

precision highp float;

uniform vec4 viewport;
uniform float thickness;

varying vec4 fragColor;
varying float normThickness;
varying float avgLeft, avgRight, sdevLeft, sdevRight, avgPrevRight, avgNextLeft, sdevPrevRight, sdevNextLeft;

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

	// fading code - not so actual due to nice sharp clipping
	// pdfCoef makes sure pdf is normalized - has 1. value at the max
	// float dist = abs(y - avgLeft);
	// float sdev = sdevRight;
	// float pdfCoef = pdf(0., 0., sdev * sdev );
	// dist = pdf(dist, 0., sdev * sdev  ) / pdfCoef;
	// gl_FragColor.a *= dist;

	if (y > avgRight + halfThickness) {
		if (avgRight > avgLeft) {
			// local max
			if (avgRight > avgNextLeft) {
				gl_FragColor.a = 0.;
			}
			// sdev can make y go over the
			else if (sdevRight > 0. && y > avgNextLeft + halfThickness) {
				gl_FragColor.a = 0.;
			}
		}
	}
	if (y > avgLeft + halfThickness) {
		// local max
		if (avgLeft > avgRight) {
			// local max
			if (avgLeft > avgPrevRight) {
				gl_FragColor.a = 0.;
			}
			// sdev can make y go over the
			else if (sdevLeft > 0. && y > avgPrevRight + halfThickness) {
				gl_FragColor.a = 0.;
			}
		}
	}
	if (y < avgRight - halfThickness) {
		if (avgRight < avgLeft) {
			// local min
			if (avgRight < avgNextLeft) {
				gl_FragColor.a = 0.;
			}
			// sdev can make y go over the
			else if (sdevRight > 0. && y < avgNextLeft - halfThickness) {
				gl_FragColor.a = 0.;
			}
		}
	}
	if (y < avgLeft - halfThickness) {
		// local min
		if (avgLeft < avgRight) {
			// local min
			if (avgLeft < avgPrevRight) {
				gl_FragColor.a = 0.;
			}
			// sdev can make y go over the
			else if (sdevLeft > 0. && y < avgPrevRight - halfThickness) {
				gl_FragColor.a = 0.;
			}
		}
	}

	// if (dist == 0.) { discard; return; }

	// gl_FragColor.a *= dist;
}
