'use strict';

function _slicedToArray(arr, i) {
  return _arrayWithHoles(arr) || _iterableToArrayLimit(arr, i) || _nonIterableRest();
}

function _toConsumableArray(arr) {
  return _arrayWithoutHoles(arr) || _iterableToArray(arr) || _nonIterableSpread();
}

function _arrayWithoutHoles(arr) {
  if (Array.isArray(arr)) {
    for (var i = 0, arr2 = new Array(arr.length); i < arr.length; i++) arr2[i] = arr[i];

    return arr2;
  }
}

function _arrayWithHoles(arr) {
  if (Array.isArray(arr)) return arr;
}

function _iterableToArray(iter) {
  if (Symbol.iterator in Object(iter) || Object.prototype.toString.call(iter) === "[object Arguments]") return Array.from(iter);
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

function _nonIterableSpread() {
  throw new TypeError("Invalid attempt to spread non-iterable instance");
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

var lerp = require('lerp');

var isBrowser = require('is-browser');

var idle = require('on-idle');

var MAX_ARGUMENTS = 1024; // FIXME: it is possible to oversample thick lines by scaling them with projected limit to vertical instead of creating creases

var shaderCache = new WeakMap();

function Waveform(o) {
  if (!(this instanceof Waveform)) return new Waveform(o); // stack of textures with sample data
  // for a single pass we provide 2 textures, covering the screen
  // every new texture resets accumulated sum/sum2 values
  // textures store [amp, sum, sum2] values
  // textures2 store [ampFract, sumFract, sum2Fract, _] values
  // ampFract has util values: -1 for NaN amplitude

  this.textures = [];
  this.textures2 = [];
  this.textureLength = this.textureShape[0] * this.textureShape[1]; // pointer to the first/last x values, detected from the first data
  // used for organizing data gaps

  this.lastY;
  this.minY = Infinity, this.maxY = -Infinity; // find a good name for runtime draw state

  this.drawOptions = {}; // needs recalc

  this.needsRecalc = true;
  this.shader = this.createShader(o);
  this.gl = this.shader.gl;
  this.regl = this.shader.regl;
  this.canvas = this.gl.canvas; // tick processes accumulated samples to push in the next render frame
  // to avoid overpushing per-single value (also dangerous for wrong step detection or network delays)

  this.pushQueue = []; // FIXME: add beter recognition
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
  } //    id    0     1
  //   side  ←→    ←→
  //         **    **
  //        /||   /||   ...     ↑
  //    .../ ||  / ||  /       sign
  //         || /  || /         ↓
  //         **    **


  var idBuffer = regl.buffer({
    usage: 'static',
    type: 'int16',
    data: function (N) {
      var x = Array();

      for (var i = 0; i < N; i++) {
        // id, sign, side, id, sign, side
        x.push(i, 1, -1, i, -1, -1);
        x.push(i, 1, 1, i, -1, 1);
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
    frag: glsl(["// fragment shader with fading based on distance from average\n\nprecision highp float;\n#define GLSLIFY 1\n\nuniform vec4 viewport;\nuniform float thickness;\nuniform vec2 amp;\n\nvarying vec4 fragColor;\nvarying float avgCurr, avgPrev, avgNext, avgMin, avgMax, sdev, normThickness;\n\nconst float TAU = 6.283185307179586;\n\nfloat pdf (float x, float mean, float variance) {\n\tif (variance == 0.) return x == mean ? 9999. : 0.;\n\telse return exp(-.5 * pow(x - mean, 2.) / variance) / sqrt(TAU * variance);\n}\n\nvoid main() {\n\tfloat halfThickness = normThickness * .5;\n\n\tfloat x = (gl_FragCoord.x - viewport.x) / viewport.z;\n\tfloat y = (gl_FragCoord.y - viewport.y) / viewport.w;\n\n\t// pdfMax makes sure pdf is normalized - has 1. value at the max\n\tfloat pdfMax = pdf(0., 0., sdev * sdev  );\n\n\tfloat dist = 1.;\n\n\t// local max\n\tif (y > avgMax + halfThickness) {\n\t\tdist = min(y - avgMin, avgMax - y);\n\t\tdist = pdf(dist, 0., sdev * sdev  ) / pdfMax;\n\t}\n\t// local min\n\telse if (y < avgMin - halfThickness) {\n\t\tdist = min(y - avgMin, avgMax - y);\n\t\tdist = pdf(dist, 0., sdev * sdev  ) / pdfMax;\n\t}\n\n\tif (dist == 0.) { discard; return; }\n\n\tgl_FragColor = fragColor;\n\tgl_FragColor.a *= dist;\n}\n"]),
    uniforms: {
      // we provide only 2 textures
      // in order to display texture join smoothly
      // but min zoom level is limited so
      // that only 2 textures can fit the screen
      // zoom levels higher than that give artifacts
      'samples.data[0]': function samplesData0(c, p) {
        return this.textures[p.currTexture] || this.shader.blankTexture;
      },
      'samples.data[1]': function samplesData1(c, p) {
        return this.textures[p.currTexture + 1] || this.shader.blankTexture;
      },
      // data0 texture sums
      'samples.sum': function samplesSum(c, p) {
        return this.textures[p.currTexture] ? this.textures[p.currTexture].sum : 0;
      },
      'samples.sum2': function samplesSum2(c, p) {
        return this.textures[p.currTexture] ? this.textures[p.currTexture].sum2 : 0;
      },
      'samples.shape': this.textureShape,
      'samples.length': this.textureLength,
      // samples-compatible struct with fractions
      'fractions.data[0]': function fractionsData0(c, p) {
        return this.textures2[p.currTexture] || this.shader.blankTexture;
      },
      'fractions.data[1]': function fractionsData1(c, p) {
        return this.textures2[p.currTexture + 1] || this.shader.blankTexture;
      },
      'fractions.sum': 0,
      'fractions.sum2': 0,
      'fractions.shape': this.textureShape,
      'fractions.length': this.textureLength,
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
      amp: regl.prop('amplitude'),
      viewport: regl.prop('viewport'),
      opacity: regl.prop('opacity'),
      color: regl.prop('color'),
      thickness: regl.prop('thickness')
    },
    attributes: {
      id: {
        buffer: idBuffer,
        stride: 6,
        offset: 0
      },
      sign: {
        buffer: idBuffer,
        stride: 6,
        offset: 2
      },
      side: {
        buffer: idBuffer,
        stride: 6,
        offset: 4
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
    vert: glsl(["// output range-average samples line with sdev weighting\n\nprecision highp float;\n#define GLSLIFY 1\n\nstruct Samples {\n\tsampler2D data[2];\n\tvec2 shape;\n\tfloat length;\n\tfloat sum;\n\tfloat sum2;\n};\n\n// linear interpolation\nvec4 lerp(vec4 a, vec4 b, float t) {\n\treturn t * b + (1. - t) * a;\n}\nvec2 lerp(vec2 a, vec2 b, float t) {\n\treturn t * b + (1. - t) * a;\n}\n\n// bring sample value to 0..1 from amplitude range\nfloat reamp(float v, vec2 amp) {\n\treturn (v - amp.x) / (amp.y - amp.x);\n}\n\n// pick texture sample linearly interpolated:\n// default webgl interpolation is more broken\n\n// pick integer offset\nvec4 picki (Samples samples_0, float offset_0, float baseOffset_0, float translate_0) {\n\toffset_0 = max(offset_0, 0.);\n\n\t// translate is here in order to remove float32 error (at the latest stage)\n\toffset_0 += translate_0;\n\tbaseOffset_0 += translate_0;\n\n\tvec2 uv = vec2(\n\t\tfloor(mod(offset_0, samples_0.shape.x)) + .5,\n\t\tfloor(offset_0 / samples_0.shape.x) + .5\n\t) / samples_0.shape;\n\n\tvec4 sample;\n\n\t// use last sample for textures past 2nd\n\t// TODO: remove when multipass rendering is implemented\n\tif (uv.y > 2.) {\n\t\tsample = texture2D(samples_0.data[1], vec2(1, 1));\n\t\tsample.x = 0.;\n\t}\n\telse if (uv.y > 1.) {\n\t\tuv.y = uv.y - 1.;\n\n\t\tsample = texture2D(samples_0.data[1], uv);\n\n\t\t// if right sample is from the next texture - align it to left texture\n\t\tif (offset_0 >= samples_0.shape.x * samples_0.shape.y &&\n\t\t\tbaseOffset_0 < samples_0.shape.x * samples_0.shape.y) {\n\t\t\tsample.y += samples_0.sum;\n\t\t\tsample.z += samples_0.sum2;\n\t\t}\n\t}\n\telse {\n\t\tsample = texture2D(samples_0.data[0], uv);\n\t}\n\n\treturn sample;\n}\n\n// shift is passed separately for higher float32 precision of offset\n// export pickLinear for the case of emulating texture linear interpolation\nvec4 pick (Samples samples_0, float offset_0, float baseOffset_0, float translate_0) {\n\tfloat offsetLeft = floor(offset_0);\n\tfloat offsetRight = ceil(offset_0);\n\tfloat t = offset_0 - offsetLeft;\n\tvec4 left = picki(samples_0, offsetLeft, baseOffset_0, translate_0);\n\n\tif (t == 0. || offsetLeft == offsetRight) {\n\t\treturn left;\n\t}\n\telse {\n\t\tvec4 right = picki(samples_0, offsetRight, baseOffset_0, translate_0);\n\n\t\treturn lerp(left, right, t);\n\t}\n}\n\nattribute float id, sign, side;\n\nuniform Samples samples, fractions;\nuniform float opacity, thickness, pxStep, pxPerSample, sampleStep, total, totals, translate, translateri, translateriFract, translater, translatei, translates;\nuniform vec4 viewport, color;\nuniform vec2 amp;\n\nvarying vec4 fragColor;\nvarying float avgCurr, avgNext, avgPrev, avgMin, avgMax, sdev, normThickness;\n\nvoid main() {\n\tgl_PointSize = 1.5;\n\n\tnormThickness = thickness / viewport.w;\n\n\tfragColor = color / 255.;\n\tfragColor.a *= opacity;\n\n\tfloat offset = id * sampleStep + translateriFract;\n\n\t// compensate snapping for low scale levels\n\tfloat posShift = pxPerSample < 1. ? 0. : id + (translater - offset - translateri) / sampleStep;\n\n\tbool isPrevStart = id == 1.;\n\tbool isStart = id <= 0.;//-translates;\n\tbool isEnd = id >= floor(totals - translates - 1.);\n\n\tfloat baseOffset = offset - sampleStep * 2.;\n\tfloat offset0 = offset - sampleStep;\n\tfloat offset1 = offset;\n\tif (isEnd) offset = total - 1.;\n\n\t// DEBUG: mark adjacent texture with different color\n\t// if (translate + (id + 1.) * sampleStep > 8192. * 2.) {\n\t// \tfragColor.x *= .5;\n\t// }\n\n\t// if right sample is from the next texture - align it to left texture\n\t// if (offset1 + translate >= (512. * 512.)) {\n\t// \tfragColor = vec4(0,1,1,1);\n\t// }\n\t// if (isEnd) fragColor = vec4(0,0,1,1);\n\t// if (isStart) fragColor = vec4(0,0,1,1);\n\n\t// calc average of curr..next sampling points\n\t// vec4 sample0 = isStart ? vec4(0) : pick(samples, offset0, baseOffset, translateri);\n\tvec4 sample0 = pick(samples, offset0, baseOffset, translateri);\n\tvec4 sample1 = pick(samples, offset1, baseOffset, translateri);\n\tvec4 samplePrev = pick(samples, baseOffset, baseOffset, translateri);\n\tvec4 sampleNext = pick(samples, offset + sampleStep, baseOffset, translateri);\n\n\t// avgCurr = isStart ? sample1.x : (sample1.y - sample0.y) / sampleStep;\n\tavgPrev = baseOffset < 0. ? sample0.x : (sample0.y - samplePrev.y) / sampleStep;\n\tavgNext = (sampleNext.y - sample1.y) / sampleStep;\n\n\t// error proof variance calculation\n\tfloat offset0l = floor(offset0);\n\tfloat offset1l = floor(offset1);\n\tfloat t0 = offset0 - offset0l;\n\tfloat t1 = offset1 - offset1l;\n\tfloat offset0r = offset0l + 1.;\n\tfloat offset1r = offset1l + 1.;\n\n\t// ALERT: this formula took 9 days\n\t// the order of operations is important to provide precision\n\t// that comprises linear interpolation and range calculation\n\t// x - amplitude, y - sum, z - sum2, w - x offset\n\tvec4 sample0l = pick(samples, offset0l, baseOffset, translateri);\n\tvec4 sample0r = pick(samples, offset0r, baseOffset, translateri);\n\tvec4 sample1r = pick(samples, offset1r, baseOffset, translateri);\n\tvec4 sample1l = pick(samples, offset1l, baseOffset, translateri);\n\tvec4 sample1lf = pick(fractions, offset1l, baseOffset, translateri);\n\tvec4 sample0lf = pick(fractions, offset0l, baseOffset, translateri);\n\tvec4 sample1rf = pick(fractions, offset1r, baseOffset, translateri);\n\tvec4 sample0rf = pick(fractions, offset0r, baseOffset, translateri);\n\n\tif (isStart) {\n\t\tavgCurr = sample1.x;\n\t}\n\telse if (isPrevStart) {\n\t\t\tavgCurr = (sample1.y - sample0.y) / sampleStep;\n\t\t}\n\telse {\n\t\tavgCurr = (\n\t\t\t+ sample1l.y\n\t\t\t- sample0l.y\n\t\t\t+ sample1lf.y\n\t\t\t- sample0lf.y\n\t\t\t+ t1 * (sample1r.y - sample1l.y)\n\t\t\t- t0 * (sample0r.y - sample0l.y)\n\t\t\t+ t1 * (sample1rf.y - sample1lf.y)\n\t\t\t- t0 * (sample0rf.y - sample0lf.y)\n\t\t) / sampleStep;\n\t}\n\n\tfloat mx2 = (\n\t\t+ sample1l.z\n\t\t- sample0l.z\n\t\t+ sample1lf.z\n\t\t- sample0lf.z\n\t\t+ t1 * (sample1r.z - sample1l.z)\n\t\t- t0 * (sample0r.z - sample0l.z)\n\t\t+ t1 * (sample1rf.z - sample1lf.z)\n\t\t- t0 * (sample0rf.z - sample0lf.z)\n\t)  / sampleStep;\n\tfloat m2 = avgCurr * avgCurr;\n\n\t// σ(x)² = M(x²) - M(x)²\n\tfloat variance = abs(mx2 - m2);\n\n\tsdev = sqrt(variance);\n\tsdev /= abs(amp.y - amp.x);\n\n\tavgCurr = reamp(avgCurr, amp);\n\tavgNext = reamp(avgNext, amp);\n\tavgPrev = reamp(avgPrev, amp);\n\n\t// compensate for sampling rounding\n\tvec2 position = vec2(\n\t\t(pxStep * (id - posShift) ) / viewport.z,\n\t\tavgCurr\n\t);\n\n\tfloat x = pxStep / viewport.z;\n\tvec2 normalLeft = normalize(vec2(\n\t\t-(avgCurr - avgPrev), x\n\t) / viewport.zw);\n\tvec2 normalRight = normalize(vec2(\n\t\t-(avgNext - avgCurr), x\n\t) / viewport.zw);\n\n\tvec2 bisec = normalize(normalLeft + normalRight);\n\tvec2 vert = vec2(0, 1);\n\tfloat bisecLen = abs(1. / dot(normalLeft, bisec));\n\tfloat vertRightLen = abs(1. / dot(normalRight, vert));\n\tfloat vertLeftLen = abs(1. / dot(normalLeft, vert));\n\tfloat maxVertLen = max(vertLeftLen, vertRightLen);\n\tfloat minVertLen = min(vertLeftLen, vertRightLen);\n\n\t// 2σ covers 68% of a line. 4σ covers 95% of line\n\tfloat vertSdev = 2. * sdev / normThickness;\n\n\tvec2 join;\n\n\tif (isStart || isPrevStart) {\n\t\tjoin = normalRight;\n\t}\n\telse if (isEnd) {\n\t\tjoin = normalLeft;\n\t}\n\t// sdev less than projected to vertical shows simple line\n\t// FIXME: sdev should be compensated by curve bend\n\telse if (vertSdev < maxVertLen) {\n\t\t// sdev more than normal but less than vertical threshold\n\t\t// rotates join towards vertical\n\t\tif (vertSdev > minVertLen) {\n\t\t\tfloat t = (vertSdev - minVertLen) / (maxVertLen - minVertLen);\n\t\t\tjoin = lerp(bisec * bisecLen, vert * maxVertLen, t);\n\t\t}\n\t\telse {\n\t\t\tjoin = bisec * bisecLen;\n\t\t}\n\t}\n\t// sdev more than projected to vertical modifies only y coord\n\telse {\n\t\tjoin = vert * vertSdev;\n\t}\n\n\t// figure out closest to current min/max\n\tavgMin = min(avgCurr, side < 0. ? avgPrev : avgNext);\n\tavgMax = max(avgCurr, side < 0. ? avgPrev : avgNext);\n\n\tposition += sign * join * .5 * thickness / viewport.zw;\n\tgl_Position = vec4(position * 2. - 1., 0, 1);\n}\n"])
  }, shaderOptions));
  var drawLine = regl(extend({
    vert: glsl(["// direct sample output, connected by line, to the contrary to range\n\nprecision highp float;\n#define GLSLIFY 1\n\n// pick texture sample linearly interpolated:\n// default webgl interpolation is more broken\n\n// linear interpolation\nvec4 lerp(vec4 a, vec4 b, float t) {\n\treturn t * b + (1. - t) * a;\n}\nvec2 lerp(vec2 a, vec2 b, float t) {\n\treturn t * b + (1. - t) * a;\n}\n\nstruct Samples {\n\tsampler2D data[2];\n\tvec2 shape;\n\tfloat length;\n\tfloat sum;\n\tfloat sum2;\n};\n\n// pick integer offset\nvec4 picki (Samples samples_0, float offset_0, float baseOffset, float translate_0) {\n\toffset_0 = max(offset_0, 0.);\n\n\t// translate is here in order to remove float32 error (at the latest stage)\n\toffset_0 += translate_0;\n\tbaseOffset += translate_0;\n\n\tvec2 uv = vec2(\n\t\tfloor(mod(offset_0, samples_0.shape.x)) + .5,\n\t\tfloor(offset_0 / samples_0.shape.x) + .5\n\t) / samples_0.shape;\n\n\tvec4 sample;\n\n\t// use last sample for textures past 2nd\n\t// TODO: remove when multipass rendering is implemented\n\tif (uv.y > 2.) {\n\t\tsample = texture2D(samples_0.data[1], vec2(1, 1));\n\t\tsample.x = 0.;\n\t}\n\telse if (uv.y > 1.) {\n\t\tuv.y = uv.y - 1.;\n\n\t\tsample = texture2D(samples_0.data[1], uv);\n\n\t\t// if right sample is from the next texture - align it to left texture\n\t\tif (offset_0 >= samples_0.shape.x * samples_0.shape.y &&\n\t\t\tbaseOffset < samples_0.shape.x * samples_0.shape.y) {\n\t\t\tsample.y += samples_0.sum;\n\t\t\tsample.z += samples_0.sum2;\n\t\t}\n\t}\n\telse {\n\t\tsample = texture2D(samples_0.data[0], uv);\n\t}\n\n\treturn sample;\n}\n\n// shift is passed separately for higher float32 precision of offset\n// export pickLinear for the case of emulating texture linear interpolation\nvec4 pick (Samples samples_0, float offset_0, float baseOffset, float translate_0) {\n\tfloat offsetLeft = floor(offset_0);\n\tfloat offsetRight = ceil(offset_0);\n\tfloat t = offset_0 - offsetLeft;\n\tvec4 left = picki(samples_0, offsetLeft, baseOffset, translate_0);\n\n\tif (t == 0. || offsetLeft == offsetRight) {\n\t\treturn left;\n\t}\n\telse {\n\t\tvec4 right = picki(samples_0, offsetRight, baseOffset, translate_0);\n\n\t\treturn lerp(left, right, t);\n\t}\n}\n\n// bring sample value to 0..1 from amplitude range\nfloat reamp(float v, vec2 amp) {\n\treturn (v - amp.x) / (amp.y - amp.x);\n}\n\nattribute float id, sign, side;\n\nuniform Samples samples;\nuniform float opacity, thickness, pxStep, pxPerSample, sampleStep, total, totals, translate, dataLength, translateri, translater, translatei, translates;\nuniform vec4 viewport, color;\nuniform vec2 amp;\n\nvarying vec4 fragColor;\nvarying float avgCurr, avgPrev, avgNext, avgMin, avgMax, sdev, normThickness;\n\nbool isNaN( float val ){\n  return ( val < 0.0 || 0.0 < val || val == 0.0 ) ? false : true;\n}\n\nvoid main () {\n\tgl_PointSize = 4.5;\n\n\tnormThickness = thickness / viewport.w;\n\n\tfragColor = color / 255.;\n\tfragColor.a *= opacity;\n\n\tfloat offset = id * sampleStep;\n\n\tbool isStart = id <= -translates;\n\tbool isEnd = id >= floor(totals - translates - 1.);\n\n\t// DEBUG: mark adjacent texture with different color\n\t// if (translate + (id) * sampleStep > 64. * 64.) {\n\t// \tfragColor.x *= .5;\n\t// }\n\t// if (isEnd) fragColor = vec4(0,0,1,1);\n\t// if (isStart) fragColor = vec4(0,0,1,1);\n\n\t// calc average of curr..next sampling points\n\tvec4 sampleCurr = pick(samples, offset, offset - sampleStep, translateri);\n\tvec4 sampleNext = pick(samples, offset + sampleStep, offset - sampleStep, translateri);\n\tvec4 samplePrev = pick(samples, offset - sampleStep, offset - sampleStep, translateri);\n\n\tavgCurr = reamp(sampleCurr.x, amp);\n\tavgNext = reamp(isNaN(sampleNext.x) ? sampleCurr.x : sampleNext.x, amp);\n\tavgPrev = reamp(isNaN(samplePrev.x) ? sampleCurr.x : samplePrev.x, amp);\n\n\t// fake sdev 2σ = thickness\n\t// sdev = normThickness / 2.;\n\tsdev = 0.;\n\n\t// compensate snapping for low scale levels\n\tfloat posShift = pxPerSample < 1. ? 0. : id + (translater - offset - translateri) / sampleStep;\n\n\tvec2 position = vec2(\n\t\tpxStep * (id - posShift) / viewport.z,\n\t\tavgCurr\n\t);\n\n\tfloat x = (pxStep) / viewport.z;\n\tvec2 normalLeft = normalize(vec2(\n\t\t-(avgCurr - avgPrev), x\n\t) / viewport.zw);\n\tvec2 normalRight = normalize(vec2(\n\t\t-(avgNext - avgCurr), x\n\t) / viewport.zw);\n\n\tvec2 join;\n\tif (isStart || isNaN(samplePrev.x)) {\n\t\tjoin = normalRight;\n\t}\n\telse if (isEnd || isNaN(sampleNext.x)) {\n\t\tjoin = normalLeft;\n\t}\n\telse {\n\t\tvec2 bisec = normalLeft * .5 + normalRight * .5;\n\t\tfloat bisecLen = abs(1. / dot(normalLeft, bisec));\n\t\tjoin = bisec * bisecLen;\n\t}\n\n\t// FIXME: limit join by prev vertical\n\t// float maxJoinX = min(abs(join.x * thickness), 40.) / thickness;\n\t// join.x *= maxJoinX / join.x;\n\n\t// figure out closest to current min/max\n\tavgMin = min(avgCurr, side < 0. ? avgPrev : avgNext);\n\tavgMax = max(avgCurr, side < 0. ? avgPrev : avgNext);\n\n\tposition += sign * join * .5 * thickness / viewport.zw;\n\tgl_Position = vec4(position * 2. - 1., 0, 1);\n}\n"])
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
};

Object.defineProperties(Waveform.prototype, {
  total: {
    get: function get() {
      if (!this.needsRecalc) return this.drawOptions.total; // returns existing and planned samples

      return (this._total || 0) + this.pushQueue.length;
    },
    set: function set(t) {
      this._total = t;
      this.pushQueue.length = 0;
    }
  },
  viewport: {
    get: function get() {
      if (!this.needsRecalc) return this.drawOptions.viewport;
      var viewport;
      if (!this._viewport) viewport = [0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight];else viewport = [this.viewport.x, this.viewport.y, this.viewport.width, this.viewport.height]; // invert viewport if necessary

      if (!this.flip) {
        viewport[1] = this.gl.drawingBufferHeight - viewport[1] - viewport[3];
      }

      return viewport;
    },
    set: function set(v) {
      this._viewport = v ? parseRect(v) : v;
    }
  },
  color: {
    get: function get() {
      if (!this.needsRecalc) return this.drawOptions.color;
      return this._color || [0, 0, 0, 255];
    },
    // flatten colors to a single uint8 array
    set: function set(v) {
      if (!v) v = 'transparent'; // single color

      if (typeof v === 'string') {
        this._color = rgba(v, 'uint8');
      } // flat array
      else if (typeof v[0] === 'number') {
          var l = Math.max(v.length, 4);
          if (this._color) pool.freeUint8(this._color);
          this._color = pool.mallocUint8(l);
          var sub = (v.subarray || v.slice).bind(v);

          for (var i = 0; i < l; i += 4) {
            this._color.set(rgba(sub(i, i + 4), 'uint8'), i);
          }
        } // nested array
        else {
            var _l = v.length;
            if (this._color) pool.freeUint8(this._color);
            this._color = pool.mallocUint8(_l * 4);

            for (var _i = 0; _i < _l; _i++) {
              this._color.set(rgba(v[_i], 'uint8'), _i * 4);
            }
          }
    }
  },
  amplitude: {
    get: function get() {
      if (!this.needsRecalc) return this.drawOptions.amplitude;
      return this._amplitude || [this.minY, this.maxY];
    },
    set: function set(amplitude) {
      if (typeof amplitude === 'number') {
        this._amplitude = [-amplitude, +amplitude];
      } else if (amplitude.length) {
        this._amplitude = [amplitude[0], amplitude[1]];
      } else {
        this._amplitude = amplitude;
      }
    }
  },
  range: {
    get: function get() {
      if (!this.needsRecalc) return this.drawOptions.range;
      return this._range || [0, this.total - 1];
    },
    set: function set(range) {
      if (range.length) {
        // support vintage 4-value range
        if (range.length === 4) {
          this._range = [range[0], range[2]];
          this.amplitude = [range[1], range[3]];
        } else {
          this._range = [range[0], range[1]];
        }
      } else if (typeof range === 'number') {
        this._range = [-range, -0];
      }
    }
  }
}); // update visual state

Waveform.prototype.update = function (o) {
  if (!o) return this;
  if (o.length != null) o = {
    data: o
  };
  this.needsRecalc = true;
  o = pick(o, {
    data: 'data value values sample samples',
    push: 'add append push insert concat',
    range: 'range dataRange dataBox dataBounds dataLimits',
    amplitude: 'amp amplitude amplitudes ampRange bounds limits maxAmplitude maxAmp',
    thickness: 'thickness width linewidth lineWidth line-width',
    pxStep: 'step pxStep',
    color: 'color colour colors colours fill fillColor fill-color',
    line: 'line line-style lineStyle linestyle',
    viewport: 'clip vp viewport viewBox viewbox viewPort area',
    opacity: 'opacity alpha transparency visible visibility opaque',
    flip: 'flip iviewport invertViewport inverseViewport',
    mode: 'mode'
  }); // forcing rendering mode is mostly used for debugging purposes

  if (o.mode !== undefined) this.mode = o.mode; // parse line style

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

  if (o.thickness !== undefined) {
    this.thickness = toPx(o.thickness);
  }

  if (o.pxStep !== undefined) {
    this.pxStep = toPx(o.pxStep);
  }

  if (o.opacity !== undefined) {
    this.opacity = parseFloat(o.opacity);
  }

  if (o.viewport !== undefined) {
    this.viewport = o.viewport;
  }

  if (o.flip) {
    this.flip = !!o.flip;
  }

  if (o.range !== undefined) {
    this.range = o.range;
  }

  if (o.color !== undefined) {
    this.color = o.color;
  }

  if (o.amplitude !== undefined) {
    this.amplitude = o.amplitude;
  } // reset sample textures if new samples data passed


  if (o.data) {
    this.total = 0;
    this.lastY = null;
    this.minY = Infinity;
    this.maxY = -Infinity;
    this.push(o.data);
  } // call push method


  if (o.push) {
    this.push(o.push);
  }

  return this;
}; // append samples, will be put into texture at the next frame or idle


Waveform.prototype.push = function () {
  var _this = this;

  for (var _len = arguments.length, samples = new Array(_len), _key = 0; _key < _len; _key++) {
    samples[_key] = arguments[_key];
  }

  if (!samples || !samples.length) return this;

  for (var i = 0; i < samples.length; i++) {
    if (samples[i].length) {
      var _this$pushQueue;

      if (samples[i].length > MAX_ARGUMENTS) {
        for (var j = 0; j < samples[i].length; j++) {
          this.pushQueue.push(samples[i][j]);
        }
      } else (_this$pushQueue = this.pushQueue).push.apply(_this$pushQueue, _toConsumableArray(samples[i]));
    } else this.pushQueue.push(samples[i]);
  }

  this.needsRecalc = true;
  idle(function () {
    _this.calc();
  });
  return this;
}; // write samples into texture


Waveform.prototype.set = function (samples) {
  var at = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
  if (!samples || !samples.length) return this; // draing queue, if possible overlap

  if (samples !== this.pushQueue && at + samples.length > this.total) {
    if (this.pushQueue.length) {
      this.set(this.pushQueue, this.total - this.pushQueue.length);
      this.pushQueue.length = 0;
    }
  } // future fill: provide NaN data


  if (at > this.total) {
    this.set(Array(at - this.total), this.total - this.pushQueue.length);
  }

  this.needsRecalc = true; // carefully handle array

  if (Array.isArray(samples)) {
    var floatSamples = pool.mallocFloat64(samples.length);

    for (var i = 0; i < samples.length; i++) {
      // put NaN samples as indicators of blank samples
      if (samples[i] == null || isNaN(samples[i])) {
        floatSamples[i] = NaN;
      } else {
        floatSamples[i] = samples[i];
      }
    }

    samples = floatSamples;
  } // detect min/maxY


  for (var _i2 = 0; _i2 < samples.length; _i2++) {
    if (this.minY > samples[_i2]) this.minY = samples[_i2];
    if (this.maxY < samples[_i2]) this.maxY = samples[_i2];
  }

  var _this$textureShape = _slicedToArray(this.textureShape, 2),
      txtW = _this$textureShape[0],
      txtH = _this$textureShape[1];

  var txtLen = this.textureLength;
  var offset = at % txtLen;
  var id = Math.floor(at / txtLen);
  var y = Math.floor(offset / txtW);
  var x = offset % txtW;
  var tillEndOfTxt = txtLen - offset;
  var ch = this.textureChannels; // get current texture

  var txt = this.textures[id];
  var txtFract = this.textures2[id];

  if (!txt) {
    txt = this.textures[id] = this.regl.texture({
      width: this.textureShape[0],
      height: this.textureShape[1],
      channels: this.textureChannels,
      type: 'float',
      min: 'nearest',
      mag: 'nearest',
      // min: 'linear',
      // mag: 'linear',
      wrap: ['clamp', 'clamp']
    });
    this.lastY = txt.sum = txt.sum2 = 0;
    txtFract = this.textures2[id] = this.regl.texture({
      width: this.textureShape[0],
      height: this.textureShape[1],
      channels: this.textureChannels,
      type: 'float',
      min: 'nearest',
      mag: 'nearest',
      // min: 'linear',
      // mag: 'linear',
      wrap: ['clamp', 'clamp']
    });
  } // calc sum, sum2 and form data for the samples


  var dataLen = Math.min(tillEndOfTxt, samples.length);
  var data = pool.mallocFloat64(dataLen * ch);

  for (var _i3 = 0, l = dataLen; _i3 < l; _i3++) {
    // put NaN samples as indicators of blank samples
    if (!isNaN(samples[_i3])) {
      data[_i3 * ch] = this.lastY = samples[_i3];
    } else {
      data[_i3 * ch] = NaN;
    }

    txt.sum += this.lastY;
    txt.sum2 += this.lastY * this.lastY; // we cannot rotate sums here because there can be any number of rotations between two edge samples
    // also that is hard to guess correct rotation limit, that can change at any new data
    // so we just keep precise secondary texture and hope the sum is not huge enough to reset at the next texture

    data[_i3 * ch + 1] = txt.sum;
    data[_i3 * ch + 2] = txt.sum2;
  } // increase total by the number of new samples


  if (this.total - this.pushQueue.length - at < dataLen) this.total += dataLen - (this.total - at); // fullfill last unfinished row

  var firstRowWidth = 0;

  if (x) {
    firstRowWidth = Math.min(txtW - x, dataLen);
    writeTexture(x, y, firstRowWidth, 1, data.subarray(0, firstRowWidth * ch)); // if data is shorter than the texture row - skip the rest

    if (x + samples.length <= txtW) {
      pool.freeFloat64(samples);
      pool.freeFloat64(data);
      return this;
    }

    y++; // shortcut next texture block

    if (y === txtH) {
      pool.freeFloat64(data);
      this.push(samples.subarray(firstRowWidth));
      pool.freeFloat64(samples);
      return this;
    }

    offset += firstRowWidth;
  } // put rect with data


  var h = Math.floor((dataLen - firstRowWidth) / txtW);
  var blockLen = 0;

  if (h) {
    blockLen = h * txtW;
    writeTexture(0, y, txtW, h, data.subarray(firstRowWidth * ch, (firstRowWidth + blockLen) * ch));
    y += h;
  } // put last row


  var lastRowWidth = dataLen - firstRowWidth - blockLen;

  if (lastRowWidth) {
    writeTexture(0, y, lastRowWidth, 1, data.subarray(-lastRowWidth * ch));
  } // shorten block till the end of texture


  if (tillEndOfTxt < samples.length) {
    this.push(samples.subarray(tillEndOfTxt));
    pool.freeFloat64(samples);
    pool.freeFloat64(data);
    return this;
  } // put data to texture, provide NaN transport & performant fractions calc


  function writeTexture(x, y, w, h, data) {
    var f32data = pool.mallocFloat32(data.length);
    var f32fract = pool.mallocFloat32(data.length);

    for (var _i4 = 0; _i4 < data.length; _i4++) {
      f32data[_i4] = data[_i4];
      f32fract[_i4] = data[_i4] - f32data[_i4];
    } // for (let i = 0; i < data.length; i+=4) {
    // 	if (isNaN(data[i])) f32fract[i] = -1
    // }


    txt.subimage({
      width: w,
      height: h,
      data: f32data
    }, x, y);
    txtFract.subimage({
      width: w,
      height: h,
      data: f32fract
    }, x, y);
    pool.freeFloat32(f32data);
    pool.freeFloat32(f32fract);
  }

  return this;
}; // calculate draw options


Waveform.prototype.calc = function () {
  if (!this.needsRecalc) return this.drawOptions; // apply samples changes, if any

  if (this.pushQueue.length) {
    this.set(this.pushQueue);
    this.pushQueue.length = 0;
  }

  var total = this.total,
      opacity = this.opacity,
      amplitude = this.amplitude,
      viewport = this.viewport,
      range = this.range;
  var color = this.color;
  var thickness = this.thickness; // calc runtime props

  var span = range[1] - range[0] || 1;
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
  if (translateri < 0) currTexture += 1;
  var VERTEX_REPEAT = 2.; // limit not existing in texture points

  var offset = 2. * Math.max(-translates * VERTEX_REPEAT, 0);
  var count = Math.max(2, Math.min( // number of visible texture sampling points
  // 2. * Math.floor((dataLength * Math.max(0, (2 + Math.min(currTexture, 0))) - (translate % dataLength)) / sampleStep),
  // number of available data points
  2 * Math.floor(totals - Math.max(translates, 0)), // number of visible vertices on the screen
  2 * Math.ceil(viewport[2] / pxStep) + 4, // number of ids available
  this.maxSampleCount) * VERTEX_REPEAT);
  var mode = this.mode; // use more complicated range draw only for sample intervals
  // note that rangeDraw gives sdev error for high values dataLength

  this.drawOptions = {
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
    amplitude: amplitude,
    range: range,
    mode: mode
  };
  this.needsRecalc = false;
  return this.drawOptions;
}; // draw frame according to state


Waveform.prototype.render = function () {
  if (this.total < 2) return this;
  var o = this.calc(); // range case

  if (o.pxPerSample <= 1. || o.mode === 'range' && o.mode != 'line') {
    this.shader.drawRanges.call(this, o);
  } // line case
  else {
      this.shader.drawLine.call(this, o); // this.shader.drawLine.call(this, extend(o, {
      // 	primitive: 'line strip',
      // 	color: [0,0,255,255]
      // }))
      // this.shader.drawLine.call(this, extend(o, {
      // 	primitive: 'points',
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
      amplitude = _this$calc.amplitude;

  var txt = this.textures[currTexture];
  if (!txt) return null;
  var xOffset = Math.floor(span * x / viewport[2]);
  var offset = Math.floor(translater + xOffset);
  var xShift = translater - translateri;
  if (offset < 0 || offset > this.total) return null;
  var ch = this.textureChannels; // FIXME: use samples array

  var data = txt.data;
  var samples = data.subarray(offset * ch, offset * ch + ch); // single-value pick
  // if (pxPerSample >= 1) {

  var avg = samples[0];
  return {
    average: avg,
    sdev: 0,
    offset: [offset, offset],
    x: viewport[2] * (xOffset - xShift) / span + this.viewport.x,
    y: (-avg - amplitude[0]) / (amplitude[1] - amplitude[0]) * this.viewport.height + this.viewport.y // }
    // FIXME: multi-value pick

  };
}; // clear viewport area occupied by the renderer


Waveform.prototype.clear = function () {
  if (!this.drawOptions) return this;
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
  this.textures.forEach(function (txt) {
    txt.destroy();
  });
  this.textures2.forEach(function (txt) {
    txt.destroy();
  });
}; // style


Waveform.prototype.color = new Uint8Array([0, 0, 0, 255]);
Waveform.prototype.opacity = 1;
Waveform.prototype.thickness = 1;
Waveform.prototype.mode = null; // Waveform.prototype.fade = true

Waveform.prototype.flip = false; // Texture size affects
// - sdev error: bigger texture accumulate sum2 error so signal looks more fluffy
// - performance: bigger texture is slower to create
// - zoom level: only 2 textures per screen are available, so zoom is limited
// - max number of textures

Waveform.prototype.textureShape = [512, 512];
Waveform.prototype.textureChannels = 3;
Waveform.prototype.maxSampleCount = 8192 * 2;
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
