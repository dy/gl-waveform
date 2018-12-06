'use strict';

function _slicedToArray(arr, i) {
  return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest();
}

function _arrayWithHoles(arr) {
  if (Array.isArray(arr)) return arr;
}

function _iterableToArrayLimit(arr, i) {
  var _arr = [];
  var _n = true;
  var _d = false;
  var _e = undefined;

  try {
    for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
      _arr.push(_s.value);

      if (i && _arr.length === i) break;
    }
  } catch (err) {
    _d = true;
    _e = err;
  } finally {
    try {
      if (!_n && _i["return"] != null) _i["return"]();
    } finally {
      if (_d) throw _e;
    }
  }

  return _arr;
}

function _nonIterableRest() {
  throw new TypeError("Invalid attempt to destructure non-iterable instance");
}

// http://stackoverflow.com/questions/442404/dynamically-retrieve-the-position-x-y-of-an-html-element
module.exports = function (el) {
  if (el.getBoundingClientRect) {
    return el.getBoundingClientRect();
  } else {
    var x = 0,
        y = 0;

    do {
      x += el.offsetLeft - el.scrollLeft;
      y += el.offsetTop - el.scrollTop;
    } while (el = el.offsetParent);

    return {
      "left": x,
      "top": y
    };
  }
};

var offset = /*#__PURE__*/Object.freeze({

});

function getCjsExportFromNamespace (n) {
	return n && n.default || n;
}

var elOffset = getCjsExportFromNamespace(offset);

var pick = require('pick-by-alias');

var extend = require('object-assign');

var WeakMap = require('weak-map');

var createRegl = require('regl');

var parseRect = require('parse-rect');

var createGl = require('gl-util/context');

var isObj = require('is-plain-obj');

var pool = require('typedarray-pool');

var glsl = require('glslify');

var rgba = require('color-normalize');

var neg0 = require('negative-zero');

var f32 = require('to-float32');

var parseUnit = require('parse-unit');

var px = require('to-px');

var flatten = require('flatten-vertex-data');

var lerp = require('lerp');

var isBrowser = require('is-browser'); // FIXME: it is possible to oversample thick lines by scaling them with projected limit to vertical instead of creating creases


var shaderCache = new WeakMap();

function Waveform(o) {
  if (!(this instanceof Waveform)) return new Waveform(o); // stack of textures with sample data

  this.textures = [];
  this.texturesFract = [];
  this.textureLength = this.textureSize[0] * this.textureSize[1]; // total number of samples

  this.total = 0; // pointer to the first/last x values, detected from the first data
  // used for organizing data gaps

  this.firstX, this.lastY, this.lastX;
  this.shader = this.createShader(o);
  this.gl = this.shader.gl;
  this.regl = this.shader.regl;
  this.canvas = this.gl.canvas; // FIXME: add beter recognition
  // if (o.pick != null) this.storeData = !!o.pick
  // if (o.fade != null) this.fade = !!o.fade

  if (isObj(o)) this.update(o);
} // create waveform shader, called once per gl context


Waveform.prototype.createShader = function (o) {
  var regl, gl, shader;
  if (!o) o = {}; // check shader cache

  shader = shaderCache.get(o);
  if (shader) return shader;
  if (isRegl(o)) o = {
    regl: o // we let regl init window/container in default case
    // because it binds resize event to window

  };

  if (isObj(o) && !o.canvas && !o.gl && !o.regl) {
    regl = createRegl({
      extensions: 'oes_texture_float'
    });
    gl = regl._gl;
    shader = shaderCache.get(gl);
    if (shader) return shader;
  } else {
    gl = createGl(o);
    shader = shaderCache.get(gl);
    if (shader) return shader;
    regl = createRegl({
      gl: gl,
      extensions: 'oes_texture_float'
    });
  }

  var idBuffer = regl.buffer({
    usage: 'static',
    type: 'int16',
    data: function (N) {
      var x = Array(N * 4);

      for (var i = 0; i < N; i++) {
        x[i * 4] = i;
        x[i * 4 + 1] = 1;
        x[i * 4 + 2] = i;
        x[i * 4 + 3] = -1;
      }

      return x;
    }(this.maxSampleCount)
  });
  var shaderOptions = {
    primitive: function primitive(c, p) {
      return p.primitive || 'triangle strip';
    },
    offset: regl.prop('offset'),
    count: regl.prop('count'),
    frag: this.fade ? glsl(["﻿// fragment shader with fading based on distance from average\n\nprecision highp float;\n#define GLSLIFY 1\n\nuniform vec4 viewport;\n\nvarying vec4 fragColor;\nvarying float avgPrev, avgCurr, avgNext, sdev;\n\nconst float TAU = 6.283185307179586;\n\nfloat pdf (float x, float mean, float variance) {\n\tif (variance == 0.) return x == mean ? 9999. : 0.;\n\telse return exp(-.5 * pow(x - mean, 2.) / variance) / sqrt(TAU * variance);\n}\n\nvoid main() {\n\tfloat x = (gl_FragCoord.x - viewport.x) / viewport.z;\n\tfloat y = (gl_FragCoord.y - viewport.y) / viewport.w;\n\n\tfloat dist = min(max(\n\t\tabs(avgNext - y),\n\t\tabs(avgPrev - y)\n\t), abs(avgCurr - y));\n\n\t// gl_FragColor = fragColor;\n\t// gl_FragColor.a *= dist;\n\n\tgl_FragColor = vec4(vec3(dist * 3.), 1.);\n}\n"]) : "\n\t\tprecision highp float;\n\t\tvarying vec4 fragColor;\n\t\tvoid main() {\n\t\t\tgl_FragColor = fragColor;\n\t\t}\n\t\t",
    uniforms: {
      // we provide only 2 textures
      // in order to display texture join smoothly
      // but min zoom level is limited so
      // that only 2 textures can fit the screen
      // zoom levels higher than that give artifacts
      data0: function data0(c, p) {
        return this.textures[p.currTexture] || this.shader.blankTexture;
      },
      data1: function data1(c, p) {
        return this.textures[p.currTexture + 1] || this.shader.blankTexture;
      },
      data0fract: function data0fract(c, p) {
        return this.texturesFract[p.currTexture] || this.shader.blankTexture;
      },
      data1fract: function data1fract(c, p) {
        return this.texturesFract[p.currTexture + 1] || this.shader.blankTexture;
      },
      // data0 texture sums
      sum: function sum(c, p) {
        return this.textures[p.currTexture] ? this.textures[p.currTexture].sum : 0;
      },
      sum2: function sum2(c, p) {
        return this.textures[p.currTexture] ? this.textures[p.currTexture].sum2 : 0;
      },
      dataShape: this.textureSize,
      dataLength: this.textureLength,
      // number of samples per viewport
      span: regl.prop('span'),
      // total number of samples
      total: regl.prop('total'),
      // number of pixels between vertices
      pxStep: regl.prop('pxStep'),
      // number of pixels per sample step
      pxPerSample: regl.prop('pxPerSample'),
      // number of samples between vertices
      sampleStep: regl.prop('sampleStep'),
      translate: regl.prop('translate'),
      // circular translate by textureData
      translater: regl.prop('translater'),
      // translate rounded to sampleSteps
      translatei: regl.prop('translatei'),
      // rotated translatei
      translateri: regl.prop('translateri'),
      translateriFract: regl.prop('translateriFract'),
      // translate in terms of sample steps
      translates: regl.prop('translates'),
      // number of sample steps
      totals: regl.prop('totals'),
      // min/max amplitude
      amp: regl.prop('amp'),
      viewport: regl.prop('viewport'),
      opacity: regl.prop('opacity'),
      color: regl.prop('color'),
      thickness: regl.prop('thickness')
    },
    attributes: {
      id: {
        buffer: idBuffer,
        stride: 4,
        offset: 0
      },
      sign: {
        buffer: idBuffer,
        stride: 4,
        offset: 2
      }
    },
    blend: {
      enable: true,
      color: [0, 0, 0, 0],
      equation: {
        rgb: 'add',
        alpha: 'add'
      },
      func: {
        srcRGB: 'src alpha',
        dstRGB: 'one minus src alpha',
        srcAlpha: 'one minus dst alpha',
        dstAlpha: 'one'
      }
    },
    depth: {
      // FIXME: disable for the case of null folding
      enable: true
    },
    scissor: {
      enable: true,
      box: function box(c, _ref) {
        var viewport = _ref.viewport;
        return {
          x: viewport[0],
          y: viewport[1],
          width: viewport[2],
          height: viewport[3]
        };
      }
    },
    viewport: function viewport(c, _ref2) {
      var _viewport = _ref2.viewport;
      return {
        x: _viewport[0],
        y: _viewport[1],
        width: _viewport[2],
        height: _viewport[3]
      };
    },
    stencil: false
  };
  var drawRanges = regl(extend({
    vert: glsl(["// output range-average samples line with sdev weighting\n\nprecision highp float;\n#define GLSLIFY 1\n\n// linear interpolation\nvec4 lerp(vec4 a, vec4 b, float t) {\n\treturn t * b + (1. - t) * a;\n}\nvec2 lerp(vec2 a, vec2 b, float t) {\n\treturn t * b + (1. - t) * a;\n}\n\n// pick texture sample linearly interpolated:\n// default webgl interpolation is more broken\n\nuniform vec2 dataShape;\nuniform float sum, sum2;\n\n// pick integer offset\nvec4 picki (sampler2D data0_0, sampler2D data1_0, float offset_0, float baseOffset_0, float translate_0) {\n\toffset_0 = max(offset_0, 0.);\n\n\t// translate is here in order to remove float32 error (at the latest stage)\n\toffset_0 += translate_0;\n\tbaseOffset_0 += translate_0;\n\n\tvec2 uv = vec2(\n\t\tfloor(mod(offset_0, dataShape.x)) + .5,\n\t\tfloor(offset_0 / dataShape.x) + .5\n\t) / dataShape;\n\n\tvec4 sample;\n\n\t// use last sample for textures past 2nd\n\t// TODO: remove when multipass rendering is implemented\n\tif (uv.y > 2.) {\n\t\tsample = texture2D(data1_0, vec2(1, 1));\n\t\tsample.x = 0.;\n\t}\n\telse if (uv.y > 1.) {\n\t\tuv.y = uv.y - 1.;\n\n\t\tsample = texture2D(data1_0, uv);\n\n\t\t// if right sample is from the next texture - align it to left texture\n\t\tif (offset_0 >= dataShape.x * dataShape.y &&\n\t\t\tbaseOffset_0 < dataShape.x * dataShape.y) {\n\t\t\tsample.y += sum;\n\t\t\tsample.z += sum2;\n\t\t}\n\t}\n\telse {\n\t\tsample = texture2D(data0_0, uv);\n\t}\n\n\treturn sample;\n}\n\n// shift is passed separately for higher float32 precision of offset\n// export pickLinear for the case of emulating texture linear interpolation\nvec4 pick (sampler2D data0_0, sampler2D data1_0, float offset_0, float baseOffset_0, float translate_0) {\n\tfloat offsetLeft = floor(offset_0);\n\tfloat offsetRight = ceil(offset_0);\n\tfloat t = offset_0 - offsetLeft;\n\n\tif (t == 0. || offsetLeft == offsetRight) {\n\t\tvec4 left = picki(data0_0, data1_0, offsetLeft, baseOffset_0, translate_0);\n\t\treturn left;\n\t}\n\telse {\n\t\tvec4 left = picki(data0_0, data1_0, offsetLeft, baseOffset_0, translate_0);\n\t\tvec4 right = picki(data0_0, data1_0, offsetRight, baseOffset_0, translate_0);\n\n\t\treturn lerp(left, right, t);\n\t}\n}\n\nvec4 pick (sampler2D data0_0, sampler2D data1_0, float a_0, float b_0) {\n\treturn pick(data0_0, data1_0, a_0, b_0, 0.);\n}\n\n// linear interpolation\n\nfloat reamp(float v, vec2 amp) {\n\treturn (v - amp.x) / (amp.y - amp.x);\n}\n\nattribute float id, sign;\n\nuniform sampler2D data0, data1, data0fract, data1fract;\nuniform float opacity, thickness, pxStep, pxPerSample, sampleStep, total, totals, translate, dataLength, translateri, translateriFract, translater, translatei, translates;\nuniform vec4 viewport, color;\nuniform  vec2 amp;\n\nvarying vec4 fragColor;\nvarying float avgPrev, avgCurr, avgNext, sdev;\n\nvoid main() {\n\tgl_PointSize = 1.5;\n\n\tfragColor = color / 255.;\n\tfragColor.a *= opacity;\n\n\tfloat offset = id * sampleStep + translateriFract;\n\n\t// compensate snapping for low scale levels\n\tfloat posShift = pxPerSample < 1. ? 0. : id + (translater - offset - translateri) / sampleStep;\n\n\tbool isPrevStart = id == 1.;\n\tbool isStart = id <= 0.;//-translates;\n\tbool isEnd = id >= floor(totals - translates - 1.);\n\n\tfloat baseOffset = offset - sampleStep * 2.;\n\tfloat offset0 = offset - sampleStep;\n\tfloat offset1 = offset;\n\tif (isEnd) offset = total - 1.;\n\n\t// DEBUG: mark adjacent texture with different color\n\t// if (translate + (id + 1.) * sampleStep > 8192. * 2.) {\n\t// \tfragColor.x *= .5;\n\t// }\n\t// if (isEnd) fragColor = vec4(0,0,1,1);\n\t// if (isStart) fragColor = vec4(0,0,1,1);\n\n\t// calc average of curr..next sampling points\n\t// vec4 sample0 = isStart ? vec4(0) : pick(data0, data1, offset0, baseOffset, translateri);\n\tvec4 sample0 = pick(data0, data1, offset0, baseOffset, translateri);\n\tvec4 sample1 = pick(data0, data1, offset1, baseOffset, translateri);\n\tvec4 samplePrev = pick(data0, data1, baseOffset, baseOffset, translateri);\n\tvec4 sampleNext = pick(data0, data1, offset + sampleStep, baseOffset, translateri);\n\n\t// avgCurr = isStart ? sample1.x : (sample1.y - sample0.y) / sampleStep;\n\tavgPrev = baseOffset < 0. ? sample0.x : (sample0.y - samplePrev.y) / sampleStep;\n\tavgNext = (sampleNext.y - sample1.y) / sampleStep;\n\n\t// error proof variance calculation\n\tfloat offset0l = floor(offset0);\n\tfloat offset1l = floor(offset1);\n\tfloat t0 = offset0 - offset0l;\n\tfloat t1 = offset1 - offset1l;\n\tfloat offset0r = offset0l + 1.;\n\tfloat offset1r = offset1l + 1.;\n\n\t// ALERT: this formula took 7 days\n\t// the order of operations is important to provide precision\n\t// that comprises linear interpolation and range calculation\n\t// x - amplitude, y - sum, z - sum2\n\tif (isStart) {\n\t\tavgCurr = sample1.x;\n\t}\n\telse if (isPrevStart) {\n\tvec4 sample0f = pick(data0fract, data1fract, offset0, baseOffset, translateri);\n\tvec4 sample1f = pick(data0fract, data1fract, offset1, baseOffset, translateri);\n\t\tavgCurr = (sample1.y - sample0.y) / sampleStep;\n\t}\n\telse {\n\t\tavgCurr = (\n\t\t\t+ pick(data0, data1, offset1l, baseOffset, translateri).y\n\t\t\t- pick(data0, data1, offset0l, baseOffset, translateri).y\n\t\t\t+ pick(data0fract, data1fract, offset1l, baseOffset, translateri).y\n\t\t\t- pick(data0fract, data1fract, offset0l, baseOffset, translateri).y\n\t\t\t+ t1 * (pick(data0, data1, offset1r, baseOffset, translateri).y - pick(data0, data1, offset1l, baseOffset, translateri).y)\n\t\t\t- t0 * (pick(data0, data1, offset0r, baseOffset, translateri).y - pick(data0, data1, offset0l, baseOffset, translateri).y)\n\t\t\t+ t1 * (pick(data0fract, data1fract, offset1r, baseOffset, translateri).y - pick(data0, data1, offset1l, baseOffset, translateri).y)\n\t\t\t- t0 * (pick(data0fract, data1fract, offset0r, baseOffset, translateri).y - pick(data0, data1, offset0l, baseOffset, translateri).y)\n\t\t) / sampleStep;\n\t}\n\n\tfloat mx2 = (\n\t\t+ pick(data0, data1, offset1l, baseOffset, translateri).z\n\t\t- pick(data0, data1, offset0l, baseOffset, translateri).z\n\t\t+ pick(data0fract, data1fract, offset1l, baseOffset, translateri).z\n\t\t- pick(data0fract, data1fract, offset0l, baseOffset, translateri).z\n\t\t+ t1 * (pick(data0, data1, offset1r, baseOffset, translateri).z - pick(data0, data1, offset1l, baseOffset, translateri).z)\n\t\t- t0 * (pick(data0, data1, offset0r, baseOffset, translateri).z - pick(data0, data1, offset0l, baseOffset, translateri).z)\n\t\t+ t1 * (pick(data0fract, data1fract, offset1r, baseOffset, translateri).z - pick(data0, data1, offset1l, baseOffset, translateri).z)\n\t\t- t0 * (pick(data0fract, data1fract, offset0r, baseOffset, translateri).z - pick(data0, data1, offset0l, baseOffset, translateri).z)\n\t)  / sampleStep;\n\tfloat m2 = avgCurr * avgCurr;\n\n\t// σ(x)² = M(x²) - M(x)²\n\tfloat variance = abs(mx2 - m2);\n\n\tsdev = sqrt(variance);\n\tsdev /= abs(amp.y - amp.x);\n\n\tavgCurr = reamp(avgCurr, amp);\n\tavgNext = reamp(avgNext, amp);\n\tavgPrev = reamp(avgPrev, amp);\n\n\t// compensate for sampling rounding\n\tvec2 position = vec2(\n\t\t(pxStep * (id - posShift) ) / viewport.z,\n\t\tavgCurr\n\t);\n\n\tfloat x = pxStep / viewport.z;\n\tvec2 normalLeft = normalize(vec2(\n\t\t-(avgCurr - avgPrev), x\n\t) / viewport.zw);\n\tvec2 normalRight = normalize(vec2(\n\t\t-(avgNext - avgCurr), x\n\t) / viewport.zw);\n\n\tvec2 bisec = normalize(normalLeft + normalRight);\n\tvec2 vert = vec2(0, 1);\n\tfloat bisecLen = abs(1. / dot(normalLeft, bisec));\n\tfloat vertRightLen = abs(1. / dot(normalRight, vert));\n\tfloat vertLeftLen = abs(1. / dot(normalLeft, vert));\n\tfloat maxVertLen = max(vertLeftLen, vertRightLen);\n\tfloat minVertLen = min(vertLeftLen, vertRightLen);\n\tfloat vertSdev = 2. * sdev * viewport.w / thickness;\n\n\tvec2 join;\n\n\tif (isStart || isPrevStart) {\n\t\tjoin = normalRight;\n\t}\n\telse if (isEnd) {\n\t\tjoin = normalLeft;\n\t}\n\t// sdev less than projected to vertical shows simple line\n\t// FIXME: sdev should be compensated by curve bend\n\telse if (vertSdev < maxVertLen) {\n\t\t// sdev more than normal but less than vertical threshold\n\t\t// rotates join towards vertical\n\t\tif (vertSdev > minVertLen) {\n\t\t\tfloat t = (vertSdev - minVertLen) / (maxVertLen - minVertLen);\n\t\t\tjoin = lerp(bisec * bisecLen, vert * maxVertLen, t);\n\t\t}\n\t\telse {\n\t\t\tjoin = bisec * bisecLen;\n\t\t}\n\t}\n\t// sdev more than projected to vertical modifies only y coord\n\telse {\n\t\tjoin = vert * vertSdev;\n\t}\n\tposition += sign * join * .5 * thickness / viewport.zw;\n\tgl_Position = vec4(position * 2. - 1., 0, 1);\n}\n"])
  }, shaderOptions));
  var drawLine = regl(extend({
    vert: glsl(["// direct sample output, connected by line, to the contrary to range\n\nprecision highp float;\n#define GLSLIFY 1\n\n// pick texture sample linearly interpolated:\n// default webgl interpolation is more broken\n\n// linear interpolation\nvec4 lerp(vec4 a, vec4 b, float t) {\n\treturn t * b + (1. - t) * a;\n}\nvec2 lerp(vec2 a, vec2 b, float t) {\n\treturn t * b + (1. - t) * a;\n}\n\nuniform vec2 dataShape;\nuniform float sum, sum2;\n\n// pick integer offset\nvec4 picki (sampler2D data0_0, sampler2D data1_0, float offset_0, float baseOffset, float translate_0) {\n\toffset_0 = max(offset_0, 0.);\n\n\t// translate is here in order to remove float32 error (at the latest stage)\n\toffset_0 += translate_0;\n\tbaseOffset += translate_0;\n\n\tvec2 uv = vec2(\n\t\tfloor(mod(offset_0, dataShape.x)) + .5,\n\t\tfloor(offset_0 / dataShape.x) + .5\n\t) / dataShape;\n\n\tvec4 sample;\n\n\t// use last sample for textures past 2nd\n\t// TODO: remove when multipass rendering is implemented\n\tif (uv.y > 2.) {\n\t\tsample = texture2D(data1_0, vec2(1, 1));\n\t\tsample.x = 0.;\n\t}\n\telse if (uv.y > 1.) {\n\t\tuv.y = uv.y - 1.;\n\n\t\tsample = texture2D(data1_0, uv);\n\n\t\t// if right sample is from the next texture - align it to left texture\n\t\tif (offset_0 >= dataShape.x * dataShape.y &&\n\t\t\tbaseOffset < dataShape.x * dataShape.y) {\n\t\t\tsample.y += sum;\n\t\t\tsample.z += sum2;\n\t\t}\n\t}\n\telse {\n\t\tsample = texture2D(data0_0, uv);\n\t}\n\n\treturn sample;\n}\n\n// shift is passed separately for higher float32 precision of offset\n// export pickLinear for the case of emulating texture linear interpolation\nvec4 pick (sampler2D data0_0, sampler2D data1_0, float offset_0, float baseOffset, float translate_0) {\n\tfloat offsetLeft = floor(offset_0);\n\tfloat offsetRight = ceil(offset_0);\n\tfloat t = offset_0 - offsetLeft;\n\n\tif (t == 0. || offsetLeft == offsetRight) {\n\t\tvec4 left = picki(data0_0, data1_0, offsetLeft, baseOffset, translate_0);\n\t\treturn left;\n\t}\n\telse {\n\t\tvec4 left = picki(data0_0, data1_0, offsetLeft, baseOffset, translate_0);\n\t\tvec4 right = picki(data0_0, data1_0, offsetRight, baseOffset, translate_0);\n\n\t\treturn lerp(left, right, t);\n\t}\n}\n\nvec4 pick (sampler2D data0_0, sampler2D data1_0, float a_0, float b_0) {\n\treturn pick(data0_0, data1_0, a_0, b_0, 0.);\n}\n\n// linear interpolation\n\nfloat reamp(float v, vec2 amp) {\n\treturn (v - amp.x) / (amp.y - amp.x);\n}\n\nattribute float id, sign;\n\nuniform sampler2D data0, data1, data0fract, data1fract;\nuniform float opacity, thickness, pxStep, pxPerSample, sampleStep, total, totals, translate, dataLength, translateri, translater, translatei, translates;\nuniform vec4 viewport, color;\nuniform vec2 amp;\n\nvarying vec4 fragColor;\nvarying float avgPrev, avgCurr, avgNext, sdev;\n\nbool isNaN( float val ){\n  return ( val < 0.0 || 0.0 < val || val == 0.0 ) ? false : true;\n}\n\nvoid main () {\n\tgl_PointSize = 1.5;\n\n\tfragColor = color / 255.;\n\tfragColor.a *= opacity;\n\n\tfloat offset = id * sampleStep;\n\n\t// compensate snapping for low scale levels\n\tfloat posShift = pxPerSample < 1. ? 0. : id + (translater - offset - translateri) / sampleStep;\n\n\tbool isStart = id <= -translates;\n\tbool isEnd = id >= floor(totals - translates - 1.);\n\n\t// DEBUG: mark adjacent texture with different color\n\t// if (translate + (id) * sampleStep > 64. * 64.) {\n\t// \tfragColor.x *= .5;\n\t// }\n\t// if (isEnd) fragColor = vec4(0,0,1,1);\n\t// if (isStart) fragColor = vec4(0,0,1,1);\n\n\t// calc average of curr..next sampling points\n\tvec4 sampleCurr = pick(data0, data1, offset, offset - sampleStep, translateri);\n\tvec4 sampleNext = pick(data0, data1, offset + sampleStep, offset - sampleStep, translateri);\n\tvec4 samplePrev = pick(data0, data1, offset - sampleStep, offset - sampleStep, translateri);\n\n\tavgCurr = reamp(sampleCurr.x, amp);\n\tavgNext = reamp(isNaN(sampleNext.x) ? sampleCurr.x : sampleNext.x, amp);\n\tavgPrev = reamp(isNaN(samplePrev.x) ? sampleCurr.x : samplePrev.x, amp);\n\n\tsdev = 0.;\n\n\tvec2 position = vec2(\n\t\tpxStep * (id - posShift) / viewport.z,\n\t\tavgCurr\n\t);\n\n\tfloat x = pxStep / viewport.z;\n\tvec2 normalLeft = normalize(vec2(\n\t\t-(avgCurr - avgPrev), x\n\t) / viewport.zw);\n\tvec2 normalRight = normalize(vec2(\n\t\t-(avgNext - avgCurr), x\n\t) / viewport.zw);\n\n\tvec2 join;\n\tif (isStart || isNaN(samplePrev.x)) {\n\t\tjoin = normalRight;\n\t}\n\telse if (isEnd || isNaN(sampleNext.x)) {\n\t\tjoin = normalLeft;\n\t}\n\telse {\n\t\tvec2 bisec = normalize(normalLeft + normalRight);\n\t\tfloat bisecLen = abs(1. / dot(normalLeft, bisec));\n\t\tjoin = bisec * bisecLen;\n\t}\n\n\t// FIXME: limit join by prev vertical\n\t// float maxJoinX = min(abs(join.x * thickness), 40.) / thickness;\n\t// join.x *= maxJoinX / join.x;\n\n\tposition += sign * join * .5 * thickness / viewport.zw;\n\tgl_Position = vec4(position * 2. - 1., 0, 1);\n}\n"])
  }, shaderOptions)); // let drawPick = regl(extend({
  // 	frag: glsl('./shader/pick-frag.glsl')
  // }))

  var blankTexture = regl.texture({
    width: 1,
    height: 1,
    channels: this.textureChannels,
    type: 'float'
  });
  shader = {
    drawRanges: drawRanges,
    drawLine: drawLine,
    regl: regl,
    idBuffer: idBuffer,
    blankTexture: blankTexture,
    gl: gl
  };
  shaderCache.set(gl, shader);
  return shader;
}; // calculate draw options


Waveform.prototype.calc = function () {
  var range = [this.range[0] - this.firstX, this.range[1] - this.firstX];
  var total = this.total,
      opacity = this.opacity,
      amp = this.amp; // FIXME: remove
  // r[0] = -4
  // r[1] = 40

  var color = this.color;
  var thickness = this.thickness; // calc runtime props

  var viewport;
  if (!this.viewport) viewport = [0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight];else viewport = [this.viewport.x, this.viewport.y, this.viewport.width, this.viewport.height]; // invert viewport if necessary

  if (!this.flip) {
    viewport[1] = this.gl.drawingBufferHeight - viewport[1] - viewport[3];
  }

  var span;
  if (!range) span = viewport[2];else span = range[1] - range[0];
  var dataLength = this.textureLength;
  var pxStep = Math.max( // width / span makes step correspond to texture samples
  viewport[2] / Math.abs(span), // pxStep affects jittering on panning, .5 is good value
  this.pxStep || Math.pow(thickness, .1) * .1);
  var sampleStep = pxStep * span / viewport[2];
  var pxPerSample = pxStep / sampleStep; // translate is calculated so to meet conditions:
  // - sampling always starts at 0 sample of 0 texture
  // - panning never breaks that rule
  // - changing sampling step never breaks that rule
  // - to reduce error for big translate, it is rotated by textureLength
  // - panning is always perceived smooth

  var translate = range[0];
  var translater = translate % dataLength;
  var translates = Math.floor(translate / sampleStep);
  var translatei = translates * sampleStep;
  var translateri = Math.floor(translatei % dataLength);
  var translateriFract = translatei % dataLength - translateri; // correct translater to always be under translateri
  // for correct posShift in shader

  if (translater < translateri) translater += dataLength; // NOTE: this code took ~3 days
  // please beware of circular texture join cases and low scales
  // .1 / sampleStep is error compensation

  var totals = Math.floor(this.total / sampleStep + .1 / sampleStep);
  var currTexture = Math.floor(translatei / dataLength);
  if (translateri < 0) currTexture += 1; // limit not existing in texture points

  var offset = 2 * Math.max(-translates, 0);
  var count = Math.max(2, Math.min( // number of visible texture sampling points
  // 2. * Math.floor((dataLength * Math.max(0, (2 + Math.min(currTexture, 0))) - (translate % dataLength)) / sampleStep),
  // number of available data points
  2 * Math.floor(totals - Math.max(translates, 0)), // number of visible vertices on the screen
  2 * Math.ceil(viewport[2] / pxStep) + 4, // number of ids available
  this.maxSampleCount)); // use more complicated range draw only for sample intervals
  // note that rangeDraw gives sdev error for high values dataLength

  var drawOptions = {
    offset: offset,
    count: count,
    thickness: thickness,
    color: color,
    pxStep: pxStep,
    pxPerSample: pxPerSample,
    viewport: viewport,
    translate: translate,
    translater: translater,
    totals: totals,
    translatei: translatei,
    translateri: translateri,
    translateriFract: translateriFract,
    translates: translates,
    currTexture: currTexture,
    sampleStep: sampleStep,
    span: span,
    total: total,
    opacity: opacity,
    amp: amp
  };
  return drawOptions;
}; // draw frame according to state


Waveform.prototype.render = function () {
  var o = this.calc(); // range case

  if (o.pxPerSample <= 1.) {
    this.shader.drawRanges.call(this, o); // this.shader.drawRanges.call(this, extend(drawOptions, {
    // 	primitive: 'points',
    // 	color: [0,0,0,255]
    // }))
    // this.shader.drawRanges.call(this, extend(drawOptions, {
    // 	primitive: 'points',
    // 	thickness: 0,
    // 	color: [0,0,0,255]
    // }))
  } // line case
  else {
      this.shader.drawLine.call(this, o); // this.shader.drawLine.call(this, extend(drawOptions, {
      // 	primitive: 'points',
      // 	color: [0,0,0,255]
      // }))
      // this.shader.drawLine.call(this, extend(drawOptions, {
      // 	primitive: 'points',
      // 	thickness: 0,
      // 	color: [0,0,0,255]
      // }))
    }

  return this;
}; // get data at a point


Waveform.prototype.pick = function (x) {
  if (!this.storeData) throw Error('Picking is disabled. Enable it via constructor options.');

  if (typeof x !== 'number') {
    x = Math.max(x.clientX - elOffset(this.canvas).left, 0);
  }

  var _this$calc = this.calc(),
      span = _this$calc.span,
      translater = _this$calc.translater,
      translateri = _this$calc.translateri,
      viewport = _this$calc.viewport,
      currTexture = _this$calc.currTexture,
      sampleStep = _this$calc.sampleStep,
      pxPerSample = _this$calc.pxPerSample,
      pxStep = _this$calc.pxStep,
      amp = _this$calc.amp;

  var txt = this.textures[currTexture];
  if (!txt) return null;
  var xOffset = Math.floor(span * x / viewport[2]);
  var offset = Math.floor(translater + xOffset);
  var xShift = translater - translateri;
  if (offset < 0 || offset > this.total) return null;
  var ch = this.textureChannels;
  var data = txt.data;
  var samples = data.subarray(offset * ch, offset * ch + ch);
  var samplesFract = dataFract.subarray(offset * ch, offset * ch + ch); // single-value pick
  // if (pxPerSample >= 1) {

  var avg = samples[0];
  return {
    average: avg,
    sdev: 0,
    offset: [offset, offset],
    x: viewport[2] * (xOffset - xShift) / span + this.viewport.x,
    y: (-avg - amp[0]) / (amp[1] - amp[0]) * this.viewport.height + this.viewport.y // }
    // FIXME: multi-value pick

  };
}; // update visual state


Waveform.prototype.update = function (o) {
  if (!o) return this;
  if (o.length != null) o = {
    data: o
  };
  o = pick(o, {
    data: 'data value values sample samples',
    push: 'add append push insert concat',
    range: 'range dataRange dataBox dataBounds dataLimits',
    amp: 'amp amplitude amplitudes ampRange bounds limits maxAmplitude maxAmp',
    thickness: 'thickness width linewidth lineWidth line-width',
    pxStep: 'step pxStep',
    color: 'color colour colors colours fill fillColor fill-color',
    line: 'line line-style lineStyle linestyle',
    viewport: 'clip vp viewport viewBox viewbox viewPort area',
    opacity: 'opacity alpha transparency visible visibility opaque',
    flip: 'flip iviewport invertViewport inverseViewport'
  }); // parse line style

  if (o.line) {
    if (typeof o.line === 'string') {
      var parts = o.line.split(/\s+/); // 12px black

      if (/0-9/.test(parts[0][0])) {
        if (!o.thickness) o.thickness = parts[0];
        if (!o.color && parts[1]) o.color = parts[1];
      } // black 12px
      else {
          if (!o.thickness && parts[1]) o.thickness = parts[1];
          if (!o.color) o.color = parts[0];
        }
    } else {
      o.color = o.line;
    }
  }

  if (o.thickness != null) {
    this.thickness = toPx(o.thickness);
  }

  if (o.pxStep != null) {
    this.pxStep = toPx(o.pxStep);
  }

  if (o.opacity != null) {
    this.opacity = parseFloat(o.opacity);
  }

  if (o.viewport != null) {
    this.viewport = parseRect(o.viewport);
  }

  if (this.viewport == null) {
    this.viewport = {
      x: 0,
      y: 0,
      width: this.gl.drawingBufferWidth,
      height: this.gl.drawingBufferHeight
    };
  }

  if (o.flip) {
    this.flip = !!o.viewport;
  }

  if (!this.range && !o.range) {
    o.range = [0, Math.min(this.viewport.width, this.textureLength)];
  } // custom/default visible data window


  if (o.range != null) {
    if (o.range.length) {
      this.range = [o.range[0], o.range[1]];
    } else if (typeof o.range === 'number') {
      this.range = [-o.range, -0];
    }
  }

  if (o.amp) {
    if (typeof o.amp === 'number') {
      this.amp = [-o.amp, +o.amp];
    } else if (o.amp.length) {
      this.amp = [o.amp[0], o.amp[1]];
    }
  } // if (o.lineMode != null) {
  // 	if (typeof o.lineMode === 'number' || typeof o.lineMode === 'string') {
  // 		this.lineMode = toPx(o.lineMode)
  // 	}
  // 	else {
  // 		this.lineMode = !!o.lineMode
  // 	}
  // }
  // flatten colors to a single uint8 array


  if (o.color != null) {
    if (!o.color) o.color = 'transparent'; // single color

    if (typeof o.color === 'string') {
      this.color = rgba(o.color, 'uint8');
    } // flat array
    else if (typeof o.color[0] === 'number') {
        var l = Math.max(o.color.length, 4);
        pool.freeUint8(this.color);
        this.color = pool.mallocUint8(l);
        var sub = (o.color.subarray || o.color.slice).bind(o.color);

        for (var i = 0; i < l; i += 4) {
          this.color.set(rgba(sub(i, i + 4), 'uint8'), i);
        }
      } // nested array
      else {
          var _l = o.color.length;
          pool.freeUint8(this.color);
          this.color = pool.mallocUint8(_l * 4);

          for (var _i = 0; _i < _l; _i++) {
            this.color.set(rgba(o.color[_i], 'uint8'), _i * 4);
          }
        }
  } // reset sample textures if new samples data passed


  if (o.data) {
    this.textures.forEach(function (txt) {
      return txt.destroy();
    });
    this.texturesFract.forEach(function (txt) {
      return txt.destroy();
    });
    this.total = 0;
    this.push(o.data);
  } // call push method


  if (o.push) {
    this.push(o.push);
  }

  return this;
}; // put new samples into texture


Waveform.prototype.push = function (samples) {
  if (!samples || !samples.length) return; // [{x, y}, {x, y}, ...]
  // [[x, y], [x, y], ...]

  if (typeof samples[0] !== 'number') {
    var _data = []; // detect xStep
    // TODO: cases: gradient, animation stops, continuous functions, lerp of array, span-array

    if (!this.xStep) ; // for (let i = 1; i < samples.length; i++) {
    // }
    // normalize {x, y} objects to flat array


    for (var i = 0; i < samples.length; i++) {
      var coord = samples[i],
          _x = void 0,
          _y = void 0; // [x, y]


      if (coord.length) {
        var _coord = _slicedToArray(coord, 2);

        _x = _coord[0];
        _y = _coord[1];
      } // {x, y}
      else if (coord.x != null) {
          _x = coord.x;
          _y = coord.y;
        }

      if (this.firstX == null) {
        this.firstX = _x;

        _data.push(_y);
      }

      if (_x <= this.lastX) throw Error("Passed x value ".concat(_x, " is <= the last x value ").concat(this.lastX, ".")); // push interpolated samples

      var n = _x - this.lastX;

      for (var j = 1; j <= n; j++) {
        if (_y == null || isNaN(_y)) _data.push(NaN);else _data.push(lerp(this.lastY, _y, j / n));
      }

      this.lastX = _x;
      this.lastY = _y;
    }

    samples = _data;
  } else {
    if (this.firstX == null) this.firstX = 0;
  }

  if (Array.isArray(samples)) {
    var floatSamples = pool.mallocFloat64(samples.length);
    floatSamples.set(samples);
    samples = floatSamples;
  }

  var _this$textureSize = _slicedToArray(this.textureSize, 2),
      txtW = _this$textureSize[0],
      txtH = _this$textureSize[1];

  var txtLen = this.textureLength;
  var amp = this.amp[1] - this.amp[0];
  var offset = this.total % txtLen;
  var id = Math.floor(this.total / txtLen);
  var y = Math.floor(offset / txtW);
  var x = offset % txtW;
  var tillEndOfTxt = txtLen - offset;
  var ch = this.textureChannels; // get current texture

  var txt = this.textures[id];
  var txtFract = this.texturesFract[id];

  if (!txt) {
    txt = this.textures[id] = this.regl.texture({
      width: this.textureSize[0],
      height: this.textureSize[1],
      channels: this.textureChannels,
      type: 'float',
      min: 'nearest',
      mag: 'nearest',
      // min: 'linear',
      // mag: 'linear',
      wrap: ['clamp', 'clamp']
    });
    this.lastY = txt.sum = txt.sum2 = 0;
    txtFract = this.texturesFract[id] = this.regl.texture({
      width: this.textureSize[0],
      height: this.textureSize[1],
      channels: this.textureChannels,
      type: 'float',
      min: 'nearest',
      mag: 'nearest',
      // min: 'linear',
      // mag: 'linear',
      wrap: ['clamp', 'clamp']
    });

    if (this.storeData) {
      txt.data = pool.mallocFloat64(txtLen * ch);
    }
  } // calc sum, sum2 and form data for the samples


  var dataLen = Math.min(tillEndOfTxt, samples.length);
  var data = this.storeData ? txt.data.subarray(offset * ch, offset * ch + dataLen * ch) : pool.mallocFloat(dataLen * ch);

  for (var _i2 = 0, l = dataLen; _i2 < l; _i2++) {
    // put NaN samples as indicators of blank samples
    if (samples[_i2] == null || isNaN(samples[_i2])) {
      data[_i2 * ch] = NaN;
    } else {
      data[_i2 * ch] = this.lastY = samples[_i2];
    }

    txt.sum += this.lastY;
    txt.sum2 += this.lastY * this.lastY; // we cannot rotate sums here because there can be any number of rotations between two edge samples
    // also that is hard to guess correct rotation limit, that can change at any new data
    // so we just keep precise secondary texture and hope the sum is not huge enough to reset at the next texture

    data[_i2 * ch + 1] = txt.sum;
    data[_i2 * ch + 2] = txt.sum2;
  }

  this.total += dataLen; // fullfill last unfinished row

  var firstRowWidth = 0;

  if (x) {
    firstRowWidth = Math.min(txtW - x, dataLen);
    txt.subimage({
      width: firstRowWidth,
      height: 1,
      data: f32.float(data.subarray(0, firstRowWidth * ch))
    }, x, y);
    txtFract.subimage({
      width: firstRowWidth,
      height: 1,
      data: f32.fract(data.subarray(0, firstRowWidth * ch))
    }, x, y); // if data is shorter than the texture row - skip the rest

    if (x + samples.length <= txtW) {
      pool.freeFloat64(samples);
      if (!this.storeData) pool.freeFloat64(data);
      return;
    }

    y++; // shortcut next texture block

    if (y === txtH) {
      if (!this.storeData) pool.freeFloat64(data);
      this.push(samples.subarray(firstRowWidth));
      pool.freeFloat(samples);
      return;
    }

    offset += firstRowWidth;
  } // put rect with data


  var h = Math.floor((dataLen - firstRowWidth) / txtW);
  var blockLen = 0;

  if (h) {
    blockLen = h * txtW;
    txt.subimage({
      width: txtW,
      height: h,
      data: f32.float(data.subarray(firstRowWidth * ch, (firstRowWidth + blockLen) * ch))
    }, 0, y);
    txtFract.subimage({
      width: txtW,
      height: h,
      data: f32.fract(data.subarray(firstRowWidth * ch, (firstRowWidth + blockLen) * ch))
    }, 0, y);
    y += h;
  } // put last row


  var lastRowWidth = dataLen - firstRowWidth - blockLen;

  if (lastRowWidth) {
    txt.subimage({
      width: lastRowWidth,
      height: 1,
      data: f32.float(data.subarray(-lastRowWidth * ch))
    }, 0, y);
    txtFract.subimage({
      width: lastRowWidth,
      height: 1,
      data: f32.fract(data.subarray(-lastRowWidth * ch))
    }, 0, y);
  } // shorten block till the end of texture


  if (tillEndOfTxt < samples.length) {
    this.push(samples.subarray(tillEndOfTxt));
    pool.freeFloat64(samples);
    if (!this.storeData) pool.freeFloat64(data);
    return;
  }
}; // clear viewport area occupied by the renderer


Waveform.prototype.clear = function () {
  var gl = this.gl,
      regl = this.regl;
  var _this$viewport = this.viewport,
      x = _this$viewport.x,
      y = _this$viewport.y,
      width = _this$viewport.width,
      height = _this$viewport.height;
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(x, y, width, height); // FIXME: avoid depth here

  regl.clear({
    color: [0, 0, 0, 0],
    depth: 1
  });
  gl.clear(gl.COLOR_BUFFRE_BIT | gl.DEPTH_BUFFER_BIT);
  gl.disable(gl.SCISSOR_TEST);
  return this;
}; // dispose all resources


Waveform.prototype.destroy = function () {
  var _this = this;

  this.textures.forEach(function (txt) {
    if (_this.storeData) pool.freeFloat64(txt.data);
    txt.destroy();
  });
  this.texturesFract.forEach(function (txt) {
    txt.destroy();
  });
}; // style


Waveform.prototype.color = new Uint8Array([0, 0, 0, 255]);
Waveform.prototype.opacity = 1;
Waveform.prototype.thickness = 1;
Waveform.prototype.fade = false; // clip area

Waveform.prototype.viewport = null;
Waveform.prototype.flip = false; // data range

Waveform.prototype.range = null;
Waveform.prototype.amp = [-1, 1]; // Texture size affects
// - sdev error: bigger texture accumulate sum2 error so signal looks more fluffy
// - performance: bigger texture is slower to create
// - zoom level: only 2 textures per screen are available, so zoom is limited
// - max number of textures

Waveform.prototype.textureSize = [512, 512];
Waveform.prototype.textureChannels = 4;
Waveform.prototype.maxSampleCount = 8192 * 2; // interval between adjacen x values
// we guess input data is homogenous and doesn't suddenly change type/direction
// or does not have skipped samples
// but sometimes step can vary a bit, ~3% of average, like measured time
// so we detect the step from the first chunk of data

Waveform.prototype.xStep = null;
Waveform.prototype.storeData = true;

function isRegl(o) {
  return typeof o === 'function' && o._gl && o.prop && o.texture && o.buffer;
}

function toPx(str) {
  if (typeof str === 'number') return str;
  if (!isBrowser) return parseFloat(str);
  var unit = parseUnit(str);
  return unit[0] * px(unit[1]);
}

var glWaveform = Waveform;

module.exports = glWaveform;
