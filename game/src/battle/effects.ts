// 戦場の砂煙。騎兵が駆けたときや、部隊がぶつかったときに立ちのぼる。
// 数を決めた入れ物を使い回すので、メモリは増えない。
import * as THREE from "three";

const MAX_PUFFS = 180;

export class DustFx {
  readonly points: THREE.Points;
  private readonly position = new Float32Array(MAX_PUFFS * 3);
  /** 各粒の、大きさと濃さ */
  private readonly look = new Float32Array(MAX_PUFFS * 2);
  private readonly age = new Float32Array(MAX_PUFFS).fill(99);
  private readonly life = new Float32Array(MAX_PUFFS).fill(1);
  private readonly drift = new Float32Array(MAX_PUFFS * 2);
  private next = 0;

  constructor() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(this.position, 3));
    geometry.setAttribute("look", new THREE.BufferAttribute(this.look, 2));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 400 } },
      vertexShader: `
        attribute vec2 look; uniform float uScale; varying float vAlpha;
        void main() {
          vec4 mv = modelViewMatrix * vec4( position, 1.0 );
          gl_Position = projectionMatrix * mv;
          gl_PointSize = look.x * uScale / max( 1.0, -mv.z );
          vAlpha = look.y;
        }`,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          float d = length( gl_PointCoord - 0.5 );
          float a = smoothstep( 0.5, 0.1, d ) * vAlpha;
          if ( a < 0.01 ) discard;
          gl_FragColor = vec4( 0.74, 0.66, 0.5, a );
        }`,
    });
    this.points = new THREE.Points(geometry, material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  /** 画面の高さ(ピクセル)に合わせて、粒の見かけの大きさを決める */
  setViewportHeight(height: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value = height * 1.2;
  }

  /** (x, y, z) に、count 個の砂煙を出す */
  spawn(x: number, y: number, z: number, count: number, spread: number): void {
    for (let i = 0; i < count; i++) {
      const k = this.next;
      this.next = (this.next + 1) % MAX_PUFFS;
      this.position.set([x + (Math.random() - 0.5) * spread, y + 0.4, z + (Math.random() - 0.5) * spread], k * 3);
      this.age[k] = 0;
      this.life[k] = 1.6 + Math.random() * 1.4;
      this.drift.set([(Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2], k * 2);
    }
  }

  /** 砂煙を、ゆっくり立ちのぼらせながら広げて消す */
  update(dt: number): void {
    for (let k = 0; k < MAX_PUFFS; k++) {
      if (this.age[k] >= this.life[k]) {
        this.look[k * 2 + 1] = 0;
        continue;
      }
      this.age[k] += dt;
      const t = this.age[k] / this.life[k];
      this.position[k * 3] += this.drift[k * 2] * dt;
      this.position[k * 3 + 1] += 1.1 * dt;
      this.position[k * 3 + 2] += this.drift[k * 2 + 1] * dt;
      this.look[k * 2] = 3 + t * 9;
      this.look[k * 2 + 1] = 0.42 * (1 - t) * Math.min(1, t * 8);
    }
    this.points.geometry.getAttribute("position").needsUpdate = true;
    this.points.geometry.getAttribute("look").needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
