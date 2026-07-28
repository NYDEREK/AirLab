import { useEffect, useRef } from "react";
import {
  ACESFilmicToneMapping,
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
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
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
  const controlsRef = useRef<OrbitControls | null>(null);
  const gridRef = useRef<GridHelper | null>(null);
  const groundRef = useRef<Mesh | null>(null);

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
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFShadowMap;
    renderer.setClearColor(new Color("#ffffff"), 0);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = false;
    controls.minDistance = 28;
    controls.maxDistance = 600;
    controlsRef.current = controls;

    scene.add(new AmbientLight("#ffffff", 0.68));
    scene.add(new HemisphereLight("#ffffff", "#c9d0c6", 0.9));
    const key = new DirectionalLight("#ffffff", 1.55);
    key.position.set(65, 90, 75);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 5;
    key.shadow.bias = -0.0003;
    key.shadow.camera.left = -140;
    key.shadow.camera.right = 140;
    key.shadow.camera.top = 140;
    key.shadow.camera.bottom = -140;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 350;
    scene.add(key);
    const rim = new DirectionalLight("#ffffff", 0.62);
    rim.position.set(-80, 20, -55);
    scene.add(rim);
    const fill = new DirectionalLight("#ffffff", 0.52);
    fill.position.set(15, -70, 80);
    scene.add(fill);
    const back = new DirectionalLight("#eef1f5", 0.48);
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
    gridRef.current = grid;

    const ground = new Mesh(
      new PlaneGeometry(360, 360),
      new ShadowMaterial({ color: "#535950", opacity: 0.17 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -42.2;
    ground.receiveShadow = true;
    scene.add(ground);
    groundRef.current = ground;

    const group = new Group();
    scene.add(group);
    groupRef.current = group;

    const resize = () => {
      const { clientWidth, clientHeight } = container;
      renderer.setSize(clientWidth, clientHeight);
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
      controlsRef.current = null;
      gridRef.current = null;
      groundRef.current = null;
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
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const material = new MeshStandardMaterial({
      color: accentColor,
      roughness: 0.86,
      metalness: 0,
      side: DoubleSide,
    });
    const mesh = new Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);

    const radius = geometry.boundingSphere?.radius ?? 36;
    const center =
      geometry.boundingBox?.getCenter(new Vector3()) ?? new Vector3();
    const floorY = (geometry.boundingBox?.min.y ?? -radius) - radius * 0.08;
    if (gridRef.current) gridRef.current.position.y = floorY;
    if (groundRef.current) groundRef.current.position.y = floorY - radius * 0.002;
    const camera = cameraRef.current;
    if (camera) {
      const distance = Math.max(48, radius * 4.1);
      const direction = new Vector3(0.66, 0.48, 0.76).normalize();
      camera.position.copy(center).add(direction.multiplyScalar(distance));
      camera.lookAt(center);
      if (controlsRef.current) {
        controlsRef.current.target.copy(center);
        controlsRef.current.update();
      }
    }
  }, [accentColor, ball]);

  return <div className="viewport-canvas" ref={containerRef} />;
}
