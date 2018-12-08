#pragma glslify: export(Samples)


struct Samples {
	sampler2D data[2];
	vec2 shape;
	float length;
	float sum;
	float sum2;
};
