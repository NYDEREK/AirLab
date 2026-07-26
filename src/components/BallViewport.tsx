import { useEffect, useRef } from "react";
import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  DoubleSide,
  GridHelper,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { GeneratedBall } from "../geometry/types";

interface BallViewportProps {
  ball: GeneratedBall | null;
  accentColor: string;
}

export function BallViewport({ ball, accentColor }: BallViewportProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<Group | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new Scene();
    const camera = new PerspectiveCamera(35, 1, 0.1, 2_000);
    camera.position.set(84, 58, 92);
    cameraRef.current = camera;

    const renderer = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.setClearColor(new Color("#ffffff"), 0);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 28;
    controls.maxDistance = 600;

    scene.add(new AmbientLight("#ffffff", 1.05));
    scene.add(new HemisphereLight("#ffffff", "#d9ddd5", 0.8));
    const key = new DirectionalLight("#ffffff", 0.55);
    key.position.set(65, 90, 75);
    scene.add(key);
    const rim = new DirectionalLight("#ffffff", 0.48);
    rim.position.set(-80, 20, -55);
    scene.add(rim);
    const fill = new DirectionalLight("#ffffff", 0.44);
    fill.position.set(15, -70, 80);
    scene.add(fill);
    const back = new DirectionalLight("#eef1f5", 0.4);
    back.position.set(45, 20, -90);
    scene.add(back);

    const grid = new GridHelper(220, 22, "#c2c8bd", "#dfe3dc");
    grid.position.y = -42;
    const gridMaterials = Array.isArray(grid.material)
      ? grid.material
      : [grid.material];
    gridMaterials.forEach((material) => {
      material.opacity = 0.62;
      material.transparent = true;
    });
    scene.add(grid);

    const group = new Group();
    group.rotation.x = -0.08;
    group.rotation.y = 0.2;
    scene.add(group);
    groupRef.current = group;

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      renderer.setSize(clientWidth, clientHeight, false);
      camera.aspect = clientWidth / Math.max(1, clientHeight);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    let animationFrame = 0;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      groupRef.current = null;
      rendererRef.current = null;
      cameraRef.current = null;
    };
  }, []);

  useEffect(() => {
    const group = groupRef.current;
    if (!group || !ball) return;

    group.children.forEach((child) => {
      if (child instanceof Mesh) {
        child.geometry.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((material) => material.dispose());
        } else {
          child.material.dispose();
        }
      }
    });
    group.clear();

    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(ball.previewPositions, 3),
    );
    geometry.setAttribute(
      "normal",
      new BufferAttribute(ball.previewNormals, 3),
    );
    geometry.setIndex(new BufferAttribute(ball.previewIndices, 1));
    geometry.computeBoundingSphere();

    const material = new MeshStandardMaterial({
      color: accentColor,
      roughness: 0.86,
      metalness: 0,
      side: DoubleSide,
    });
    const mesh = new Mesh(geometry, material);
    group.add(mesh);

    const radius = geometry.boundingSphere?.radius ?? 36;
    const camera = cameraRef.current;
    if (camera) {
      const distance = Math.max(48, radius * 4.1);
      const direction = new Vector3(0.66, 0.48, 0.76).normalize();
      camera.position.copy(direction.multiplyScalar(distance));
      camera.lookAt(0, 0, 0);
    }
  }, [accentColor, ball]);

  return <div className="viewport-canvas" ref={containerRef} />;
}
