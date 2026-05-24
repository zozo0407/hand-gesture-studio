const VERTEX_SHADER_SOURCE = `
attribute vec2 aPosition;
attribute vec2 aTexCoord;
varying vec2 vUv;

void main() {
  vUv = aTexCoord;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER_SOURCE = `
precision mediump float;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
uniform float uSpeed;

varying vec2 vUv;

float hash(vec2 point) {
  return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 point) {
  vec2 cell = floor(point);
  vec2 local = fract(point);
  vec2 curve = local * local * (3.0 - 2.0 * local);

  float a = hash(cell);
  float b = hash(cell + vec2(1.0, 0.0));
  float c = hash(cell + vec2(0.0, 1.0));
  float d = hash(cell + vec2(1.0, 1.0));

  return mix(mix(a, b, curve.x), mix(c, d, curve.x), curve.y);
}

float fbm(vec2 point) {
  float value = 0.0;
  float amplitude = 0.5;

  for (int index = 0; index < 4; index++) {
    value += noise(point) * amplitude;
    point = point * 2.03 + vec2(8.31, 3.17);
    amplitude *= 0.5;
  }

  return value;
}

void main() {
  vec2 uv = vUv;
  vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  vec2 centered = (uv - 0.5) * aspect;
  float time = uTime * (0.18 + uSpeed * 0.82);
  float strength = 0.012 + uIntensity * 0.045;

  float broadFlow = fbm(uv * 3.2 + vec2(time * 0.55, -time * 0.32));
  float fineFlow = fbm(uv * 8.5 + vec2(-time * 0.42, time * 0.68));
  vec2 wave = vec2(
    sin((uv.y + broadFlow * 0.36 + time) * 13.0),
    cos((uv.x + fineFlow * 0.30 - time * 0.8) * 12.0)
  );
  vec2 lensBend = normalize(centered + 0.00001) * dot(centered, centered) * strength * 0.42;
  vec2 refraction = (wave * 0.5 + vec2(broadFlow, fineFlow) - 0.5) * strength - lensBend;
  vec2 sampleUv = clamp(uv + refraction, vec2(0.001), vec2(0.999));

  vec3 base = texture2D(uTexture, sampleUv).rgb;
  float chroma = 0.0015 + uIntensity * 0.005;
  float red = texture2D(uTexture, clamp(sampleUv + refraction * 1.25 + vec2(chroma, -chroma * 0.25), vec2(0.001), vec2(0.999))).r;
  float blue = texture2D(uTexture, clamp(sampleUv - refraction * 1.20 - vec2(chroma, -chroma * 0.25), vec2(0.001), vec2(0.999))).b;
  base.r = mix(base.r, red, 0.34 + uIntensity * 0.24);
  base.b = mix(base.b, blue, 0.30 + uIntensity * 0.22);

  float causticA = abs(sin((uv.x + broadFlow * 0.22) * 24.0 + time * 1.7));
  float causticB = abs(cos((uv.y - fineFlow * 0.18) * 21.0 - time * 1.25));
  float caustic = pow(1.0 - min(1.0, causticA * causticB * 1.25), 3.4);
  float gloss = smoothstep(0.62, 0.98, fbm(uv * 14.0 + vec2(time * 1.2, -time * 0.9)));

  vec3 glassTint = vec3(0.88, 0.97, 1.08);
  vec3 color = mix(base, base * glassTint, 0.18 + uIntensity * 0.22);
  color += vec3(0.42, 0.70, 1.0) * (caustic * 0.16 + gloss * 0.07) * (0.45 + uIntensity);

  gl_FragColor = vec4(color, 1.0);
}
`;

const QUAD_DATA = new Float32Array([
  -1, -1, 0, 1,
  1, -1, 1, 1,
  -1, 1, 0, 0,
  1, 1, 1, 0,
]);

export class LiquidGlassRenderer {
  constructor() {
    this.canvas = document.createElement("canvas");
    this.gl = this.canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });

    if (!this.gl) {
      return;
    }

    try {
      this.initialize();
    } catch (error) {
      console.warn("Liquid glass shader disabled:", error);
      this.gl = null;
    }
  }

  render(source, width, height, { time = 0, intensity = 0.6, speed = 1 } = {}) {
    if (!this.gl || !this.program || width < 1 || height < 1 || source.readyState < 2) {
      return null;
    }

    const gl = this.gl;

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }

    gl.viewport(0, 0, width, height);
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } catch {
      return null;
    }

    gl.uniform1i(this.uniforms.texture, 0);
    gl.uniform2f(this.uniforms.resolution, width, height);
    gl.uniform1f(this.uniforms.time, time);
    gl.uniform1f(this.uniforms.intensity, clampNumber(intensity, 0, 1));
    gl.uniform1f(this.uniforms.speed, clampNumber(speed, 0, 2));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    return this.canvas;
  }

  initialize() {
    const gl = this.gl;
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    const program = createProgram(gl, vertexShader, fragmentShader);
    const quadBuffer = gl.createBuffer();
    const texture = gl.createTexture();

    if (!quadBuffer || !texture) {
      throw new Error("Unable to create WebGL resources.");
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, QUAD_DATA, gl.STATIC_DRAW);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
    const positionLocation = gl.getAttribLocation(program, "aPosition");
    const texCoordLocation = gl.getAttribLocation(program, "aTexCoord");

    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(texCoordLocation);
    gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, stride, 2 * Float32Array.BYTES_PER_ELEMENT);

    this.program = program;
    this.texture = texture;
    this.uniforms = {
      texture: gl.getUniformLocation(program, "uTexture"),
      resolution: gl.getUniformLocation(program, "uResolution"),
      time: gl.getUniformLocation(program, "uTime"),
      intensity: gl.getUniformLocation(program, "uIntensity"),
      speed: gl.getUniformLocation(program, "uSpeed"),
    };
  }
}

function createShader(gl, type, source) {
  const shader = gl.createShader(type);

  if (!shader) {
    throw new Error("Unable to create shader.");
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) ?? "Unknown shader compile error.";
    gl.deleteShader(shader);
    throw new Error(message);
  }

  return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();

  if (!program) {
    throw new Error("Unable to create WebGL program.");
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) ?? "Unknown program link error.";
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}

function clampNumber(value, min, max) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return min;
  }

  return Math.min(max, Math.max(min, number));
}
