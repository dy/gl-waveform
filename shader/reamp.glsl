// bring sample value to 0..1 from amplitude range
float reamp(float v, vec2 amp) {
	return (v - amp.x) / (amp.y - amp.x);
}

#pragma glslify: export(reamp)
