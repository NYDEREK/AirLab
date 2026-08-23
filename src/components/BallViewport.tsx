import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
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

export interface BallViewportHandle {
  captureThumbnail: () => string | null;
}

const THUMBNAIL_WIDTH = 480;
const THUMBNAIL_HEIGHT = 300;

export const BallViewport = forwardRef<BallViewportHandle, BallViewportProps>(
function BallViewport({ ball, accentColor }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<Group | null>(null);
  const rendererRef = useRef<WebGLRenderer | null>(null);
  const sceneRef = useRef<Scene | null>(null);
  const cameraRef = useRef<PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const gridRef = useRef<GridHelper | null>(null);
  const groundRef = useRef<Mesh | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new Scene();
    sceneRef.current = scene;
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
    renderer.toneMappingExposure = 0.98;
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

    scene.add(new AmbientLight("#ffffff", 0.3));
    scene.add(new HemisphereLight("#f7f8f5", "#8d958b", 0.7));
    const key = new DirectionalLight("#fffdf8", 1.42);
    key.position.set(65, 90, 75);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 4;
    key.shadow.bias = -0.0003;
    key.shadow.camera.left = -140;
    key.shadow.camera.right = 140;
    key.shadow.camera.top = 140;
    key.shadow.camera.bottom = -140;
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 350;
    scene.add(key);
    const fill = new DirectionalLight("#e5ebef", 0.36);
    fill.position.set(-65, 35, 45);
    scene.add(fill);
    const back = new DirectionalLight("#f4eee5", 0.2);
    back.position.set(-25, 30, -85);
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
      sceneRef.current = null;
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

    const bodyColor = ball.color || accentColor;
    const materialColors =
      ball.colorMode === "single"
        ? [bodyColor, bodyColor, bodyColor]
        : [
            bodyColor,
            ball.detailColor ?? "#f2f1ea",
            ball.markingColor ?? "#20231f",
          ];
    const materials = materialColors.map(
      (color) =>
        new MeshStandardMaterial({
          color,
          roughness: 0.86,
          metalness: 0,
          side: DoubleSide,
        }),
    );
    const triangleMaterials = ball.previewTriangleMaterials;
    if (
      triangleMaterials &&
      triangleMaterials.length === ball.previewIndices.length / 3
    ) {
      let runStart = 0;
      let runMaterial = triangleMaterials[0] ?? 0;
      for (
        let triangle = 1;
        triangle <= triangleMaterials.length;
        triangle += 1
      ) {
        const nextMaterial = triangleMaterials[triangle];
        if (
          triangle < triangleMaterials.length &&
          nextMaterial === runMaterial
        ) {
          continue;
        }
        geometry.addGroup(
          runStart * 3,
          (triangle - runStart) * 3,
          Math.max(0, Math.min(2, runMaterial)),
        );
        runStart = triangle;
        runMaterial = nextMaterial ?? 0;
      }
    } else {
      geometry.addGroup(0, ball.previewIndices.length, 0);
    }
    const mesh = new Mesh(geometry, materials);
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

  useImperativeHandle(ref, () => ({
    captureThumbnail: () => {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const group = groupRef.current;
      if (!renderer || !scene || !camera || !group?.children.length) return null;

      renderer.render(scene, camera);
      const source = renderer.domElement;
      if (!source.width || !source.height) return null;

      const thumbnail = document.createElement("canvas");
      thumbnail.width = THUMBNAIL_WIDTH;
      thumbnail.height = THUMBNAIL_HEIGHT;
      const context = thumbnail.getContext("2d");
      if (!context) return null;

      context.fillStyle = "#f7f8f4";
      context.fillRect(0, 0, THUMBNAIL_WIDTH, THUMBNAIL_HEIGHT);

      const scale = Math.min(
        THUMBNAIL_WIDTH / source.width,
        THUMBNAIL_HEIGHT / source.height,
      );
      const drawWidth = source.width * scale;
      const drawHeight = source.height * scale;
      const drawX = (THUMBNAIL_WIDTH - drawWidth) / 2;
      const drawY = (THUMBNAIL_HEIGHT - drawHeight) / 2;

      context.drawImage(
        source,
        drawX,
        drawY,
        drawWidth,
        drawHeight,
      );
      return thumbnail.toDataURL("image/webp", 0.82);
    },
  }), []);

  return <div className="viewport-canvas" ref={containerRef} />;
});
