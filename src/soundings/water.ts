import * as T from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Site } from './mission';

export function surface(width: number, height: number) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

const seeded = (seed: number) => () => {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
};

// The practice source obeys the same optical path as a decoded Orbis frame.
export class WaterFrame {
  readonly canvas = surface(384, 216);
  readonly texture = new T.CanvasTexture(this.canvas);
  private ctx = this.canvas.getContext('2d', { alpha: false })!;
  private liveVideo: HTMLVideoElement | null = null;
  private frameCallback: number | null = null;
  private presentedTime: number | null = null;
  private enabled = false;
  private random = seeded(4827);
  private snow = Array.from({ length: 850 }, () => ({
    x: this.random(),
    y: this.random(),
    radius: 0.35 + this.random() ** 3 * 3.5,
    speed: 0.008 + this.random() * 0.035,
    light: this.random(),
  }));
  source: 'live' | 'practice' = 'practice';
  mediaTime = 0;
  setVideo(video: HTMLVideoElement | null, live: boolean) {
    this.enabled = live;
    if (this.liveVideo === video) return;
    if (this.frameCallback !== null) this.liveVideo?.cancelVideoFrameCallback?.(this.frameCallback);
    this.frameCallback = null;
    this.presentedTime = null;
    this.liveVideo = video;
    if (video?.requestVideoFrameCallback) {
      const observe: VideoFrameRequestCallback = (_time, metadata) => {
        if (this.liveVideo !== video) return;
        this.presentedTime = metadata.mediaTime;
        this.frameCallback = video.requestVideoFrameCallback(observe);
      };
      this.frameCallback = video.requestVideoFrameCallback(observe);
    }
  }
  sample(t: number, site: Site, dense: boolean) {
    const g = this.ctx,
      w = this.canvas.width,
      h = this.canvas.height,
      video = this.liveVideo;
    if (this.enabled && video && video.readyState >= 2 && video.videoWidth && video.videoHeight) {
      // Store the presented video in one immutable-for-this-render canvas. It feeds BOTH
      // the panorama and the sensor veil, and can be copied verbatim into a grasp record.
      try {
        g.drawImage(video, 0, 0, w, h);
        this.source = 'live';
        this.mediaTime = this.presentedTime ?? video.currentTime;
        this.texture.needsUpdate = true;
        return;
      } catch {
        /* A newly replaced stream can be unready until its first decoded frame. */
      }
    }
    if (this.enabled && this.source === 'live') return;
    this.source = 'practice';
    this.mediaTime = t;
    const gradient = g.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, dense ? '#8da7a2' : site === 'dock' ? '#386a74' : '#345763');
    gradient.addColorStop(0.5, dense ? '#6a877f' : '#1d4854');
    gradient.addColorStop(1, dense ? '#364f50' : '#12333e');
    g.fillStyle = gradient;
    g.fillRect(0, 0, w, h);
    const count = dense ? this.snow.length : 75;
    for (let i = 0; i < count; i++) {
      const p = this.snow[i];
      const x = ((p.x + t * p.speed * 0.34) % 1) * w,
        y = ((p.y + t * p.speed) % 1) * h;
      g.fillStyle = 'rgba(205,229,216,' + (0.28 + 0.69 * p.light) + ')';
      g.beginPath();
      g.arc(x, y, p.radius, 0, 2 * Math.PI);
      g.fill();
    }
    this.texture.needsUpdate = true;
  }
}

export function makeOptics(texture: T.Texture) {
  const material = new T.ShaderMaterial({
    uniforms: {
      water: { value: texture },
      halfFov: { value: new T.Vector2(1, 0.65) },
      lampOrigin: { value: new T.Vector3() },
      lampDirection: { value: new T.Vector3() },
      density: { value: 1 },
    },
    vertexShader: `
      varying vec2 sensorUV;
      void main() { sensorUV=uv; gl_Position=vec4(position.xy,0.,1.); }
    `,
    fragmentShader: `
      uniform sampler2D water;
      uniform vec2 halfFov;
      uniform vec3 lampOrigin,lampDirection;
      uniform float density;
      varying vec2 sensorUV;
      float luminance(vec2 p) { return dot(texture2D(water,clamp(p,.002,.998)).rgb,vec3(.25,.62,.13)); }
      void main() {
        vec3 ray=normalize(vec3((sensorUV*2.-1.)*halfFov,-1.));
        // Model near-camera backscatter by integrating along the actual viewing ray.
        // More distant intersections scatter less light back into the camera.
        float overlap=0.;
        for(int i=0;i<8;i++){
          float d=.058+float(i)*.031;
          vec3 delta=ray*d-lampOrigin;
          float direction=dot(normalize(delta),lampDirection);
          float cone=smoothstep(.84,.94,direction);
          overlap+=cone*exp(-d*10.);
        }
        vec2 p=.04+sensorUV*.92;
        float value=luminance(p);
        vec2 off=vec2(.011,.017);
        float neighborhood=.25*(luminance(p+off)+luminance(p-off)+luminance(p+vec2(-off.x,off.y))+luminance(p+vec2(off.x,-off.y)));
        float detail=max(value-neighborhood,0.);
        // Integrated scattered light replaces target contrast as optical depth rises.
        // Local haze and bright particle detail are both measured in the input raster.
        float haze=smoothstep(.16,.60,neighborhood);
        float tau=overlap*density*(.04+3.4*haze+6.*detail);
        float veil=1.-exp(-tau);
        gl_FragColor=vec4(mix(vec3(.38,.55,.54),vec3(.91,.93,.80),smoothstep(.04,.5,detail+value*.2)),veil);
        #include <colorspace_fragment>
      }
    `,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    toneMapped: false,
  });
  const veil = new T.Mesh(new T.PlaneGeometry(2, 2), material);
  veil.frustumCulled = false;
  veil.renderOrder = 1000;
  veil.layers.set(4);
  return veil;
}

export function makeOcean(texture: T.Texture) {
  const group = new T.Group();
  const rng = seeded(440);
  const dome = new T.ShaderMaterial({
    side: T.BackSide,
    depthWrite: false,
    uniforms: { water: { value: texture }, isLive: { value: 0 } },
    vertexShader: `varying vec3 direction;void main(){ direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      uniform sampler2D water;uniform float isLive;varying vec3 direction;
      void main(){
        vec3 d=normalize(direction);
        float height=clamp(d.y*.9+.39,0.,1.);
        float sun=max(0.,dot(d,normalize(vec3(-.4,.8,.17))));
        float azimuth=atan(d.x,d.z)/6.2831853+.5;
        vec3 base=mix(vec3(.009,.061,.084),vec3(.095,.31,.32),pow(height,1.3));
        base+=vec3(.04,.10,.083)*pow(sun,14.);
        float streak=.5+.5*sin(azimuth*114.+sin(azimuth*67.))*sin(azimuth*39.+1.);
        base+=vec3(.011,.033,.03)*streak*height;
        vec3 liveColor=texture2D(water,vec2(azimuth,clamp(.56+d.y*.6,0.,1.))).rgb;
        gl_FragColor=vec4(mix(base,base*.5+liveColor*.55,isLive),1.);
        #include <colorspace_fragment>
      }
    `,
  });
  const sky = new T.Mesh(new T.SphereGeometry(14, 48, 24), dome);
  sky.renderOrder = -10;
  group.add(sky);
  const rground = new T.PlaneGeometry(17, 17, 88, 88);
  rground.rotateX(-Math.PI / 2);
  const position = rground.getAttribute('position'),
    colors = [],
    c = new T.Color();
  const seabed = (x: number, z: number) => {
    const dist = Math.sqrt(x * x + (z + 1) * (z + 1));
    const beyond = T.MathUtils.smoothstep(dist, 1.8, 5.6);
    return (
      0.46 +
      0.014 * Math.sin(x * 8 - z * 5) +
      0.018 * Math.cos(z * 10) +
      beyond *
        (0.62 +
          0.4 * Math.sin(x * 1.85 + z * 0.55) +
          0.48 * Math.sin(z * 1.35 - x * 1.24) +
          0.26 * Math.cos(z * 3 + x))
    );
  };
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i),
      z = position.getZ(i);
    position.setY(i, seabed(x, z));
    const n = 0.5 + 0.5 * Math.sin(x * 25 + z * 13 + Math.sin(z * 17) * 0.85);
    c.setRGB(0.055 + n * 0.029, 0.115 + n * 0.029, 0.115 + n * 0.029).multiplyScalar(0.76 + 0.23 * rng());
    colors.push(c.r, c.g, c.b);
  }
  rground.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  rground.computeVertexNormals();
  // One repeating sand-grain bump and albedo tile gives the bottom texture at pickup scale.
  const grain = surface(256, 256),
    gr = grain.getContext('2d')!,
    image = gr.createImageData(256, 256);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      const value =
        156 +
        rng() * 53 +
        15 * Math.sin(y * 0.197 + 1.12 * Math.sin(x * 0.074)) +
        6 * Math.sin(x * 0.147 + y * 0.123);
      image.data[i] = value;
      image.data[i + 1] = value + 6;
      image.data[i + 2] = value + 3;
      image.data[i + 3] = 255;
    }
  gr.putImageData(image, 0, 0);
  const sand = new T.CanvasTexture(grain);
  sand.wrapS = sand.wrapT = T.RepeatWrapping;
  sand.repeat.set(30, 30);
  group.add(
    new T.Mesh(
      rground,
      new T.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.99,
        map: sand,
        bumpMap: sand,
        bumpScale: 0.008,
      }),
    ),
  );
  const rawRock = new T.IcosahedronGeometry(1, 3);
  rawRock.deleteAttribute('normal');
  rawRock.deleteAttribute('uv');
  const rockGeo = mergeVertices(rawRock);
  rawRock.dispose();
  const rp = rockGeo.getAttribute('position'),
    rc = [];
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i),
      y = rp.getY(i),
      z = rp.getZ(i);
    const strata = Math.sin(y * 15 + Math.sin(x * 3) * 1.2 + z * 0.7);
    const relief = 0.88 + 0.11 * Math.sin(x * 3.8 + z * 2.1) * Math.cos(y * 3.7) + 0.05 * strata;
    rp.setXYZ(i, x * relief, y * (relief + 0.12 * x) + 0.1 * x, z * relief);
    const value = 0.72 + 0.13 * strata + 0.12 * Math.sin(x * 9 + y * 7 + z * 4);
    rc.push(value, value * 1.02, value);
  }
  rockGeo.setAttribute('color', new T.Float32BufferAttribute(rc, 3));
  rockGeo.computeVertexNormals();
  const rocks = new T.InstancedMesh(
    rockGeo,
    new T.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.97 }),
    138,
  );
  const o = new T.Object3D();
  for (let i = 0; i < rocks.count; i++) {
    const angle = rng() * Math.PI * 2,
      radius = 0.95 + 6 * rng() ** 1.25;
    const x = Math.cos(angle) * radius,
      z = Math.sin(angle) * radius - 1,
      s = (0.045 + rng() ** 2 * 0.28) * Math.min(1.65, radius * 0.68);
    o.position.set(x, seabed(x, z) - s * 0.13, z);
    o.scale.set(s * (1.45 + rng()), s * (0.62 + rng()), s * (0.7 + rng()));
    o.rotation.set(rng() * 1.3, rng() * 5, rng() * 0.5);
    o.updateMatrix();
    rocks.setMatrixAt(i, o.matrix);
    c.setRGB(0.082 + 0.033 * rng(), 0.14 + 0.026 * rng(), 0.15 + 0.022 * rng());
    rocks.setColorAt(i, c);
  }
  group.add(rocks);
  // Small colonies of tubular sponges provide nearby scale on the sediment.
  const sponges = new T.InstancedMesh(
    new T.CylinderGeometry(0.5, 0.27, 1, 8, 1, true),
    new T.MeshStandardMaterial({ color: 0xffffff, side: T.DoubleSide, roughness: 1 }),
    125,
  );
  for (let i = 0; i < sponges.count; i++) {
    const colony = Math.floor(i / 5),
      phase = colony * 2.4;
    const x = Math.sin(phase) * (1 + colony * 0.071) + rng() * 0.13,
      z = -0.8 + Math.cos(phase) * (1 + colony * 0.071) + rng() * 0.13;
    const size = 0.015 + 0.025 * rng(),
      height = 0.05 + 0.11 * rng();
    o.position.set(x, seabed(x, z) + height * 0.44, z);
    o.scale.set(size, height, size);
    o.rotation.set(rng() * 0.28, 0, rng() * 0.5 - 0.25);
    o.updateMatrix();
    sponges.setMatrixAt(i, o.matrix);
    c.setRGB(0.27 + rng() * 0.12, 0.17 + rng() * 0.05, 0.11 + rng() * 0.04);
    sponges.setColorAt(i, c);
  }
  group.add(sponges);
  // Erect branching sea fans mark the sides of the working area without crossing the camera path.
  const branches: { start: T.Vector3; end: T.Vector3; radius: number }[] = [];
  for (let i = 0; i < 12; i++) {
    const angle = i * 2.4;
    const x = Math.cos(angle) * (1.15 + rng() * 1.6),
      z = -1 + Math.sin(angle) * (1.1 + rng() * 1.55);
    const base = new T.Vector3(x, seabed(x, z), z);
    const spread = new T.Vector3(Math.cos(angle + 0.9), 0, Math.sin(angle + 0.9));
    const stem = 0.13 + rng() * 0.16;
    for (let j = -2; j <= 2; j++) {
      const elbow = base.clone().addScaledVector(spread, j * stem * 0.33);
      elbow.y += stem * (0.9 - Math.abs(j) * 0.1);
      branches.push({ start: base, end: elbow, radius: 0.0045 });
      for (const sign of [-1, 1]) {
        const tip = elbow.clone().addScaledVector(spread, sign * stem * 0.17 + j * stem * 0.13);
        tip.y += stem * (0.25 + rng() * 0.27);
        branches.push({ start: elbow, end: tip, radius: 0.0027 });
      }
    }
  }
  const coral = new T.InstancedMesh(
    new T.CylinderGeometry(0.6, 1, 1, 5),
    new T.MeshStandardMaterial({ color: 0xbb714e, roughness: 0.93 }),
    branches.length,
  );
  const up = new T.Vector3(0, 1, 0);
  branches.forEach(({ start, end, radius }, i) => {
    const delta = end.clone().sub(start);
    o.position.copy(start).addScaledVector(delta, 0.5);
    o.scale.set(radius, delta.length(), radius);
    o.quaternion.setFromUnitVectors(up, delta.normalize());
    o.updateMatrix();
    coral.setMatrixAt(i, o.matrix);
  });
  group.add(coral);
  // Contact shading anchors the pressure hull, cage and cradle to the instrument site.
  const shade = surface(128, 128),
    sg = shade.getContext('2d')!;
  const gradient = sg.createRadialGradient(64, 64, 3, 64, 64, 63);
  gradient.addColorStop(0, 'rgba(8,22,25,.66)');
  gradient.addColorStop(0.62, 'rgba(8,22,25,.32)');
  gradient.addColorStop(1, 'rgba(8,22,25,0)');
  sg.fillStyle = gradient;
  sg.fillRect(0, 0, 128, 128);
  const sh = new T.MeshBasicMaterial({ map: new T.CanvasTexture(shade), transparent: true, depthWrite: false });
  const contact = new T.Mesh(new T.PlaneGeometry(1.21, 0.86), sh);
  contact.rotation.x = -Math.PI / 2;
  contact.position.set(0, 0.488, -1.24);
  group.add(contact);
  return { group, dome };
}
