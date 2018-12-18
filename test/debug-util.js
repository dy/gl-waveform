module.exports = {
	pick, vec2, floor, abs, sqrt, normalize, dot, max, min, lerp, reamp
}

function _pick (tex, offset, base, translate) {
	offset = max(offset, 0.);
	offset += translate
	if (!tex._data) return [0,0,0,0]

	return tex._data.subarray(offset * 3, offset * 3 + 4)
}
function pick (tex, offset, base, translate) {
	let offsetLeft = Math.floor(offset);
	let offsetRight = Math.ceil(offset);
	let t = offset - offsetLeft;
	if (offsetLeft == offsetRight) {
		offsetRight = Math.ceil(offset + .5);
		t = 0.;
	}

	let left = _pick(tex, offsetLeft, base, translate);
	let right = _pick(tex, offsetRight, base, translate);

	if (t == 0.) {
		return left
	}
	let res = lerp(left, right, t)

	return res
}
function vec2 (x, y) {
	if (x == null) { x = 0; }
	if (y == null) { y = x; }
	return [x, y]
}
vec2.divide = function divide (out, a, b) {
	out[0] = a[0] / b[0];
	out[1] = a[1] / b[1];

	return out;
}
function floor (x) {
	if (x.length) { return x.map(floor); }
	return Math.floor(x);
}
function abs (x) {
	if (x.length) { return x.map(abs); }
	return Math.abs(x);
}
function sqrt (x) {
	if (x.length) { return x.map(sqrt); }
	return Math.sqrt(x);
}
function normalize (x) {
	var len = 0;
	for (var i = 0; i < x.length; i++) {
		len += x[i]*x[i];
	}

	var out = Array(x.length).fill(0);
	if (len > 0) {
		len = 1 / Math.sqrt(len);
		for (var i = 0; i < x.length; i++) {
			out[i] = x[i] * len;
		}
	}
	return out;
}
function dot (x, y) {
	var sum = 0;
	for (var i = 0; i < x.length; i++) {
		sum += x[i]*y[i];
	}
	return sum;
}
function max (x, y) {
	if (x.length) {
		if (y.length) { return x.map(function (x, i) {
			return Math.max(x, y[i]);
		}); }
		return x.map(function (x, i) {
			return Math.max(x, y);
		});
	}
	return Math.max(x, y);
}
function min (x, y) {
	if (x.length) {
		if (y.length) { return x.map(function (x, i) {
			return Math.min(x, y[i]);
		}); }
		return x.map(function (x, i) {
			return Math.min(x, y);
		});
	}
	return Math.min(x, y);
}
function lerp (a, b, t) {
	return [t * b[0] + (1. - t) * a[0], t * b[1] + (1. - t) * a[1], t * b[2] + (1. - t) * a[2], t * b[3] + (1. - t) * a[3]];
}
function reamp(v, amp) {
	return (v - amp[0]) / (amp[1] - amp[0])
}
