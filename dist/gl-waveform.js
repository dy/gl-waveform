'use strict';

function _typeof(obj) {
  if (typeof Symbol === "function" && typeof Symbol.iterator === "symbol") {
    _typeof = function (obj) {
      return typeof obj;
    };
  } else {
    _typeof = function (obj) {
      return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj;
    };
  }

  return _typeof(obj);
}

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

var check = require('./lib/util/check');

var extend = require('./lib/util/extend');

var dynamic = require('./lib/dynamic');

var raf = require('./lib/util/raf');

var clock = require('./lib/util/clock');

var createStringStore = require('./lib/strings');

var initWebGL = require('./lib/webgl');

var wrapExtensions = require('./lib/extension');

var wrapLimits = require('./lib/limits');

var wrapBuffers = require('./lib/buffer');

var wrapElements = require('./lib/elements');

var wrapTextures = require('./lib/texture');

var wrapRenderbuffers = require('./lib/renderbuffer');

var wrapFramebuffers = require('./lib/framebuffer');

var wrapAttributes = require('./lib/attribute');

var wrapShaders = require('./lib/shader');

var wrapRead = require('./lib/read');

var createCore = require('./lib/core');

var createStats = require('./lib/stats');

var createTimer = require('./lib/timer');

var GL_COLOR_BUFFER_BIT = 16384;
var GL_DEPTH_BUFFER_BIT = 256;
var GL_STENCIL_BUFFER_BIT = 1024;
var GL_ARRAY_BUFFER = 34962;
var CONTEXT_LOST_EVENT = 'webglcontextlost';
var CONTEXT_RESTORED_EVENT = 'webglcontextrestored';
var DYN_PROP = 1;
var DYN_CONTEXT = 2;
var DYN_STATE = 3;
console.log(213);

function find(haystack, needle) {
  for (var i = 0; i < haystack.length; ++i) {
    if (haystack[i] === needle) {
      return i;
    }
  }

  return -1;
}

module.exports = function wrapREGL(args) {
  var config = initWebGL(args);

  if (!config) {
    return null;
  }

  var gl = config.gl;
  var glAttributes = gl.getContextAttributes();
  var contextLost = gl.isContextLost();
  var extensionState = wrapExtensions(gl, config);

  if (!extensionState) {
    return null;
  }

  var stringStore = createStringStore();
  var stats = createStats();
  var extensions = extensionState.extensions;
  var timer = createTimer(gl, extensions);
  var START_TIME = clock();
  var WIDTH = gl.drawingBufferWidth;
  var HEIGHT = gl.drawingBufferHeight;
  var contextState = {
    tick: 0,
    time: 0,
    viewportWidth: WIDTH,
    viewportHeight: HEIGHT,
    framebufferWidth: WIDTH,
    framebufferHeight: HEIGHT,
    drawingBufferWidth: WIDTH,
    drawingBufferHeight: HEIGHT,
    pixelRatio: config.pixelRatio
  };
  var uniformState = {};
  var drawState = {
    elements: null,
    primitive: 4,
    // GL_TRIANGLES
    count: -1,
    offset: 0,
    instances: -1
  };
  var limits = wrapLimits(gl, extensions);
  var attributeState = wrapAttributes(gl, extensions, limits, stringStore);
  var bufferState = wrapBuffers(gl, stats, config, attributeState);
  var elementState = wrapElements(gl, extensions, bufferState, stats);
  var shaderState = wrapShaders(gl, stringStore, stats, config);
  var textureState = wrapTextures(gl, extensions, limits, function () {
    core.procs.poll();
  }, contextState, stats, config);
  var renderbufferState = wrapRenderbuffers(gl, extensions, limits, stats, config);
  var framebufferState = wrapFramebuffers(gl, extensions, limits, textureState, renderbufferState, stats);
  var core = createCore(gl, stringStore, extensions, limits, bufferState, elementState, textureState, framebufferState, uniformState, attributeState, shaderState, drawState, contextState, timer, config);
  var readPixels = wrapRead(gl, framebufferState, core.procs.poll, contextState, glAttributes, extensions, limits);
  var nextState = core.next;
  var canvas = gl.canvas;
  var rafCallbacks = [];
  var lossCallbacks = [];
  var restoreCallbacks = [];
  var destroyCallbacks = [config.onDestroy];
  var activeRAF = null;

  function handleRAF() {
    if (rafCallbacks.length === 0) {
      if (timer) {
        timer.update();
      }

      activeRAF = null;
      return;
    } // schedule next animation frame


    activeRAF = raf.next(handleRAF); // poll for changes

    _poll(); // fire a callback for all pending rafs


    for (var i = rafCallbacks.length - 1; i >= 0; --i) {
      var cb = rafCallbacks[i];

      if (cb) {
        cb(contextState, null, 0);
      }
    } // flush all pending webgl calls


    gl.flush(); // poll GPU timers *after* gl.flush so we don't delay command dispatch

    if (timer) {
      timer.update();
    }
  }

  function startRAF() {
    if (!activeRAF && rafCallbacks.length > 0) {
      activeRAF = raf.next(handleRAF);
    }
  }

  function stopRAF() {
    if (activeRAF) {
      raf.cancel(handleRAF);
      activeRAF = null;
    }
  }

  function handleContextLoss(event) {
    event.preventDefault(); // set context lost flag

    contextLost = true; // pause request animation frame

    stopRAF(); // lose context

    lossCallbacks.forEach(function (cb) {
      cb();
    });
  }

  function handleContextRestored(event) {
    // clear error code
    gl.getError(); // clear context lost flag

    contextLost = false; // refresh state

    extensionState.restore();
    shaderState.restore();
    bufferState.restore();
    textureState.restore();
    renderbufferState.restore();
    framebufferState.restore();

    if (timer) {
      timer.restore();
    } // refresh state


    core.procs.refresh(); // restart RAF

    startRAF(); // restore context

    restoreCallbacks.forEach(function (cb) {
      cb();
    });
  }

  if (canvas) {
    canvas.addEventListener(CONTEXT_LOST_EVENT, handleContextLoss, false);
    canvas.addEventListener(CONTEXT_RESTORED_EVENT, handleContextRestored, false);
  }

  function destroy() {
    rafCallbacks.length = 0;
    stopRAF();

    if (canvas) {
      canvas.removeEventListener(CONTEXT_LOST_EVENT, handleContextLoss);
      canvas.removeEventListener(CONTEXT_RESTORED_EVENT, handleContextRestored);
    }

    shaderState.clear();
    framebufferState.clear();
    renderbufferState.clear();
    textureState.clear();
    elementState.clear();
    bufferState.clear();

    if (timer) {
      timer.clear();
    }

    destroyCallbacks.forEach(function (cb) {
      cb();
    });
  }

  function compileProcedure(options) {
    check(!!options, 'invalid args to regl({...})');
    check.type(options, 'object', 'invalid args to regl({...})');

    function flattenNestedOptions(options) {
      var result = extend({}, options);
      delete result.uniforms;
      delete result.attributes;
      delete result.context;

      if ('stencil' in result && result.stencil.op) {
        result.stencil.opBack = result.stencil.opFront = result.stencil.op;
        delete result.stencil.op;
      }

      function merge(name) {
        if (name in result) {
          var child = result[name];
          delete result[name];
          Object.keys(child).forEach(function (prop) {
            result[name + '.' + prop] = child[prop];
          });
        }
      }

      merge('blend');
      merge('depth');
      merge('cull');
      merge('stencil');
      merge('polygonOffset');
      merge('scissor');
      merge('sample');
      return result;
    }

    function separateDynamic(object) {
      var staticItems = {};
      var dynamicItems = {};
      Object.keys(object).forEach(function (option) {
        var value = object[option];

        if (dynamic.isDynamic(value)) {
          dynamicItems[option] = dynamic.unbox(value, option);
        } else {
          staticItems[option] = value;
        }
      });
      return {
        dynamic: dynamicItems,
        static: staticItems
      };
    } // Treat context variables separate from other dynamic variables


    var context = separateDynamic(options.context || {});
    var uniforms = separateDynamic(options.uniforms || {});
    var attributes = separateDynamic(options.attributes || {});
    var opts = separateDynamic(flattenNestedOptions(options));
    var stats = {
      gpuTime: 0.0,
      cpuTime: 0.0,
      count: 0
    };
    var compiled = core.compile(opts, attributes, uniforms, context, stats);
    var draw = compiled.draw;
    var batch = compiled.batch;
    var scope = compiled.scope; // FIXME: we should modify code generation for batch commands so this
    // isn't necessary

    var EMPTY_ARRAY = [];

    function reserve(count) {
      while (EMPTY_ARRAY.length < count) {
        EMPTY_ARRAY.push(null);
      }

      return EMPTY_ARRAY;
    }

    function REGLCommand(args, body) {
      var i;

      if (contextLost) {
        check.raise('context lost');
      }

      if (typeof args === 'function') {
        return scope.call(this, null, args, 0);
      } else if (typeof body === 'function') {
        if (typeof args === 'number') {
          for (i = 0; i < args; ++i) {
            scope.call(this, null, body, i);
          }

          return;
        } else if (Array.isArray(args)) {
          for (i = 0; i < args.length; ++i) {
            scope.call(this, args[i], body, i);
          }

          return;
        } else {
          return scope.call(this, args, body, 0);
        }
      } else if (typeof args === 'number') {
        if (args > 0) {
          return batch.call(this, reserve(args | 0), args | 0);
        }
      } else if (Array.isArray(args)) {
        if (args.length) {
          return batch.call(this, args, args.length);
        }
      } else {
        return draw.call(this, args);
      }
    }

    return extend(REGLCommand, {
      stats: stats
    });
  }

  var setFBO = framebufferState.setFBO = compileProcedure({
    framebuffer: dynamic.define.call(null, DYN_PROP, 'framebuffer')
  });

  function clearImpl(_, options) {
    var clearFlags = 0;
    core.procs.poll();
    var c = options.color;

    if (c) {
      gl.clearColor(+c[0] || 0, +c[1] || 0, +c[2] || 0, +c[3] || 0);
      clearFlags |= GL_COLOR_BUFFER_BIT;
    }

    if ('depth' in options) {
      gl.clearDepth(+options.depth);
      clearFlags |= GL_DEPTH_BUFFER_BIT;
    }

    if ('stencil' in options) {
      gl.clearStencil(options.stencil | 0);
      clearFlags |= GL_STENCIL_BUFFER_BIT;
    }

    check(!!clearFlags, 'called regl.clear with no buffer specified');
    gl.clear(clearFlags);
  }

  function clear(options) {
    check(_typeof(options) === 'object' && options, 'regl.clear() takes an object as input');

    if ('framebuffer' in options) {
      if (options.framebuffer && options.framebuffer_reglType === 'framebufferCube') {
        for (var i = 0; i < 6; ++i) {
          setFBO(extend({
            framebuffer: options.framebuffer.faces[i]
          }, options), clearImpl);
        }
      } else {
        setFBO(options, clearImpl);
      }
    } else {
      clearImpl(null, options);
    }
  }

  function frame(cb) {
    check.type(cb, 'function', 'regl.frame() callback must be a function');
    rafCallbacks.push(cb);

    function cancel() {
      // FIXME:  should we check something other than equals cb here?
      // what if a user calls frame twice with the same callback...
      //
      var i = find(rafCallbacks, cb);
      check(i >= 0, 'cannot cancel a frame twice');

      function pendingCancel() {
        var index = find(rafCallbacks, pendingCancel);
        rafCallbacks[index] = rafCallbacks[rafCallbacks.length - 1];
        rafCallbacks.length -= 1;

        if (rafCallbacks.length <= 0) {
          stopRAF();
        }
      }

      rafCallbacks[i] = pendingCancel;
    }

    startRAF();
    return {
      cancel: cancel
    };
  } // poll viewport


  function pollViewport() {
    var viewport = nextState.viewport;
    var scissorBox = nextState.scissor_box;
    viewport[0] = viewport[1] = scissorBox[0] = scissorBox[1] = 0;
    contextState.viewportWidth = contextState.framebufferWidth = contextState.drawingBufferWidth = viewport[2] = scissorBox[2] = gl.drawingBufferWidth;
    contextState.viewportHeight = contextState.framebufferHeight = contextState.drawingBufferHeight = viewport[3] = scissorBox[3] = gl.drawingBufferHeight;
  }

  function _poll() {
    contextState.tick += 1;
    contextState.time = now();
    pollViewport();
    core.procs.poll();
  }

  function refresh() {
    pollViewport();
    core.procs.refresh();

    if (timer) {
      timer.update();
    }
  }

  function now() {
    return (clock() - START_TIME) / 1000.0;
  }

  refresh();

  function addListener(event, callback) {
    check.type(callback, 'function', 'listener callback must be a function');
    var callbacks;

    switch (event) {
      case 'frame':
        return frame(callback);

      case 'lost':
        callbacks = lossCallbacks;
        break;

      case 'restore':
        callbacks = restoreCallbacks;
        break;

      case 'destroy':
        callbacks = destroyCallbacks;
        break;

      default:
        check.raise('invalid event, must be one of frame,lost,restore,destroy');
    }

    callbacks.push(callback);
    return {
      cancel: function cancel() {
        for (var i = 0; i < callbacks.length; ++i) {
          if (callbacks[i] === callback) {
            callbacks[i] = callbacks[callbacks.length - 1];
            callbacks.pop();
            return;
          }
        }
      }
    };
  }

  var regl = extend(compileProcedure, {
    // Clear current FBO
    clear: clear,
    // Short cuts for dynamic variables
    prop: dynamic.define.bind(null, DYN_PROP),
    context: dynamic.define.bind(null, DYN_CONTEXT),
    this: dynamic.define.bind(null, DYN_STATE),
    // executes an empty draw command
    draw: compileProcedure({}),
    // Resources
    buffer: function buffer(options) {
      return bufferState.create(options, GL_ARRAY_BUFFER, false, false);
    },
    elements: function elements(options) {
      return elementState.create(options, false);
    },
    texture: textureState.create2D,
    cube: textureState.createCube,
    renderbuffer: renderbufferState.create,
    framebuffer: framebufferState.create,
    framebufferCube: framebufferState.createCube,
    // Expose context attributes
    attributes: glAttributes,
    // Frame rendering
    frame: frame,
    on: addListener,
    // System limits
    limits: limits,
    hasExtension: function hasExtension(name) {
      return limits.extensions.indexOf(name.toLowerCase()) >= 0;
    },
    // Read pixels
    read: readPixels,
    // Destroy regl and all associated resources
    destroy: destroy,
    // Direct GL state manipulation
    _gl: gl,
    _refresh: refresh,
    poll: function poll() {
      _poll();

      if (timer) {
        timer.update();
      }
    },
    // Current time
    now: now,
    // regl Statistics Information
    stats: stats
  });
  config.onDone(null, regl);
  return regl;
};

var regl = /*#__PURE__*/Object.freeze({

});

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

var createRegl = getCjsExportFromNamespace(regl);

var elOffset = getCjsExportFromNamespace(offset);

var pick = require('pick-by-alias');

var extend$1 = require('object-assign');

var WeakMap = require('weak-map');

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

var nidx = require('negative-index');

var MAX_ARGUMENTS = 1024;
console.log(createRegl); // FIXME: it is possible to oversample thick lines by scaling them with projected limit to vertical instead of creating creases
// FIXME: shring 4th NaN channel by putting it to one of fract channels

var shaderCache = new WeakMap();

function Waveform(o) {
  var _this = this;

  if (!(this instanceof Waveform)) return new Waveform(o); // create a view for existing waveform

  if (o instanceof Waveform) {
    mirrorProperty(this, 'textures', o);
    mirrorProperty(this, 'textures2', o);
    mirrorProperty(this, 'lastY', o);
    mirrorProperty(this, 'minY', o);
    mirrorProperty(this, 'maxY', o);
    mirrorProperty(this, 'total', o);
    mirrorProperty(this, 'shader', o);
    mirrorProperty(this, 'gl', o);
    mirrorProperty(this, 'regl', o);
    mirrorProperty(this, 'canvas', o);
    mirrorProperty(this, 'blankTexture', o);
    mirrorProperty(this, 'NaNTexture', o);
    mirrorProperty(this, 'pushQueue', o);
    mirrorProperty(this, 'textureLength', o);
    mirrorProperty(this, 'textureShape', o);
    Object.defineProperty(this, 'dirty', {
      get: function get() {
        return _this._dirty || o.dirty || o.drawOptions.total !== _this.drawOptions.total;
      },
      set: function set(v) {
        return _this._dirty = v;
      }
    });
    this.dirty = true;
    this.drawOptions = {};
    this.isClone = true;
    this.update({
      color: o.color,
      thickness: o.thickness
    });
    return this;
  } // stack of textures with sample data
  // for a single pass we provide 2 textures, covering the screen
  // every new texture resets accumulated sum/sum2 values
  // textures store [amp, sum, sum2] values
  // textures2 store [ampFract, sumFract, sum2Fract, _] values
  // ampFract has util values: -1 for NaN amplitude


  this.textures = [];
  this.textures2 = []; // pointer to the first/last x values, detected from the first data
  // used for organizing data gaps

  this.lastY;
  this.minY = Infinity, this.maxY = -Infinity;
  this.total = 0; // find a good name for runtime draw state

  this.drawOptions = {};
  this.shader = this.createShader(o);
  this.gl = this.shader.gl;
  this.regl = this.shader.regl;
  this.canvas = this.gl.canvas;
  this.blankTexture = this.shader.blankTexture;
  this.NaNTexture = this.shader.NaNTexture; // tick processes accumulated samples to push in the next render frame
  // to avoid overpushing per-single value (also dangerous for wrong step detection or network delays)

  this.pushQueue = [];
  this.dirty = true; // FIXME: add beter recognition
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
      extensions: 'OES_texture_float'
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
      extensions: 'OES_texture_float'
    });
  } //    id    0     1
  //  side -1 +1 -1 +1
  //         **    **          +1
  //        /||   /||   ...
  //    .../ ||  / ||  /       sign
  //         || /  || /
  //         **    **          -1


  var idBuffer = regl.buffer({
    usage: 'static',
    type: 'int16',
    data: function (N) {
      var x = Array(); // prepend -1 and -2 ids at the head
      // to over-render for multipass overlay

      x.push(-2, 1, 1, -2, -1, 1);

      for (var i = -1; i < N; i++) {
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
    // frag: glsl('./shader/fade-frag.glsl'),
    frag: glsl(["precision highp float;\n#define GLSLIFY 1\nvarying vec4 fragColor;\nvoid main() {\n\tgl_FragColor = fragColor;\n}\n"]),
    uniforms: {
      'samples.id': regl.prop('textureId'),
      'samples.data': regl.prop('samples'),
      'samples.prev': regl.prop('prevSamples'),
      'samples.next': regl.prop('nextSamples'),
      'samples.shape': regl.prop('dataShape'),
      'samples.length': regl.prop('dataLength'),
      'samples.sum': function samplesSum(c, p) {
        return f32.float(p.samples.sum);
      },
      'samples.sum2': function samplesSum2(c, p) {
        return f32.float(p.samples.sum2);
      },
      'samples.prevSum': function samplesPrevSum(c, p) {
        return f32.float(p.prevSamples.sum);
      },
      'samples.prevSum2': function samplesPrevSum2(c, p) {
        return f32.float(p.prevSamples.sum2);
      },
      // float32 sample fractions for precision
      'fractions.id': regl.prop('textureId'),
      'fractions.data': regl.prop('fractions'),
      'fractions.prev': regl.prop('prevFractions'),
      'fractions.next': regl.prop('nextFractions'),
      'fractions.shape': regl.prop('dataShape'),
      'fractions.length': regl.prop('dataLength'),
      'fractions.sum': function fractionsSum(c, p) {
        return f32.fract(p.samples.sum);
      },
      'fractions.sum2': function fractionsSum2(c, p) {
        return f32.fract(p.samples.sum2);
      },
      'fractions.prevSum': function fractionsPrevSum(c, p) {
        return f32.fract(p.prevSamples.sum);
      },
      'fractions.prevSum2': function fractionsPrevSum2(c, p) {
        return f32.fract(p.prevSamples.sum2);
      },
      passNum: regl.prop('passNum'),
      passId: regl.prop('passId'),
      passOffset: regl.prop('passOffset'),
      // total number of samples
      total: regl.prop('total'),
      range: regl.prop('range'),
      // number of pixels between vertices
      pxStep: regl.prop('pxStep'),
      posShift: regl.prop('posShift'),
      // number of samples between vertices
      sampleStep: regl.prop('sampleStep'),
      translate: regl.prop('translate'),
      // min/max amplitude
      amplitude: regl.prop('amplitude'),
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
      enable: false
    },
    scissor: {
      enable: true,
      box: function box(c, _ref) {
        var clip = _ref.clip,
            viewport = _ref.viewport;
        return clip ? {
          x: clip[0],
          y: clip[1],
          width: clip[2],
          height: clip[3]
        } : {
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
  var drawRanges = regl(extend$1({
    vert: glsl(["// output range-average samples line with sdev weighting\n\nprecision highp float;\n#define GLSLIFY 1\n\n// linear interpolation\nvec4 lerp(vec4 a, vec4 b, float t) {\n\treturn t * b + (1. - t) * a;\n}\nvec2 lerp(vec2 a, vec2 b, float t) {\n\treturn t * b + (1. - t) * a;\n}\n\n// bring sample value to 0..1 from amplitude range\nfloat reamp(float v, vec2 amp) {\n\treturn (v - amp.x) / (amp.y - amp.x);\n}\n\nstruct Samples {\n\tfloat id;\n\tsampler2D data;\n\tsampler2D prev;\n\tsampler2D next;\n\tvec2 shape;\n\tfloat length;\n\tfloat sum, prevSum, sum2, prevSum2;\n};\n\nattribute float id, sign, side;\n\nuniform Samples samples, fractions;\nuniform float opacity, thickness, pxStep, sampleStep, total, translate, passNum, passId;\nuniform vec4 viewport, color;\nuniform vec2 amplitude;\n\nvarying vec4 fragColor;\nvarying vec3 statsLeft, statsRight, statsPrevRight, statsNextLeft;\nvarying float normThickness;\n\nconst float FLT_EPSILON = 1.19209290e-7;\n\n// returns sample picked from the texture\nvec4 picki (Samples samples, float offset) {\n\t// translate is here in order to remove float32 error (at the latest stage)\n\toffset += translate;\n\n\tvec2 uv = vec2(\n\t\tfloor(mod(offset, samples.shape.x)) + .5,\n\t\tfloor(offset / samples.shape.x) + .5\n\t) / samples.shape;\n\n\tvec4 sample;\n\n\t// prev texture\n\tif (uv.y < 0.) {\n\t\tuv.y += 1.;\n\t\tsample = texture2D(samples.prev, uv);\n\t\tsample.y -= samples.prevSum;\n\t\tsample.z -= samples.prevSum2;\n\t}\n\t// next texture\n\telse if (uv.y > 1.) {\n\t\tuv.y -= 1.;\n\t\tsample = texture2D(samples.next, uv);\n\t\tsample.y += samples.sum;\n\t\tsample.z += samples.sum2;\n\t}\n\t// curr texture\n\telse {\n\t\tsample = texture2D(samples.data, uv);\n\t}\n\n\treturn sample;\n}\n\n// returns {avg, sdev, isNaN}\nvec3 stats (float offset) {\n\tfloat sampleStep = sampleStep;\n\n\tfloat offset0 = offset - sampleStep * .5;\n\tfloat offset1 = offset + sampleStep * .5;\n\tfloat offset0l = floor(offset0);\n\tfloat offset1l = floor(offset1);\n\tfloat offset0r = ceil(offset0);\n\tfloat offset1r = ceil(offset1);\n\n\tvec4 sample = picki(samples, offset);\n\t// if (sample.w == -1.) return vec3(0,0,-1);\n\n\t// head picks half the first sample\n\tvec4 sample0l = picki(samples, offset0l);\n\tvec4 sample1l = picki(samples, offset1l);\n\tvec4 sample0r = picki(samples, offset0r);\n\tvec4 sample1r = picki(samples, offset1r);\n\n\tvec4 sample0lf = picki(fractions, offset0l);\n\tvec4 sample1lf = picki(fractions, offset1l);\n\tvec4 sample0rf = picki(fractions, offset0r);\n\tvec4 sample1rf = picki(fractions, offset1r);\n\n\tfloat t0 = 0., t1 = 0.;\n\n\t// partial sample steps require precision\n\t// WARN: we removed lerp in order to ↑ precision\n\t// if (mod(sampleStep, 1.) != 0. && sample0l.w != -1. && sample1r.w != -1.) {\n\t// \tt0 = offset0 - offset0l, t1 = offset1 - offset1l;\n\t// }\n\n\tif (sample0l.w == -1.) {\n\t\t// return vec3(0,0,-1);\n\t\t// sample0l.y = 0.;\n\t}\n\n\tfloat n = (offset1l - offset0l);\n\n\tfloat avg = (\n\t\t+ sample1l.y\n\t\t- sample0l.y\n\t\t+ sample1lf.y\n\t\t- sample0lf.y\n\t\t// + t1 * (sample1r.y - sample1l.y)\n\t\t// - t0 * (sample0r.y - sample0l.y)\n\t\t// + t1 * (sample1rf.y - sample1lf.y)\n\t\t// - t0 * (sample0rf.y - sample0lf.y)\n\t);\n\tavg /= n;\n\n\tfloat mx2 = (\n\t\t+ sample1l.z\n\t\t- sample0l.z\n\t\t+ sample1lf.z\n\t\t- sample0lf.z\n\t\t// + t1 * (sample1r.z - sample1l.z)\n\t\t// - t0 * (sample0r.z - sample0l.z)\n\t\t// + t1 * (sample1rf.z - sample1lf.z)\n\t\t// - t0 * (sample0rf.z - sample0lf.z)\n\t);\n\tmx2 /= n;\n\n\t// σ(x)² = M(x²) - M(x)²\n\tfloat m2 = avg * avg;\n\tfloat variance = abs(mx2 - m2);\n\n\t// get float32 tolerance for the power of mx2/m2\n\t// float tol = FLT_EPSILON * pow(2., ceil(9. + log2(max(mx2, m2))));\n\n\t// float sdev = variance <= tol ? 0. : sqrt(variance);\n\tfloat sdev = sqrt(variance);\n\n\treturn vec3(avg, sdev, min(sample0r.w, sample1l.w));\n}\n\nvoid main() {\n\tgl_PointSize = 3.5;\n\tif (color.a == 0.) return;\n\n\tnormThickness = thickness / viewport.w;\n\n\tfragColor = color / 255.;\n\tfragColor.a *= opacity;\n\n\tfloat offset = id * sampleStep;\n\n\t// compensate snapping for low scale levels\n\tfloat posShift = 0.;\n\n\tvec3 statsCurr = stats(offset);\n\n\t// ignore NaN amplitudes\n\tif (statsCurr.z == -1.) return;\n\n\tvec3 statsPrev = stats(offset - sampleStep);\n\tvec3 statsPrev2 = stats(offset - 2. * sampleStep);\n\tvec3 statsNext = stats(offset + sampleStep);\n\tvec3 statsNext2 = stats(offset + 2. * sampleStep);\n\n\tfloat avgCurr = statsCurr.x;\n\tfloat avgPrev = statsPrev.x;\n\tfloat avgPrev2 = statsPrev2.z != -1. ? statsPrev2.x : avgPrev;\n\tfloat avgNext = statsNext.x;\n\tfloat avgNext2 = statsNext2.z != -1. ? statsNext2.x : avgNext;\n\n\tfloat ampRange = abs(\n\t\t+ amplitude.y - amplitude.x\n\t);\n\tfloat sdevCurr = statsCurr.y / ampRange;\n\tfloat sdevPrev = statsPrev.y / ampRange;\n\tfloat sdevPrev2 = statsPrev2.y / ampRange;\n\tfloat sdevNext = statsNext.y / ampRange;\n\tfloat sdevNext2 = statsNext2.y / ampRange;\n\n\tfloat sdev = sdevCurr;\n\n\tavgCurr = reamp(avgCurr, amplitude);\n\tavgNext = reamp(avgNext, amplitude);\n\tavgNext2 = reamp(avgNext2, amplitude);\n\tavgPrev = reamp(avgPrev, amplitude);\n\tavgPrev2 = reamp(avgPrev2, amplitude);\n\n\t// compensate for sampling rounding\n\tvec2 position = vec2(\n\t\t(pxStep * (id + .5)) / viewport.z,\n\t\tavgCurr\n\t);\n\n\tvec2 normalLeft = normalize(vec2(\n\t\t-(avgCurr - avgPrev), pxStep / viewport.w\n\t));\n\tvec2 normalRight = normalize(vec2(\n\t\t-(avgNext - avgCurr), pxStep / viewport.w\n\t));\n\n\tvec2 bisec = normalize(normalLeft + normalRight);\n\tvec2 vert = vec2(0, 1);\n\tfloat bisecLen = abs(1. / dot(normalLeft, bisec));\n\tfloat vertRightLen = abs(1. / dot(normalRight, vert));\n\tfloat vertLeftLen = abs(1. / dot(normalLeft, vert));\n\tfloat maxVertLen = max(vertLeftLen, vertRightLen);\n\tfloat minVertLen = min(vertLeftLen, vertRightLen);\n\n\t// 2σ covers 68% of a line. 4σ covers 95% of line\n\tfloat vertSdev = 2. * sdev * viewport.w / thickness;\n\n\tvec2 join;\n\n\tif (statsPrev.z == -1.) {\n\t\tjoin = normalRight;\n\t}\n\telse if (statsNext.z == -1.) {\n\t\tjoin = normalLeft;\n\t}\n\t// sdev less than projected to vertical shows simple line\n\t// FIXME: sdev should be compensated by curve bend\n\telse if (vertSdev < maxVertLen) {\n\t\t// sdev more than normal but less than vertical threshold\n\t\t// rotates join towards vertical\n\t\tif (vertSdev > minVertLen) {\n\t\t\tfloat t = (vertSdev - minVertLen) / (maxVertLen - minVertLen);\n\t\t\tjoin = lerp(bisec * bisecLen, vert * maxVertLen, t);\n\t\t}\n\t\telse {\n\t\t\tjoin = bisec * bisecLen;\n\t\t}\n\t}\n\t// sdev more than projected to vertical modifies only y coord\n\telse {\n\t\tjoin = vert * vertSdev;\n\t}\n\n\t// figure out segment varyings\n\tstatsCurr = vec3(avgCurr, sdevCurr, statsCurr.z);\n\tstatsPrev = vec3(avgPrev, sdevPrev, statsPrev.z);\n\tstatsNext = vec3(avgNext, sdevNext, statsNext.z);\n\tstatsNext2 = vec3(avgNext2, sdevNext2, statsNext2.z);\n\tstatsPrev2 = vec3(avgPrev2, sdevPrev2, statsPrev2.z);\n\tstatsRight = side < 0. ? statsCurr : statsNext;\n\tstatsLeft = side < 0. ? statsPrev : statsCurr;\n\tstatsPrevRight = side < 0. ? statsPrev2 : statsPrev;\n\tstatsNextLeft = side < 0. ? statsNext : statsNext2;\n\n\tposition += sign * join * .5 * thickness / viewport.zw;\n\n\t// shift position by the clip offset\n\tposition.x += passId * pxStep * samples.length / sampleStep / viewport.z;\n\n\tgl_Position = vec4(position * 2. - 1., 0, 1);\n}\n"])
  }, shaderOptions));
  var drawLine = regl(extend$1({
    vert: glsl(["// direct sample output, connected by line, to the contrary to range\n\nprecision highp float;\n#define GLSLIFY 1\n\n// bring sample value to 0..1 from amplitude range\nfloat reamp(float v, vec2 amp) {\n\treturn (v - amp.x) / (amp.y - amp.x);\n}\n\nstruct Samples {\n\tfloat id;\n\tsampler2D data;\n\tsampler2D prev;\n\tsampler2D next;\n\tvec2 shape;\n\tfloat length;\n\tfloat sum, prevSum, sum2, prevSum2;\n};\n\nattribute float id, sign, side;\n\nuniform Samples samples;\nuniform float opacity, thickness, pxStep, sampleStep, total, translate, posShift;\nuniform vec4 viewport, color;\nuniform vec2 amplitude, range;\nuniform float passNum, passId, passOffset;\n\nvarying vec4 fragColor;\nvarying vec3 statsLeft, statsRight, statsPrevRight, statsNextLeft;\nvarying float normThickness;\n\nbool isNaN (vec4 sample) {\n\treturn sample.w == -1.;\n}\n\nvec4 stats (float offset) {\n\t// translate is here in order to remove float32 error (at the latest stage)\n\toffset += translate;\n\n\tvec2 uv = vec2(\n\t\tfloor(mod(offset, samples.shape.x)) + .5,\n\t\tfloor((offset) / samples.shape.x) + .5\n\t) / samples.shape;\n\n\tvec4 sample;\n\n\t// prev texture\n\tif (uv.y < 0.) {\n\t\tuv.y += 1.;\n\t\tsample = texture2D(samples.prev, uv);\n\t}\n\t// next texture\n\telse if (uv.y > 1.) {\n\t\tuv.y -= 1.;\n\t\tsample = texture2D(samples.next, uv);\n\t}\n\t// curr texture\n\telse {\n\t\tsample = texture2D(samples.data, uv);\n\t}\n\n\treturn sample;\n}\n\nvoid main () {\n\tgl_PointSize = 4.5;\n\tif (color.a == 0.) return;\n\n\tfragColor = color / 255.;\n\tfragColor.a *= opacity;\n\n\tnormThickness = thickness / viewport.w;\n\n\tfloat offset = id * sampleStep;\n\n\t// calc average of curr..next sampling points\n\tvec4 sampleCurr = stats(offset);\n\tif (isNaN(sampleCurr)) return;\n\n\tvec4 sampleNext = stats(offset + sampleStep);\n\tvec4 sampleNext2 = stats(offset + 2. * sampleStep);\n\tvec4 samplePrev = stats(offset - sampleStep);\n\tvec4 samplePrev2 = stats(offset - 2. * sampleStep);\n\n\tbool isStart = isNaN(samplePrev);\n\tbool isEnd = isNaN(sampleNext);\n\n\tfloat avgCurr = reamp(sampleCurr.x, amplitude);\n\tfloat avgNext = reamp(isEnd ? sampleCurr.x : sampleNext.x, amplitude);\n\tfloat avgNext2 = reamp(sampleNext2.x, amplitude);\n\tfloat avgPrev = reamp(isStart ? sampleCurr.x : samplePrev.x, amplitude);\n\tfloat avgPrev2 = reamp(samplePrev2.x, amplitude);\n\n\t// fake sdev 2σ = thickness\n\t// sdev = normThickness / 2.;\n\tfloat sdev = 0.;\n\n\tvec2 position = vec2(\n\t\tpxStep * (id + .5) / (viewport.z),\n\t\tavgCurr\n\t);\n\n\tfloat x = (pxStep) / viewport.z;\n\tvec2 normalLeft = normalize(vec2(\n\t\t-(avgCurr - avgPrev), x\n\t) / viewport.zw);\n\tvec2 normalRight = normalize(vec2(\n\t\t-(avgNext - avgCurr), x\n\t) / viewport.zw);\n\n\tvec2 join;\n\tif (isStart || isStart) {\n\t\tjoin = normalRight;\n\t}\n\telse if (isEnd || isEnd) {\n\t\tjoin = normalLeft;\n\t}\n\telse {\n\t\tvec2 bisec = normalLeft * .5 + normalRight * .5;\n\t\tfloat bisecLen = abs(1. / dot(normalLeft, bisec));\n\t\tjoin = bisec * bisecLen;\n\t}\n\n\t// FIXME: limit join by prev vertical\n\t// float maxJoinX = min(abs(join.x * thickness), 40.) / thickness;\n\t// join.x *= maxJoinX / join.x;\n\n\t// figure out closest to current min/max\n\tvec3 statsCurr = vec3(avgCurr, 0, sampleCurr.z);\n\tvec3 statsPrev = vec3(avgPrev, 0, samplePrev.z);\n\tvec3 statsNext = vec3(avgNext, 0, sampleNext.z);\n\tvec3 statsNext2 = vec3(avgNext2, 0, sampleNext2.z);\n\tvec3 statsPrev2 = vec3(avgPrev2, 0, samplePrev2.z);\n\n\tstatsRight = side < 0. ? statsCurr : statsNext;\n\tstatsLeft = side < 0. ? statsPrev : statsCurr;\n\tstatsPrevRight = side < 0. ? statsPrev2 : statsPrev;\n\tstatsNextLeft = side < 0. ? statsNext : statsNext2;\n\n\tposition += sign * join * .5 * thickness / viewport.zw;\n\n\t// compensate snapped sampleStep to enable smooth zoom\n\tposition.x += posShift / viewport.z;\n\n\t// shift position by the clip offset\n\t// FIXME: move to uniform\n\tposition.x += passId * pxStep * samples.length / sampleStep / viewport.z;\n\n\tgl_Position = vec4(position * 2. - 1., 0, 1);\n}\n"])
  }, shaderOptions)); // let drawPick = regl(extend({
  // 	frag: glsl('./shader/pick-frag.glsl')
  // }))

  var blankTexture = regl.texture({
    width: 1,
    height: 1,
    channels: this.textureChannels,
    type: 'float'
  });
  blankTexture.sum = 0;
  blankTexture.sum2 = 0;
  var NaNTexture = regl.texture({
    width: 1,
    height: 1,
    channels: this.textureChannels,
    type: 'float',
    data: new Float32Array([NaN, 0, 0, -1])
  });
  NaNTexture.sum = 0;
  NaNTexture.sum2 = 0;
  shader = {
    drawRanges: drawRanges,
    drawLine: drawLine,
    regl: regl,
    idBuffer: idBuffer,
    NaNTexture: NaNTexture,
    blankTexture: blankTexture,
    gl: gl
  };
  shaderCache.set(gl, shader);
  return shader;
};

Object.defineProperties(Waveform.prototype, {
  viewport: {
    get: function get() {
      if (!this.dirty) return this.drawOptions.viewport;
      var viewport;
      if (!this._viewport) viewport = [0, 0, this.gl.drawingBufferWidth, this.gl.drawingBufferHeight];else viewport = [this._viewport.x, this._viewport.y, this._viewport.width, this._viewport.height]; // invert viewport if necessary

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
      if (!this.dirty) return this.drawOptions.color;
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
      if (!this.dirty) return this.drawOptions.amplitude;
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
      if (!this.dirty) return this.drawOptions.range;

      if (this._range != null) {
        if (typeof this._range === 'number') {
          return [nidx(this._range, this.total), this.total];
        }

        return this._range;
      }

      return [0, this.total];
    },
    set: function set(range) {
      if (!range) return this._range = null;

      if (range.length) {
        // support vintage 4-value range
        if (range.length === 4) {
          this._range = [range[0], range[2]];
          this.amplitude = [range[1], range[3]];
        } else {
          this._range = [range[0], range[1]];
        }
      } else if (typeof range === 'number') {
        this._range = range;
      }

      this.dirty = true;
    }
  }
}); // update visual state

Waveform.prototype.update = function (o) {
  if (!o) return this;
  if (o.length != null) o = {
    data: o
  };else if (_typeof(o) !== 'object') throw Error('Argument must be a data or valid object');
  this.dirty = true;
  o = pick(o, {
    data: 'data value values sample samples',
    // push: 'add append push insert concat',
    range: 'range dataRange dataBox dataBounds dataLimits',
    amplitude: 'amp amplitude amplitudes ampRange bounds limits maxAmplitude maxAmp',
    thickness: 'thickness width linewidth lineWidth line-width',
    pxStep: 'step pxStep',
    color: 'color colour colors colours fill fillColor fill-color',
    line: 'line line-style lineStyle linestyle',
    viewport: 'clip vp viewport viewBox viewbox viewPort area',
    opacity: 'opacity alpha transparency visible visibility opaque',
    flip: 'flip iviewport invertViewport inverseViewport',
    mode: 'mode',
    shape: 'shape textureShape',
    sampleStep: 'sampleStep'
  }); // forcing rendering mode is mostly used for debugging purposes

  if (o.mode !== undefined) this.mode = o.mode;

  if (o.shape !== undefined) {
    if (this.textures.length) throw Error('Cannot set texture shape because textures are initialized already');
    this.textureShape = o.shape;
    this.textureLength = this.textureShape[0] * this.textureShape[1];
  } // parse line style


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
  } // rather debugging-purpose param, not supposed to be used


  if (o.sampleStep) this.sampleStep = o.sampleStep;
  return this;
}; // calculate draw options


Waveform.prototype.calc = function () {
  if (!this.dirty) return this.drawOptions;
  this.flush();
  var total = this.total,
      opacity = this.opacity,
      amplitude = this.amplitude,
      viewport = this.viewport,
      range = this.range;
  var color = this.color;
  var thickness = this.thickness; // calc runtime props

  var span = Math.abs(range[1] - range[0]) || 1; // init pxStep as max number of stops on the screen to cover the range

  var pxStep = Math.max( // width / span = how many pixels per sample to fit the range
  viewport[2] / span, // pxStep affects jittering on panning, .5 is good value
  this.pxStep || .5 //Math.pow(thickness, .1) * .1
  ); // init sampleStep as sample interval to fit the data range into viewport

  var sampleStep = pxStep * span / viewport[2]; // remove float64 residual

  sampleStep = f32.float(sampleStep); // snap sample step to 2^n grid: still smooth, but reduces float32 error
  // FIXME: make sampleStep snap step detection based on the span
  // round is better than ceil: ceil generates jittering

  sampleStep = Math.max(Math.round(sampleStep), 1);
  if (this.sampleStep) sampleStep = this.sampleStep; // recalc pxStep to adjust changed sampleStep, to fit initial the range

  pxStep = viewport[2] * sampleStep / span; // FIXME: ↑ pxStep is close to 0.5, but can vary here somewhat
  // pxStep = Math.ceil(pxStep * 16) / 16

  var pxPerSample = pxStep / sampleStep; // translate is calculated so to meet conditions:
  // - sampling always starts at 0 sample of 0 texture
  // - panning never breaks that rule
  // - changing sampling step never breaks that rule
  // - to reduce error for big translate, it is rotated by textureLength
  // - panning is always perceived smooth
  // translate snapped to samplesteps makes sure 0 sample is picked pefrectly
  // let translate =  Math.floor(range[0] / sampleStep) * sampleStep
  // let translate = Math.floor((-range[0] % (this.textureLength * 3)) / sampleStep) * sampleStep
  // if (translate < 0) translate += this.textureLength
  // compensate snapping for low scale levels

  var posShift = 0.;

  if (pxPerSample > 1) {
    posShift = (Math.round(range[0]) - range[0]) * pxPerSample;
  }

  var mode = this.mode; // detect passes number needed to render full waveform

  var passNum = Math.ceil(Math.floor(span * 1000) / 1000 / this.textureLength);
  var passes = Array(passNum);
  var firstTextureId = Math.round(range[0] / this.textureLength);
  var clipWidth = Math.min(this.textureLength / sampleStep * pxStep, viewport[2]);

  for (var i = 0; i < passNum; i++) {
    var textureId = firstTextureId + i; // ignore negative textures

    if (textureId < -1) continue;
    if (textureId > this.textures.length) continue;
    var clipLeft = Math.round(i * clipWidth);
    var clipRight = Math.round((i + 1) * clipWidth);
    var clip = [clipLeft + viewport[0], viewport[1], // clipWidth here may fluctuate due to rounding
    clipRight - clipLeft, viewport[3]]; // offset within the pass

    var passOffset = Math.round(range[0] / this.textureLength) * this.textureLength;
    var translate = Math.round(range[0]) - passOffset;
    var samplesNumber = Math.min( // number of visible points
    Math.ceil(clipWidth / pxStep), // max number of samples per pass
    Math.ceil(this.textureLength / sampleStep));
    passes[i] = {
      passId: i,
      textureId: textureId,
      clip: clip,
      passOffset: passOffset,
      // translate depends on pass
      translate: translate,
      // FIXME: reduce 3 to 2 or less
      // number of vertices to fill the clip width, including l/r overlay
      count: Math.min(4 + 4 * samplesNumber * 3 + 4, this.maxSampleCount),
      offset: 0,
      samples: this.textures[textureId] || this.NaNTexture,
      fractions: this.textures2[textureId] || this.blankTexture,
      prevSamples: this.textures[textureId - 1] || this.NaNTexture,
      nextSamples: this.textures[textureId + 1] || this.NaNTexture,
      prevFractions: this.textures2[textureId - 1] || this.blankTexture,
      nextFractions: this.textures2[textureId + 1] || this.blankTexture,
      // position shift to compensate sampleStep snapping
      shift: 0
    };
  } // use more complicated range draw only for sample intervals
  // note that rangeDraw gives sdev error for high values dataLength


  this.drawOptions = {
    thickness: thickness,
    color: color,
    pxStep: pxStep,
    pxPerSample: pxPerSample,
    viewport: viewport,
    sampleStep: sampleStep,
    span: span,
    total: total,
    opacity: opacity,
    amplitude: amplitude,
    range: range,
    mode: mode,
    passes: passes,
    passNum: passNum,
    posShift: posShift,
    dataShape: this.textureShape,
    dataLength: this.textureLength
  };
  this.dirty = false;
  return this.drawOptions;
}; // draw frame according to state


Waveform.prototype.render = function () {
  var _this2 = this;

  this.flush();
  if (this.total < 2) return this;
  var o = this.calc(); // multipass renders different textures to adjacent clip areas

  o.passes.forEach(function (pass) {
    // o ← {count, offset, clip, texture, shift}
    extend$1(o, pass); // in order to avoid glitch switching range/line mode on rezoom
    // we always render every range with transparent color

    var color = o.color; // range case

    if (o.pxPerSample <= 1. || o.mode === 'range' && o.mode != 'line') {
      _this2.shader.drawRanges.call(_this2, o); // o.color = [0,0,0,0]
      // this.shader.drawLine.call(this, o)
      // o.color = color
      // this.shader.drawRanges.call(this, extend({}, o, {
      // 	color: [255,0,0,255],
      // 	primitive: 'points'
      // }))

    } // line case
    else {
        _this2.shader.drawLine.call(_this2, o); // o.color = [0,0,0,0]
        // this.shader.drawRanges.call(this, o)
        // o.color = color

      }
  });
  return this;
}; // append samples, will be put into texture at the next frame or idle


Waveform.prototype.push = function () {
  var _this3 = this;

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

  if (this.cancelFlush) this.cancelFlush(), this.cancelFlush = null;
  this.dirty = true;
  this.cancelFlush = idle(function () {
    _this3.cancelFlush = null;

    _this3.flush();
  });
  return this;
}; // drain pushQueue


Waveform.prototype.flush = function () {
  // cancel planned callback
  if (this.cancelFlush) this.cancelFlush(), this.cancelFlush = null;

  if (this.pushQueue.length) {
    var arr = this.pushQueue;
    this.set(arr, this.total);
    this.pushQueue.length = 0;
  }

  return this;
}; // write samples into texture


Waveform.prototype.set = function (samples) {
  var at = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 0;
  if (!samples || !samples.length) return this; // draing queue, if possible overlap with total

  if (at + samples.length > this.total + this.pushQueue.length) {
    this.flush();
  } // future fill: provide NaN data


  if (at > this.total) {
    this.set(Array(at - this.total), this.total);
  }

  this.dirty = true; // carefully handle array

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
  } // detect textureShape based on limits
  // in order to reset sum2 more frequently to reduce error


  if (!this.textureShape) {
    this.textureShape = [512, 512];
    this.textureLength = this.textureShape[0] * this.textureShape[1];
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
    var txtData = pool.mallocFloat64(txtLen * ch); // fill txt data with NaNs for proper start/end/gap detection

    for (var _i3 = 0; _i3 < txtData.length; _i3 += ch) {
      txtData[_i3 + 0] = txtData[_i3 + 1] = txtData[_i3 + 2] = 0;
      txtData[_i3 + 3] = -1;
    }

    txt = this.textures[id] = this.regl.texture({
      width: this.textureShape[0],
      height: this.textureShape[1],
      channels: ch,
      type: 'float',
      min: 'nearest',
      mag: 'nearest',
      // min: 'linear',
      // mag: 'linear',
      wrap: ['clamp', 'clamp'],
      data: f32.float(txtData)
    });
    this.lastY = txt.sum = txt.sum2 = 0;
    txtFract = this.textures2[id] = this.regl.texture({
      width: this.textureShape[0],
      height: this.textureShape[1],
      channels: ch,
      type: 'float',
      min: 'nearest',
      mag: 'nearest',
      // min: 'linear',
      // mag: 'linear',
      wrap: ['clamp', 'clamp']
    });
    txt.data = txtData;
  } // calc sum, sum2 and form data for the samples


  var dataLen = Math.min(tillEndOfTxt, samples.length);
  var data = txt.data.subarray(offset * ch, offset * ch + dataLen * ch);

  for (var _i4 = 0, l = dataLen; _i4 < l; _i4++) {
    // put NaN samples as indicators of blank samples
    if (!isNaN(samples[_i4])) {
      data[_i4 * ch] = this.lastY = samples[_i4];
      data[_i4 * ch + 3] = 0;
    } else {
      data[_i4 * ch] = NaN; // write NaN values as a definite flag

      data[_i4 * ch + 3] = -1;
    }

    txt.sum += this.lastY;
    txt.sum2 += this.lastY * this.lastY; // we cannot rotate sums here because there can be any number of rotations between two edge samples
    // also that is hard to guess correct rotation limit, that can change at any new data
    // so we just keep precise secondary texture and hope the sum is not huge enough to reset at the next texture

    data[_i4 * ch + 1] = txt.sum;
    data[_i4 * ch + 2] = txt.sum2;
  } // increase total by the number of new samples


  if (this.total - at < dataLen) this.total += dataLen - (this.total - at); // fullfill last unfinished row

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
    this.set(samples.subarray(tillEndOfTxt), this.total);
    pool.freeFloat64(samples);
    pool.freeFloat64(data);
    return this;
  } // put data to texture, provide NaN transport & performant fractions calc


  function writeTexture(x, y, w, h, data) {
    var f32data = pool.mallocFloat32(data.length);
    var f32fract = pool.mallocFloat32(data.length);

    for (var _i5 = 0; _i5 < data.length; _i5++) {
      f32data[_i5] = data[_i5];
      f32fract[_i5] = data[_i5] - f32data[_i5];
    }

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
// Waveform.prototype.color


Waveform.prototype.opacity = 1;
Waveform.prototype.thickness = 1;
Waveform.prototype.mode = null; // Waveform.prototype.fade = true

Waveform.prototype.flip = false; // Texture size affects
// - sdev error: bigger texture accumulate sum2 error so signal looks more fluffy
// - performance: bigger texture is slower to create
// - zoom level: only 2 textures per screen are available, so zoom is limited
// - max number of textures

Waveform.prototype.textureShape;
Waveform.prototype.textureLength;
Waveform.prototype.textureChannels = 4;
Waveform.prototype.maxSampleCount = 8192 * 2;

function isRegl(o) {
  return typeof o === 'function' && o._gl && o.prop && o.texture && o.buffer;
}

function toPx(str) {
  if (typeof str === 'number') return str;
  if (!isBrowser) return parseFloat(str);
  var unit = parseUnit(str);
  return unit[0] * px(unit[1]);
}

function mirrorProperty(a, name, b) {
  Object.defineProperty(a, name, {
    get: function get() {
      return b[name];
    },
    set: function set(v) {
      return b[name] = v;
    }
  });
}

var glWaveform = Waveform;

module.exports = glWaveform;
