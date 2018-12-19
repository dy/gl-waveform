// bring sample from 0..1 value to amplitude range
float reamp(float v, vec2 amp) {
	return v * (amp.y - amp.x) + amp.x;
}

#pragma glslify: export(reamp)
