#pragma glslify: export(Samples)

struct Samples {
	float id;
	// sampler2D data;
	sampler2D prev;
	sampler2D next;
	vec2 shape;
	float length;
	float sum, prevSum, sum2, prevSum2;
};
