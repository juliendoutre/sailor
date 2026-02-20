"use strict";

async function loadShader(path) {
  const url = new URL(path, import.meta.url);

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status}`);
  }

  return await res.text();
}

const [
  quadShaderSource,
  advectShaderSource,
  pressureShaderSource,
  divergenceShaderSource,
  gradientShaderSource,
  jacobiShaderSource,
  splatShaderSource,
  obstacleShaderSource,
] = await Promise.all([
  loadShader("./shaders/vertex/quad.glsl"),
  loadShader("./shaders/fragments/advect.glsl"),
  loadShader("./shaders/fragments/pressure.glsl"),
  loadShader("./shaders/fragments/divergence.glsl"),
  loadShader("./shaders/fragments/gradient.glsl"),
  loadShader("./shaders/fragments/jacobi.glsl"),
  loadShader("./shaders/fragments/splat.glsl"),
  loadShader("./shaders/fragments/obstacle.glsl"),
]);

export class FluidSim {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;

    this.gl = canvas.getContext("webgl2", {
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
    });

    if (!this.gl) {
      throw new Error("WebGL2 is required.");
    }

    this.extCBF = this.gl.getExtension("EXT_color_buffer_float");
    if (!this.extCBF) {
      throw new Error("EXT_color_buffer_float required.");
    }

    this.simScale = opts.simScale ?? 1.0; // 1 = canvas size, >1 downsample
    this.dissipationVel = opts.dissipationVel ?? 0.999;
    this.pressureIters = opts.pressureIters ?? 20;
    this.timeStep = opts.timeStep ?? 1 / 60;

    // Geometry: fullscreen triangle (1 draw call, no VBO setup complexity)
    this.quadVAO = this.gl.createVertexArray();
    this.gl.bindVertexArray(this.quadVAO);

    // Render pressure as a color
    this.fsPressure = this.createProgram(quadShaderSource, pressureShaderSource);

    // Advect a quantity q by velocity field u
    this.fsAdvect = this.createProgram(quadShaderSource, advectShaderSource);

    // Compute divergence of velocity (for pressure solve)
    this.fsDivergence = this.createProgram(quadShaderSource, divergenceShaderSource);

    // Jacobi iteration to solve Poisson for pressure
    this.fsJacobi = this.createProgram(quadShaderSource, jacobiShaderSource);

    // Subtract pressure gradient from velocity (project to divergence-free)
    this.fsGradient = this.createProgram(quadShaderSource, gradientShaderSource);

    // Add force at a point (splat)
    this.fsSplat = this.createProgram(quadShaderSource, splatShaderSource);

    // Render obstacles
    this.fsObstacle = this.createProgram(quadShaderSource, obstacleShaderSource);

    // Obstacle definitions
    this.obstacles = [];
    this.obstacleColor = [1.0, 1.0, 1.0];

    // Create render targets (ping-pong for velocity, pressure; single for divergence)
    this.resize();

    // Interaction state
    this.pointer = {
      down: false,
      x: 0,
      y: 0,
      dx: 0,
      dy: 0,
    };
    this.initEvents();

    // Animation
    this.lastTime = performance.now();
    this.running = true;
    this.frame = this.frame.bind(this);
    requestAnimationFrame(this.frame);
  }

  initEvents() {
    const rect = () => this.canvas.getBoundingClientRect();

    const toUv = (e) => {
      const r = rect();
      const x = (e.clientX - r.left) / r.width;
      const y = 1.0 - (e.clientY - r.top) / r.height;
      return [x, y];
    };

    this.canvas.addEventListener("pointerdown", (e) => {
      this.pointer.down = true;
      const [u, v] = toUv(e);
      this.pointer.x = u;
      this.pointer.y = v;
      this.pointer.dx = 0;
      this.pointer.dy = 0;
    });

    this.canvas.addEventListener("pointermove", (e) => {
      const [u, v] = toUv(e);
      this.pointer.dx = u - this.pointer.x;
      this.pointer.dy = v - this.pointer.y;
      this.pointer.x = u;
      this.pointer.y = v;
    });

    this.canvas.addEventListener("pointerup", () => {
      this.pointer.down = false;
    });

    this.canvas.addEventListener("pointerleave", () => {
      this.pointer.down = false;
    });
  }

  resize(width, height) {
    const w = width ?? this.canvas.clientWidth | 0;
    const h = height ?? this.canvas.clientHeight | 0;
    this.canvas.width = w;
    this.canvas.height = h;

    // Simulation resolution (downsample for speed)
    const simW = Math.max(1, Math.floor(w / this.simScale));
    const simH = Math.max(1, Math.floor(h / this.simScale));
    this.simSize = [simW, simH];

    // Create or recreate targets
    const mkRG16 = () => this.createTarget(simW, simH, this.gl.RG16F);
    const mkR16 = () => this.createTarget(simW, simH, this.gl.R16F);

    // Velocity (RG16F), Pressure (R16F), Divergence (R16F), Obstacles (R16F)
    this.vel = this.createPingPong(mkRG16());
    this.pressure = this.createPingPong(mkR16());
    this.divergence = mkR16();
    this.obstacleTexture = mkR16();

    // Clear targets
    this.clearTarget(this.vel.read, [0, 0, 0, 1]);
    this.clearTarget(this.vel.write, [0, 0, 0, 1]);
    this.clearTarget(this.pressure.read, [0, 0, 0, 1]);
    this.clearTarget(this.pressure.write, [0, 0, 0, 1]);
    this.clearTarget(this.divergence, [0, 0, 0, 1]);
    this.clearTarget(this.obstacleTexture, [0, 0, 0, 1]);

    // Re-render obstacles after resize
    this.renderObstacles();
  }

  createProgram(vsSource, fsSource) {
    const vs = this.gl.createShader(this.gl.VERTEX_SHADER);
    this.gl.shaderSource(vs, vsSource);
    this.gl.compileShader(vs);
    if (!this.gl.getShaderParameter(vs, this.gl.COMPILE_STATUS)) {
      throw new Error(this.gl.getShaderInfoLog(vs));
    }

    const fs = this.gl.createShader(this.gl.FRAGMENT_SHADER);
    this.gl.shaderSource(fs, fsSource);
    this.gl.compileShader(fs);
    if (!this.gl.getShaderParameter(fs, this.gl.COMPILE_STATUS)) {
      throw new Error(this.gl.getShaderInfoLog(fs));
    }

    const prog = this.gl.createProgram();
    this.gl.attachShader(prog, vs);
    this.gl.attachShader(prog, fs);
    this.gl.linkProgram(prog);

    if (!this.gl.getProgramParameter(prog, this.gl.LINK_STATUS)) {
      throw new Error(this.gl.getProgramInfoLog(prog));
    }

    this.gl.deleteShader(vs);
    this.gl.deleteShader(fs);

    return prog;
  }

  createTarget(width, height, internalFormat) {
    const tex = this.gl.createTexture();
    this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

    let type = this.gl.FLOAT;
    let base = this.gl.RGBA;

    // Map internal format to base format and type
    if (internalFormat === this.gl.RG16F) {
      base = this.gl.RG;
      type = this.gl.FLOAT;
    }

    if (internalFormat === this.gl.R16F) {
      base = this.gl.RED;
      type = this.gl.FLOAT;
    }

    if (internalFormat === this.gl.RGBA16F) {
      base = this.gl.RGBA;
      type = this.gl.FLOAT;
    }

    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      internalFormat,
      width,
      height,
      0,
      base,
      type,
      null,
    );

    const fbo = this.gl.createFramebuffer();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fbo);
    this.gl.framebufferTexture2D(
      this.gl.FRAMEBUFFER,
      this.gl.COLOR_ATTACHMENT0,
      this.gl.TEXTURE_2D,
      tex,
      0,
    );

    const status = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
    if (status !== this.gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("FBO incomplete: " + status.toString());
    }

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);

    return { tex, fbo, w: width, h: height, internalFormat };
  }

  createPingPong(target) {
    const a = target;

    const b = this.createTarget(target.w, target.h, target.internalFormat);

    const pingpong = {
      read: a,
      write: b,
      swap() {
        const t = this.read;
        this.read = this.write;
        this.write = t;
      },
    };

    return pingpong;
  }

  clearTarget(target, rgba) {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target.fbo);
    this.gl.viewport(0, 0, target.w, target.h);
    this.gl.clearColor(rgba[0], rgba[1], rgba[2], rgba[3]);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  drawTo(target, program, uniforms, bindings) {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target ? target.fbo : null);
    this.gl.viewport(
      0,
      0,
      target ? target.w : this.canvas.width,
      target ? target.h : this.canvas.height,
    );

    this.gl.useProgram(program);

    // Set common sampler locations incrementally
    let unit = 0;

    const bindTex = (name, tex) => {
      const loc = this.gl.getUniformLocation(program, name);
      this.gl.activeTexture(this.gl.TEXTURE0 + unit);
      this.gl.bindTexture(this.gl.TEXTURE_2D, tex);
      this.gl.uniform1i(loc, unit);
      unit++;
    };

    // Bind textures
    if (bindings) {
      for (const [name, tex] of Object.entries(bindings)) {
        bindTex(name, tex);
      }
    }

    // Set uniforms
    if (uniforms) {
      for (const [name, val] of Object.entries(uniforms)) {
        const loc = this.gl.getUniformLocation(program, name);
        if (loc == null) {
          continue;
        }

        if (typeof val === "number") {
          this.gl.uniform1f(loc, val);
        } else if (Array.isArray(val)) {
          if (val.length === 2) {
            this.gl.uniform2f(loc, val[0], val[1]);
          } else if (val.length === 3) {
            this.gl.uniform3f(loc, val[0], val[1], val[2]);
          } else if (val.length === 4) {
            this.gl.uniform4f(loc, val[0], val[1], val[2], val[3]);
          }
        }
      }
    }

    this.gl.bindVertexArray(this.quadVAO);
    this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);

    this.gl.bindVertexArray(null);
    this.gl.useProgram(null);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
  }

  addObstacle(type, x, y, options = {}) {
    const obstacle = {
      type,
      x,
      y,
      radius: options.radius || 0.05,
    };

    this.obstacles.push(obstacle);
    this.renderObstacles();
    return obstacle;
  }

  renderObstacles() {
    // Clear obstacle texture
    this.clearTarget(this.obstacleTexture, [0, 0, 0, 1]);

    // Enable additive blending to combine multiple obstacles
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.ONE, this.gl.ONE);

    // Render each obstacle
    for (const obstacle of this.obstacles) {
      this.drawTo(
        this.obstacleTexture,
        this.fsObstacle,
        {
          uPoint: [obstacle.x, obstacle.y],
          uRadius: obstacle.radius,
          uAspect: this.simSize[0] / this.simSize[1],
        }
      );
    }

    // Disable blending
    this.gl.disable(this.gl.BLEND);
  }

  step(dt) {
    const texel = [1 / this.simSize[0], 1 / this.simSize[1]];

    // 1) Splat user input (adds velocity)
    if (this.pointer.down) {
      const force = [this.pointer.dx * 500.0, this.pointer.dy * 500.0];
      // Velocity splat
      this.drawTo(
        this.vel.write,
        this.fsSplat,
        {
          uPoint: [this.pointer.x, this.pointer.y],
          uColor: [force[0], force[1], 0],
          uRadius: 0.02,
          uAspect: this.simSize[0] / this.simSize[1],
        },
        { uTarget: this.vel.read.tex },
      );
      this.vel.swap();

      // reset pointer delta after applying
      this.pointer.dx = this.pointer.dy = 0;
    }

    // 2) Advect velocity by itself (with slight dissipation)
    this.drawTo(
      this.vel.write,
      this.fsAdvect,
      {
        uDt: dt,
        uDissipation: Math.pow(this.dissipationVel, dt * 60.0),
        uTexel: texel,
      },
      {
        uQ: this.vel.read.tex,
        uVelocity: this.vel.read.tex,
        uObstacles: this.obstacleTexture.tex
      },
    );
    this.vel.swap();

    // 3) Compute divergence of velocity
    this.drawTo(
      this.divergence,
      this.fsDivergence,
      { uTexel: texel },
      { uVelocity: this.vel.read.tex },
    );

    // 4) Pressure solve via Jacobi iterations
    // Clear pressure (optional) — skip to keep previous frame as initial guess
    for (let i = 0; i < this.pressureIters; i++) {
      this.drawTo(
        this.pressure.write,
        this.fsJacobi,
        { uTexel: texel },
        {
          uPressure: this.pressure.read.tex,
          uDivergence: this.divergence.tex,
          uObstacles: this.obstacleTexture.tex,
        },
      );
      this.pressure.swap();
    }

    // 5) Subtract pressure gradient from velocity
    this.drawTo(
      this.vel.write,
      this.fsGradient,
      { uTexel: texel },
      {
        uVelocity: this.vel.read.tex,
        uPressure: this.pressure.read.tex,
        uObstacles: this.obstacleTexture.tex,
      },
    );
    this.vel.swap();
  }

  // --- Rendering (to screen) ---
  render() {
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.drawTo(null, this.fsPressure,
      { uObstacleColor: this.obstacleColor },
      {
        uTex: this.pressure.read.tex,
        uObstacles: this.obstacleTexture.tex
      }
    );
  }

  frame(now) {
    if (!this.running) {
      return
    };

    const dt = Math.min(0.033, (now - this.lastTime) / 1000) || this.timeStep;
    this.lastTime = now;
    this.step(dt);
    this.render();
    requestAnimationFrame(this.frame);
  }
}
