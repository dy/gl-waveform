// fragment shader with fading based on distance from average

precision highp float;

uniform vec4 viewport;
uniform float thickness;

varying vec4 fragColor;
varying float normThickness;
varying vec3 statsLeft, statsRight, statsPrevRight, statsNextLeft;

const float TAU = 6.283185307179586;

float pdf (float x, float mean, float variance) {
	if (variance == 0.) return x == mean ? 9999. : 0.;
	else return exp(-.5 * pow(x - mean, 2.) / variance) / sqrt(TAU * variance);
}

float fade(float y, vec3 stats) {
	float avg = stats.x;
	float sdev = stats.y;
	float nan = stats.z;
	if (nan == -1.) return 0.;
	float dist = abs(y - avg);
	float pdfCoef = pdf(0., 0., sdev * sdev );
	// pdfCoef makes sure pdf is normalized - has 1. value at the max
	dist = pdf(dist, 0., sdev * sdev  ) / pdfCoef;
	return dist;
}

void main() {
	float halfThickness = normThickness * .5;

	float x = (gl_FragCoord.x - viewport.x) / viewport.z;
	float y = (gl_FragCoord.y - viewport.y) / viewport.w;

	gl_FragColor = fragColor;

	float avgRight = statsRight.x;
	float avgLeft = statsLeft.x;
	float avgNextLeft = statsNextLeft.x;
	float avgPrevRight = statsPrevRight.x;
	float sdevRight = statsRight.y;
	float sdevLeft = statsLeft.y;
	float sdevNextLeft = statsNextLeft.y;
	float sdevPrevRight = statsPrevRight.y;

	if (y > avgRight + halfThickness) {
		if (avgRight > avgLeft) {
			// local max
			if (avgRight > avgNextLeft) {
				gl_FragColor.a *= fade(y, statsRight);
			}
			// sdev can make y go over the
			else if (sdevRight > 0. && y > avgNextLeft + halfThickness) {
				gl_FragColor.a *= fade(y, statsNextLeft);
			}
		}
	}
	if (y > avgLeft + halfThickness) {
		// local max
		if (avgLeft > avgRight) {
			// local max
			if (avgLeft > avgPrevRight) {
				gl_FragColor.a *= fade(y, statsLeft);
			}
			// sdev can make y go over the
			else if (sdevLeft > 0. && y > avgPrevRight + halfThickness) {
				gl_FragColor.a *= fade(y, statsPrevRight);
			}
		}
	}
	if (y < avgRight - halfThickness) {
		if (avgRight < avgLeft) {
			// local min
			if (avgRight < avgNextLeft) {
				gl_FragColor.a *= fade(y, statsRight);
			}
			// sdev can make y go over the
			else if (sdevRight > 0. && y < avgNextLeft - halfThickness) {
				gl_FragColor.a *= fade(y, statsNextLeft);
			}
		}
	}
	if (y < avgLeft - halfThickness) {
		// local min
		if (avgLeft < avgRight) {
			// local min
			if (avgLeft < avgPrevRight) {
				gl_FragColor.a *= fade(y, statsLeft);
			}
			// sdev can make y go over the
			else if (sdevLeft > 0. && y < avgPrevRight - halfThickness) {
				gl_FragColor.a *= fade(y, statsPrevRight);
			}
		}
	}

	// if (dist == 0.) { discard; return; }

	// gl_FragColor.a *= dist;
}
