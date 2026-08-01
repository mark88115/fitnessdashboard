// fitness-dashboard/js/bodyScene.js
import * as THREE from 'three';
import { ColladaLoader } from 'three/addons/loaders/ColladaLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// Four calibration body types, rigged/sculpted in MakeHuman and exported as
// Collada (13380-vertex MakeHuman topology). ColladaLoader expands this to
// 80268 vertices per mesh via per-corner vertex splitting (separate
// position/normal/uv indices in the source data) — verified identical
// vertex count *and* order across all 4 archetype loads, since only vertex
// positions differ between them, not the face/UV/normal index structure.
// That makes them safe to use directly as Three.js morph targets: position
// i in any archetype's mesh is the same anatomical point as position i in
// every other archetype's mesh of the same name.
//
// buff.dae is the MakeHuman muscle=1.0 / weight=0.9 export. An earlier
// weight=0.2 export of the same muscle setting was effectively unusable as
// a "much bigger" target: the low weight shrank the body by about as much
// as the muscle macro grew it, leaving a mean vertex displacement from
// normal.dae of 0.0343 — *smaller* than thin.dae's own 0.0487, i.e. the
// "超壯" archetype was barely further from average than the skinny one. The
// weight=0.9 re-export measures 0.0723, roughly double, which is what makes
// a plain blend toward it read as visibly more muscular. Anything that
// tries to exaggerate this blend arithmetically instead (scaling morph
// influence past 1.0, or synthesising extra volume from buff's own
// displacement field) produces creases and detached-looking muscle blobs,
// because it amplifies a field whose median is zero — the asset has to
// carry the bulk, not the blend.
// Each archetype's coordinates on the two axes every figure is blended
// against: musclePct (skeletal muscle mass as % of the standard for the
// subject's height — see bodytypeExplorer.js's muscleRateFromSmm) and
// bodyFatPercent (an actual physiological body-fat percentage). Both
// viewports are driven by exactly this pair, so setting the explorer's
// sliders to a measurement's own numbers reproduces that measurement's
// figure.
const BODYTYPE_MODELS = {
  thin: { url: 'assets/models/bodytypes/thin.dae', label: '瘦', musclePct: 85, bodyFatPercent: 10 },
  normal: { url: 'assets/models/bodytypes/normal.dae', label: '正常', musclePct: 100, bodyFatPercent: 18 },
  fat: { url: 'assets/models/bodytypes/fat.dae', label: '胖', musclePct: 90, bodyFatPercent: 32 },
  // 160, not the 200 this once carried: 200 was a nominal "very muscular"
  // figure never tied to the asset, and it made the data viewport render a
  // given muscle rate at 1.65x less buff than the explorer showed for the
  // same number. 160 is the muscle rate at which buff.dae's own sculpted
  // shape is reached, and it matches the explorer slider's full-scale end.
  buff: { url: 'assets/models/bodytypes/buff.dae', label: '超壯', musclePct: 160, bodyFatPercent: 12 },
};
const BODYTYPE_ORDER = ['thin', 'normal', 'fat', 'buff'];
// 'normal' is the base geometry, not a morph target — its own influence is
// implicit (1 - sum of the other three).
const MORPH_KEYS = ['thin', 'fat', 'buff'];

// Matches the --baseline/--muscle/--projected CSS variables in style.css.
// All three states occupy the same position, so what separates them is how
// each is depth-tested against the opaque `current` figure — and the two
// overlays are deliberately handled differently:
//
// `projected` keeps depth testing on, so it is drawn only where the
// projected body actually sits in front of the current one. That turns the
// purple into information — it appears exactly where the body would grow —
// and it stays crisp. Disabling depth testing here (as `baseline` does) was
// the original design and could not be made legible by opacity alone: with
// no depth test the layer blankets the entire silhouette uniformly, so
// raising opacity to make it "clearer" just repaints the whole figure one
// flat colour. Measured at 0.45 the green and purple merged into a single
// muddy blue-grey body; at 0.22 the purple was barely perceptible. There is
// no value in between that is both visible and readable.
//
// `baseline` does keep depth testing off, because it is normally *smaller*
// than current — depth-tested it would sit entirely inside the current
// body's volume and never draw at all. A low-opacity all-over tint is the
// only way it shows up, and being the "where you started" reference it does
// not need to be crisp. (A back-face outline was tried early on as a way to
// give both a contour; it renders a rim only where the layer is larger than
// what is in front of it, so it had the same one-directional blind spot.)
const STATE_STYLE = {
  baseline: { color: 0xd4d4d4, opacity: 0.22, depthTest: false, renderOrder: 1 },
  current: { color: 0x4ade80, opacity: 1.0, renderOrder: 0 },
  projected: { color: 0x7c3aed, opacity: 0.8, renderOrder: 2 },
};
const GALLERY_STYLE = { color: 0xd97706, opacity: 0.9, renderOrder: 0 };

// Framed so the figure fills most of the viewport on load rather than
// sitting small in the middle of it. At this 35° vertical fov the visible
// height at the target is 2·d·tan(fov/2), so a ~3.15 camera-to-target
// distance shows just under 2 units against a ~1.73-tall body — about 87%
// of the frame. The target sits at the body's own mid-height, not higher,
// so that fill is centred instead of running off the bottom.
// OrbitControls takes over from here, so this only sets the starting view.
const CAMERA_POSITION = [0, 1.0, 3.15];
const CAMERA_TARGET = [0, 0.88, 0];

/** How far `value` has travelled from `neutral` toward `anchor`, as 0..1.
 * Clamped at both ends, and direction-agnostic — `anchor` may be above or
 * below `neutral`, so the same call shape works for "more muscular" (100 →
 * 200) and "leaner" (100 → 65). */
function ramp(value, neutral, anchor) {
  if (value === null || value === undefined || anchor === neutral) return 0;
  const t = (value - neutral) / (anchor - neutral);
  return t < 0 ? 0 : (t > 1 ? 1 : t);
}

/** The single blend both viewports use, so the same body composition always
 * produces the same figure on either side. `musclePct` is skeletal muscle
 * mass as a percentage of the standard for the subject's height, and
 * `pbfPercent` is an actual body-fat percentage.
 *
 * Each axis drives its own archetypes independently rather than picking the
 * nearest archetype in a joint 2D space. That joint inverse-distance blend
 * was the original design and had a flaw that made the figure barely respond
 * to real change: 'normal' sits at the centre of that space, so it was the
 * closest anchor across most of the practical range and swamped everything
 * else. Measured against this project's own InBody history, the data
 * viewport's three states came out `buff` 0.031 / 0.033 / 0.090 for baseline
 * / current / a projection adding 12% muscle — the first two differing by
 * 0.002, i.e. three months of real progress was invisible. Per-axis ramps
 * fix that, and stop one axis sitting near neutral from holding the other
 * axis's archetype down.
 *
 * `thin` is the larger of the two "below neutral" ramps because thin.dae is
 * the only asset available for both "less muscular" and "leaner" — there is
 * no dedicated low-muscle-only archetype to keep those separate. */
function archetypeWeights(musclePct, pbfPercent) {
  const neutralFat = BODYTYPE_MODELS.normal.bodyFatPercent;
  const muscleThin = ramp(musclePct, 100, BODYTYPE_MODELS.thin.musclePct);
  const fatThin = ramp(pbfPercent, neutralFat, BODYTYPE_MODELS.thin.bodyFatPercent);
  return {
    thin: Math.max(muscleThin, fatThin),
    fat: ramp(pbfPercent, neutralFat, BODYTYPE_MODELS.fat.bodyFatPercent),
    buff: ramp(musclePct, 100, BODYTYPE_MODELS.buff.musclePct),
  };
}

/** Transforms a position BufferAttribute into world space, baking in the
 * mesh's own matrixWorld — needed so positions from differently-transformed
 * mesh nodes line up before being used as morph target data. */
function bakeWorldPositions(positionAttr, matrixWorld) {
  const count = positionAttr.count;
  const out = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(positionAttr, i);
    v.applyMatrix4(matrixWorld);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  return out;
}

/** Smooth vertex normals for a set of baked world-space positions, as a
 * BufferAttribute. Recomputed rather than reusing the source mesh's own
 * normal attribute, which is in the mesh node's local space while these
 * positions have already been transformed to world space (see
 * bakeWorldPositions).
 *
 * Face normals are accumulated per *welded* vertex — vertices sharing a
 * position, not sharing an index. BufferGeometry.computeVertexNormals()
 * can't be used directly here: this mesh is non-indexed (ColladaLoader
 * splits its 13380 source vertices into 80268 render vertices so each face
 * corner can carry its own uv), so no two triangles share a vertex index
 * and that method assigns every corner its own face's normal, producing
 * flat faceted shading across the whole body. Welding by position restores
 * the shared-vertex averaging that makes the surface read as smooth.
 * Accumulated unnormalized so larger faces weigh proportionally more. */
function computeNormalsFor(positions) {
  const count = positions.length / 3;
  const keyToUnique = new Map();
  const vertexToUnique = new Int32Array(count);
  let uniqueCount = 0;
  const quant = 1e5;
  for (let i = 0; i < count; i++) {
    const key = `${Math.round(positions[i * 3] * quant)},${Math.round(positions[i * 3 + 1] * quant)},${Math.round(positions[i * 3 + 2] * quant)}`;
    let u = keyToUnique.get(key);
    if (u === undefined) {
      u = uniqueCount++;
      keyToUnique.set(key, u);
    }
    vertexToUnique[i] = u;
  }

  const nx = new Float32Array(uniqueCount);
  const ny = new Float32Array(uniqueCount);
  const nz = new Float32Array(uniqueCount);
  for (let i = 0; i < count; i += 3) {
    const a = i * 3;
    const b = (i + 1) * 3;
    const c = (i + 2) * 3;
    const e1x = positions[b] - positions[a];
    const e1y = positions[b + 1] - positions[a + 1];
    const e1z = positions[b + 2] - positions[a + 2];
    const e2x = positions[c] - positions[a];
    const e2y = positions[c + 1] - positions[a + 1];
    const e2z = positions[c + 2] - positions[a + 2];
    const fx = e1y * e2z - e1z * e2y;
    const fy = e1z * e2x - e1x * e2z;
    const fz = e1x * e2y - e1y * e2x;
    for (let k = 0; k < 3; k++) {
      const u = vertexToUnique[i + k];
      nx[u] += fx;
      ny[u] += fy;
      nz[u] += fz;
    }
  }

  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const u = vertexToUnique[i];
    const len = Math.hypot(nx[u], ny[u], nz[u]) || 1;
    out[i * 3] = nx[u] / len;
    out[i * 3 + 1] = ny[u] / len;
    out[i * 3 + 2] = nz[u] / len;
  }
  return new THREE.BufferAttribute(out, 3);
}

export class BodyScene {
  /** Two independent viewports (own scene/camera/controls each) so either
   * can be rotated without moving the other. */
  constructor(dataContainer, galleryContainer) {
    this.data = this._createViewport(dataContainer, '你的數據(灰色調=基準 綠=目前 紫色調=預估)');
    this.gallery = this._createViewport(galleryContainer, '');

    this.figures = {};

    // ResizeObserver, not a window 'resize' listener — the containers'
    // final layout size (after the grid/flex layout around them settles,
    // fonts load, etc.) isn't necessarily known yet at construction time,
    // and 'resize' only fires on the *window* resizing, not when an
    // element's own computed size changes for other reasons. That left the
    // canvas's internal resolution sized to a wrong/stale measurement on
    // first load — a stretched/distorted figure that only corrected itself
    // once the user manually resized the browser window and *that* finally
    // fired 'resize'. ResizeObserver fires whenever the observed element's
    // actual size changes, including once immediately with the correct
    // size as soon as layout is done, which is what's needed here.
    //
    // Held on `this` rather than in a local: an observer nothing references
    // any more is eligible for garbage collection, and once collected it
    // silently stops delivering callbacks. That was happening here — after
    // the first few seconds the canvas resolution froze at whatever the
    // layout happened to be mid-load and never tracked the container again.
    this._resizeObserver = new ResizeObserver(() => {
      this._resizeViewport(this.data);
      this._resizeViewport(this.gallery);
    });
    this._resizeObserver.observe(dataContainer);
    this._resizeObserver.observe(galleryContainer);

    requestAnimationFrame(this._animate);
  }

  _createViewport(container, label) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeae5d9);

    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(...CAMERA_POSITION);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(...CAMERA_TARGET);
    controls.enableDamping = true;

    // On a phone the two stacked viewports fill most of the screen, and
    // OrbitControls sets `touch-action: none` on its canvas — so a swipe
    // anywhere over a figure rotates it and never scrolls the page, leaving
    // the reader stranded halfway down the dashboard with no way past. One
    // finger is handed back to the page; two fingers still rotate and pinch.
    // Mouse dragging is unaffected (that's `mouseButtons`), so the desktop
    // one-button orbit stays as it was.
    if (window.matchMedia('(pointer: coarse)').matches) {
      controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_ROTATE };
      renderer.domElement.style.touchAction = 'pan-y';
    }

    // Muscle definition is read almost entirely from shading, so the lighting
    // is set up to produce it rather than to evenly illuminate: a low ambient
    // fill (a strong one washes the form shadows out flat — at the original
    // 1.1 the figure read as a smooth silhouette with no visible pec/ab
    // separation at all), a bright key raking in from the side-front so
    // muscle bellies cast their own gradients, and a warm rim from behind to
    // pick the outline off the light background.
    scene.add(new THREE.HemisphereLight(0xffffff, 0x222233, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3.5, 2.5, 1.2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffd9b0, 0.7);
    rim.position.set(-2.5, 1.5, -2.5);
    scene.add(rim);

    const labelEl = document.createElement('div');
    labelEl.className = 'body-scene__label';
    labelEl.textContent = label;
    container.appendChild(labelEl);

    const viewport = { container, scene, camera, renderer, controls, labelEl };
    this._resizeViewport(viewport);
    return viewport;
  }

  _resizeViewport(viewport) {
    const w = viewport.container.clientWidth || 300;
    const h = viewport.container.clientHeight || 400;
    viewport.camera.aspect = w / h;
    viewport.camera.updateProjectionMatrix();
    viewport.renderer.setSize(w, h, false);
  }

  _animate = () => {
    requestAnimationFrame(this._animate);
    for (const viewport of [this.data, this.gallery]) {
      viewport.controls.update();
      viewport.renderer.render(viewport.scene, viewport.camera);
    }
  };

  /** Loads the 4 archetypes once, builds morph-capable geometry from them,
   * then builds the baseline/current/projected data figures and the
   * gallery figure from that shared geometry. Must resolve before
   * setComposition()/setGalleryComposite() are called. */
  async load() {
    const perArchetype = await this._loadArchetypeMeshData();
    const meshTemplates = this._buildMorphGeometries(perArchetype);

    for (const [key, style] of Object.entries(STATE_STYLE)) {
      const figure = this._buildFigure(meshTemplates, style);
      this.data.scene.add(figure);
      this.figures[key] = figure;
    }

    this.galleryFigure = this._buildFigure(meshTemplates, GALLERY_STYLE);
    this.gallery.scene.add(this.galleryFigure);
  }

  /** Loads all 4 archetype Collada files and extracts each mesh's
   * world-space baked positions (see bakeWorldPositions). ColladaLoader
   * can't fully resolve this asset's skeleton ("Unable to find root bone
   * of skeleton" in the console), which would make WebGL's per-frame
   * skinning update throw if rendered as a SkinnedMesh — irrelevant here
   * since we only ever read raw geometry positions, never render through
   * the skinning path. */
  async _loadArchetypeMeshData() {
    // Each of the 4 DAE files is ~2.6MB of XML that ColladaLoader has to
    // parse (plus a failed skeleton-resolution attempt — see above), which
    // is slow enough on its own (multiple seconds) that loading them one
    // at a time in sequence made the page look hung. Loading in parallel
    // doesn't remove that per-file cost (parsing is still synchronous, one
    // file's parse still blocks the others from progressing on the same
    // thread) but overlaps the network fetch latency instead of stacking
    // it 4x, and lets the loading label (see main.js) at least paint
    // before the first parse starts.
    // A separate ColladaLoader instance per file, not one shared across the
    // concurrent loads below — ColladaLoader isn't documented as safe for
    // concurrent parses on one instance, and sharing one caused an
    // intermittent hang (page stuck on the loading label indefinitely,
    // reproducible only sometimes) that a fresh instance per file resolved.
    const entries = await Promise.all(
      BODYTYPE_ORDER.map(async (key) => {
        const loader = new ColladaLoader();
        const collada = await loader.loadAsync(BODYTYPE_MODELS[key].url);
        const source = collada.scene;
        source.updateMatrixWorld(true);

        const meshes = [];
        source.traverse((obj) => {
          if (obj.isMesh && obj.geometry) {
            meshes.push({
              name: obj.name,
              geometry: obj.geometry,
              positions: bakeWorldPositions(obj.geometry.attributes.position, obj.matrixWorld),
            });
          }
        });
        return [key, meshes];
      })
    );
    return Object.fromEntries(entries);
  }

  /** Builds one morph-capable BufferGeometry per mesh (body, eyes, ...),
   * using 'normal' as the base and thin/fat/buff as morph targets, plus
   * the fixed floor/recenter offset shared by every figure built from it. */
  _buildMorphGeometries(perArchetype) {
    const normalMeshes = perArchetype.normal;
    const box = new THREE.Box3();
    const posAttr = new THREE.BufferAttribute(normalMeshes[0].positions, 3);
    box.setFromBufferAttribute(posAttr);
    for (let i = 1; i < normalMeshes.length; i++) {
      box.union(new THREE.Box3().setFromBufferAttribute(new THREE.BufferAttribute(perArchetype.normal[i].positions, 3)));
    }
    const center = box.getCenter(new THREE.Vector3());
    const offset = { x: -center.x, y: -box.min.y, z: -center.z };

    const templates = normalMeshes.map((normalMesh, i) => {
      const geometry = normalMesh.geometry.clone();
      geometry.setAttribute('position', new THREE.BufferAttribute(normalMesh.positions, 3));
      geometry.setAttribute('normal', computeNormalsFor(normalMesh.positions));
      geometry.morphAttributes.position = MORPH_KEYS.map((key) => {
        const archetypeMesh = perArchetype[key][i];
        return new THREE.BufferAttribute(archetypeMesh.positions, 3);
      });
      // Normals have to morph alongside positions. Three.js only interpolates
      // the attributes it's given targets for, so with position targets alone
      // a blended figure keeps normal.dae's normals on a body whose shape has
      // moved — the surface is lit as if it were still the average build.
      // That mismatch is invisible on a fully matte material but shows up as
      // faceted patches across the chest and shoulders once the material has
      // any gloss, which is why it only surfaced when specular was turned up.
      geometry.morphAttributes.normal = MORPH_KEYS.map((key) => computeNormalsFor(perArchetype[key][i].positions));
      geometry.computeBoundingSphere();
      return { geometry };
    });

    return { templates, offset };
  }

  /** Builds one figure (a Group of morph-capable meshes, one per source
   * mesh) sharing the geometry built by _buildMorphGeometries, all overlaid
   * at the same position (see STATE_STYLE for how each state stays visible
   * despite that). */
  _buildFigure(meshTemplates, style) {
    const depthTest = style.depthTest !== false;
    const material = new THREE.MeshStandardMaterial({
      color: style.color,
      // Glossy rather than the default fully-matte roughness of 1.0. A matte
      // surface only shows Lambertian falloff, which on a body this evenly
      // lit flattens every muscle boundary out; the specular highlight is
      // what actually traces the curvature and makes definition legible.
      roughness: 0.32,
      metalness: 0,
      transparent: style.opacity < 1,
      opacity: style.opacity,
      depthTest,
      // A layer that skips the depth test shouldn't write depth either —
      // it's meant to always draw regardless of what's already there.
      depthWrite: depthTest,
    });
    const figure = new THREE.Group();
    for (const template of meshTemplates.templates) {
      const mesh = new THREE.Mesh(template.geometry, material);
      mesh.morphTargetInfluences = MORPH_KEYS.map(() => 0);
      mesh.renderOrder = style.renderOrder ?? 0;
      figure.add(mesh);
    }
    figure.position.set(meshTemplates.offset.x, meshTemplates.offset.y, meshTemplates.offset.z);
    return figure;
  }

  _applyMorphWeights(figure, weights) {
    const influences = MORPH_KEYS.map((key) => weights[key] ?? 0);
    figure.traverse((obj) => {
      if (obj.isMesh && obj.morphTargetInfluences) {
        for (let i = 0; i < influences.length; i++) obj.morphTargetInfluences[i] = influences[i];
      }
    });
  }

  /** Blends one of the left viewport's state figures (baseline / current /
   * projected) to a body composition. Takes the same two numbers as
   * setGalleryComposite so both viewports stay in agreement — see
   * archetypeWeights. */
  setComposition(stateKey, musclePct, pbfPercent) {
    const figure = this.figures[stateKey];
    if (!figure) return;
    this._applyMorphWeights(figure, archetypeWeights(musclePct, pbfPercent));
  }

  setVisible(stateKey, visible) {
    if (this.figures[stateKey]) this.figures[stateKey].visible = visible;
  }

  /** Blends the right (explorer) figure to the 體脂/肌肉量率 slider values. */
  setGalleryComposite(musclePct, pbfPercent) {
    if (!this.galleryFigure) return;
    this._applyMorphWeights(this.galleryFigure, archetypeWeights(musclePct, pbfPercent));
  }
}
