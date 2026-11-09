// Bloom: glowing things (beams, engines, explosions, the Sun) spill a soft halo of light, like a camera lens.
// Small and self-contained (no Three.js add-on files):
//   1. the scene is drawn into an HDR buffer (half-float, 4× MSAA) without tone mapping,
//   1b. only objects on the GLOW layer (effects and the Sun, not lit planets or shiny hulls, which would sparkle)
//       are drawn again into a second buffer: that is the light that blooms,
//   2. that light is blurred down a chain of smaller and smaller buffers and back up
//      (the "dual Kawase" blur: a handful of texture reads per pixel, cheap even on phones),
//   3. the scene plus the blurred light is tone mapped (ACES) and drawn to the screen.
// Off (direct rendering, exactly as before) on the Low graphics setting and when a slow device steps down.
import * as THREE from "../vendor/three/three.module.js";

const LEVELS = 5;
export const GLOW_LAYER = 1; // obj.layers.enable(GLOW_LAYER) makes an object bloom
const quadGeo = new THREE.BufferGeometry();
quadGeo.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)); // one triangle covering the screen
quadGeo.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const pass = (frag, uniforms, extra = {}) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...extra });

// downsample (5 taps) + a soft-knee brightness threshold on the first step
const downMat = pass(`uniform sampler2D tex; uniform vec2 texel; uniform float threshold; uniform float knee; uniform bool first; varying vec2 vUv;
  vec3 bright(vec3 c) { if (!first) return c; float l = max(c.r, max(c.g, c.b)); float s = clamp(l - threshold + knee, 0.0, 2.0 * knee); s = s * s / (4.0 * knee + 1e-4);
    return c * max(s, l - threshold) / max(l, 1e-4); }
  void main() { vec2 o = texel * 0.5;
    vec3 c = texture2D(tex, vUv).rgb * 4.0 + texture2D(tex, vUv - o).rgb + texture2D(tex, vUv + o).rgb + texture2D(tex, vUv + vec2(o.x, -o.y)).rgb + texture2D(tex, vUv - vec2(o.x, -o.y)).rgb;
    gl_FragColor = vec4(min(bright(c / 8.0), vec3(64.0)), 1.0); }`,
  { tex: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1 }, knee: { value: 0.5 }, first: { value: false } });

// upsample (8 taps), added on top of the next bigger level
const upMat = pass(`uniform sampler2D tex; uniform vec2 texel; uniform float radius; varying vec2 vUv;
  void main() { vec2 o = texel * radius; vec3 c = vec3(0.0);
    c += texture2D(tex, vUv + vec2(-2.0 * o.x, 0.0)).rgb + texture2D(tex, vUv + vec2(2.0 * o.x, 0.0)).rgb + texture2D(tex, vUv + vec2(0.0, -2.0 * o.y)).rgb + texture2D(tex, vUv + vec2(0.0, 2.0 * o.y)).rgb;
    c += (texture2D(tex, vUv + vec2(-o.x, o.y)).rgb + texture2D(tex, vUv + vec2(o.x, o.y)).rgb + texture2D(tex, vUv + vec2(-o.x, -o.y)).rgb + texture2D(tex, vUv + vec2(o.x, -o.y)).rgb) * 2.0;
    gl_FragColor = vec4(c / 12.0, 1.0); }`,
  { tex: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 1 } },
  { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation, transparent: true });

// final: scene + bloom, then the renderer's tone mapping and sRGB output (the same look as direct rendering)
const outMat = new THREE.ShaderMaterial({
  vertexShader: VERT,
  fragmentShader: `uniform sampler2D scene; uniform sampler2D bloom; uniform float strength; varying vec2 vUv;
    void main() { gl_FragColor = vec4(texture2D(scene, vUv).rgb + texture2D(bloom, vUv).rgb * strength, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  uniforms: { scene: { value: null }, bloom: { value: null }, strength: { value: 0.8 } },
  depthTest: false, depthWrite: false, toneMapped: true,
});

export function createBloom(renderer, { threshold = 0.15, knee = 0.15, strength = 0.8, radius = 1.0 } = {}) {
  const opts = { type: THREE.HalfFloatType, depthBuffer: false };
  const sceneRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const glowRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const mips = Array.from({ length: LEVELS }, () => new THREE.WebGLRenderTarget(1, 1, opts));
  mips.forEach(m => { m.texture.minFilter = m.texture.magFilter = THREE.LinearFilter; });
  const quad = new THREE.Mesh(quadGeo, downMat); quad.frustumCulled = false;
  const qScene = new THREE.Scene(); qScene.add(quad);
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const size = new THREE.Vector2();
  let w = 0, h = 0;

  function setSize() {
    renderer.getDrawingBufferSize(size);
    if (size.x === w && size.y === h) return;
    w = size.x; h = size.y;
    sceneRT.setSize(w, h); glowRT.setSize(w, h);
    let mw = w, mh = h;
    for (const m of mips) { mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); m.setSize(mw, mh); }
  }
  const draw = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); };

  const bloom = {
    enabled: true, threshold, knee, strength, radius,
    render(scene, camera) {
      if (!bloom.enabled) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
      setSize();
      const auto = renderer.autoClear;
      renderer.setRenderTarget(sceneRT); renderer.clear(); renderer.render(scene, camera);
      // the light that blooms: only GLOW_LAYER objects, on black
      const bg = scene.background, mask = camera.layers.mask;
      scene.background = null; camera.layers.set(GLOW_LAYER);
      renderer.setRenderTarget(glowRT); renderer.clear(); renderer.render(scene, camera);
      scene.background = bg; camera.layers.mask = mask;
      renderer.autoClear = false;
      // down the chain
      downMat.uniforms.threshold.value = bloom.threshold; downMat.uniforms.knee.value = bloom.knee;
      let src = glowRT.texture;
      mips.forEach((m, i) => {
        downMat.uniforms.tex.value = src; downMat.uniforms.first.value = i === 0;
        downMat.uniforms.texel.value.set(1 / src.image.width, 1 / src.image.height);
        renderer.setRenderTarget(m); renderer.clear(); draw(downMat, m); src = m.texture;
      });
      // and back up, adding each level onto the next bigger one
      upMat.uniforms.radius.value = bloom.radius;
      for (let i = LEVELS - 1; i > 0; i--) {
        upMat.uniforms.tex.value = mips[i].texture; upMat.uniforms.texel.value.set(1 / mips[i].width, 1 / mips[i].height);
        draw(upMat, mips[i - 1]);
      }
      renderer.autoClear = auto;
      outMat.uniforms.scene.value = sceneRT.texture; outMat.uniforms.bloom.value = mips[0].texture; outMat.uniforms.strength.value = bloom.strength;
      draw(outMat, null);
    },
  };
  return bloom;
}
