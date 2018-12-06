// rollup.config.js
import commonjs from 'rollup-plugin-commonjs'
import babel from 'rollup-plugin-babel'
import tr from 'rollup-plugin-browserify-transform'
import glslify from 'glslify'
import resolve from 'rollup-plugin-node-resolve'

export default {
  input: 'index.js',
  output: {
    file: 'dist/index.js',
    format: 'cjs'
  },
  plugins: [
    tr(glslify),
    resolve(),
    commonjs({
      sourceMap: false,
      include: ['index.js'],
      ignore: [
        'pick-by-alias',
        'object-assign',
        'weak-map',
        'regl',
        'parse-rect',
        'gl-util/context',
        'is-plain-obj',
        'typedarray-pool',
        'glslify',
        'color-normalize',
        'negative-zero',
        'to-float32',
        'parse-unit',
        'to-px',
        'flatten-vertex-data',
        'lerp',
        'is-browser'
      ]
    }),
    babel({
      'presets': ['@babel/preset-env']
    })
  ]
};
