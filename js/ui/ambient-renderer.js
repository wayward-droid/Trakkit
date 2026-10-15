/** Decorative, low-resolution color field. It never reads application data. */
export function createAmbientRenderer(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;
  const shaders = [];
  let program,
    buffer,
    destroyed = false;
  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
  }
  function compile(type, source) {
    const shader = gl.createShader(type);
    if (!shader) throw new Error("Graphics unavailable");
    shaders.push(shader);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error("Graphics unavailable");
    return shader;
  }
  try {
    const vertex = compile(
      gl.VERTEX_SHADER,
      `
      attribute vec2 position;
      void main() { gl_Position = vec4(position, 0.0, 1.0); }
    `,
    );
    const fragment = compile(
      gl.FRAGMENT_SHADER,
      `
      precision mediump float;
      uniform vec2 resolution;
      uniform vec2 pointer;
      uniform float time;
      float hash(vec2 p) {
        p = fract(p * vec2(123.34, 345.45));
        p += dot(p, p + 34.345);
        return fract(p.x * p.y);
      }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), f.x), f.y);
      }
      float field(vec2 p) {
        float value = 0.0, amplitude = 0.5;
        for (int i = 0; i < 4; i++) {
          value += amplitude * noise(p);
          p = mat2(1.6, 1.2, -1.2, 1.6) * p + 3.1;
          amplitude *= 0.5;
        }
        return value;
      }
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution;
        vec2 p = (gl_FragCoord.xy * 2.0 - resolution) / min(resolution.x, resolution.y);
        p += pointer * 0.36;
        float t = time * 0.055;
        vec2 warp = vec2(field(p * 0.8 + t), field(p * 0.8 + vec2(4.2, -t)));
        float ink = field(p * 1.1 + warp * 2.8 + vec2(t * 0.3, -t * 0.2));
        float ribbon = pow(0.5 + 0.5 * sin((uv.y + warp.x * 0.4 + ink * 0.18) * 12.0 - t), 3.0);
        vec3 teal = vec3(0.08, 0.66, 0.76);
        vec3 blue = vec3(0.08, 0.22, 0.66);
        vec3 violet = vec3(0.46, 0.24, 0.72);
        vec3 color = mix(blue, teal, smoothstep(0.28, 0.78, ink));
        color = mix(color, violet, smoothstep(0.2, 0.9, uv.x + warp.y * 0.18));
        float edge = 0.55 + 0.45 * smoothstep(0.15, 0.9, distance(uv, vec2(0.35, 0.65)));
        color *= (0.12 + ribbon * 0.85 + ink * 0.3) * edge;
        gl_FragColor = vec4(vec3(0.018, 0.027, 0.062) + color, 1.0);
      }
    `,
    );
    program = gl.createProgram();
    if (!program) throw new Error("Graphics unavailable");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error("Graphics unavailable");
    gl.useProgram(program);
    buffer = gl.createBuffer();
    if (!buffer) throw new Error("Graphics unavailable");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const resolution = gl.getUniformLocation(program, "resolution"),
      pointer = gl.getUniformLocation(program, "pointer"),
      time = gl.getUniformLocation(program, "time");
    return {
      resize(width, height, pixelRatio = 1) {
        const ratio = Math.min(
          pixelRatio,
          1.5,
          Math.sqrt(450000 / Math.max(1, width * height)),
        );
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        gl.viewport(0, 0, canvas.width, canvas.height);
      },
      draw(seconds, x = 0, y = 0) {
        if (destroyed || gl.isContextLost()) return;
        gl.uniform2f(resolution, canvas.width, canvas.height);
        gl.uniform2f(pointer, x, y);
        gl.uniform1f(time, seconds);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      },
      destroy,
    };
  } catch {
    destroy();
    return null;
  }
}
