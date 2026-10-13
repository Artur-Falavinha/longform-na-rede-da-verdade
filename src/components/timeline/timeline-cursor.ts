import {
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  RingGeometry,
  Scene,
  WebGLRenderer,
  DoubleSide,
} from "three";

export function createTimelineCursor(rail: HTMLElement) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("webgl2", { alpha: true, antialias: true });
  if (!context) return;
  const renderer = new WebGLRenderer({
    canvas,
    context,
    alpha: true,
    antialias: true,
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(36, 36);
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "absolute",
    left: "50%",
    transform: "translate(-50%, -50%)",
    pointerEvents: "none",
  });
  const scene = new Scene();
  const camera = new OrthographicCamera(-18, 18, 18, -18, 0.1, 10);
  camera.position.z = 5;
  const geometry = new RingGeometry(10, 10.8, 48);
  const material = new MeshBasicMaterial({
    color: 0xff6b64,
    transparent: true,
    opacity: 0.65,
    side: DoubleSide,
  });
  const ring = new Mesh(geometry, material);
  scene.add(ring);
  rail.append(canvas);
  return {
    update(progress: number) {
      canvas.style.top = `${progress * 100}%`;
      const visible = rail.getBoundingClientRect();
      canvas.hidden =
        progress <= 0 ||
        progress >= 1 ||
        visible.bottom < 0 ||
        visible.top > innerHeight;
      if (canvas.hidden) return;
      ring.rotation.y = Math.sin(progress * Math.PI * 6) * 0.45;
      renderer.render(scene, camera);
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      canvas.remove();
    },
  };
}
