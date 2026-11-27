import * as THREE from 'three'

export interface StageGround {
  mesh: THREE.Mesh
  setCameraPosition(position: THREE.Vector3): void
  setBackground(color: THREE.ColorRepresentation): void
  dispose(): void
}

/**
 * 无边界地面：平面跟随相机，网格线由世界坐标在 fragment shader 里生成。
 * 相机不会走到平面边缘，网格也不会随相机滑动，视觉上等价于无限地面。
 */
export function createStageGround(
  background: THREE.ColorRepresentation
): StageGround {
  const size = 2400
  const geometry = new THREE.PlaneGeometry(size, size)
  geometry.rotateX(-Math.PI / 2)

  const uniforms = {
    uBaseColor: { value: new THREE.Color(0x242428) },
    uLineColor: { value: new THREE.Color(0x3d3d45) },
    uMajorColor: { value: new THREE.Color(0x6a6a74) },
    uFogColor: { value: new THREE.Color(background) },
    uCameraPosition: { value: new THREE.Vector3() }
  }

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 uBaseColor;
      uniform vec3 uLineColor;
      uniform vec3 uMajorColor;
      uniform vec3 uFogColor;
      uniform vec3 uCameraPosition;
      varying vec3 vWorldPosition;

      float gridAlpha(vec2 coord) {
        vec2 width = max(fwidth(coord), vec2(0.00001));
        vec2 grid = abs(fract(coord - 0.5) - 0.5) / width;
        return 1.0 - min(min(grid.x, grid.y), 1.0);
      }

      void main() {
        vec2 coord = vWorldPosition.xz;
        float minor = gridAlpha(coord);
        float major = gridAlpha(coord / 10.0);
        vec3 color = mix(uBaseColor, uLineColor, minor * 0.6);
        color = mix(color, uMajorColor, major * 0.9);
        float distanceToCamera = distance(vWorldPosition.xz, uCameraPosition.xz);
        float fog = smoothstep(70.0, 260.0, distanceToCamera);
        gl_FragColor = vec4(mix(color, uFogColor, fog), 1.0);
      }
    `,
    side: THREE.DoubleSide
  })

  const mesh = new THREE.Mesh(geometry, material)
  mesh.position.y = -0.01
  mesh.renderOrder = -1

  return {
    mesh,
    setCameraPosition(position: THREE.Vector3): void {
      // 平面始终覆盖相机周围；世界坐标不变，所以网格线固定在世界里。
      mesh.position.x = position.x
      mesh.position.z = position.z
      uniforms.uCameraPosition.value.copy(position)
    },
    setBackground(color: THREE.ColorRepresentation): void {
      uniforms.uFogColor.value.set(color)
    },
    dispose(): void {
      geometry.dispose()
      material.dispose()
    }
  }
}
