// linear interpolation

float reamp(float v, vec2 amp) {
	return (v - amp.x) / (amp.y - amp.x);
}

#pragma glslify: export(reamp)
