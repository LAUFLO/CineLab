import type { StageObject, StageVec3 } from '@shared/stage-schema'
import { useStageStore } from './stageStore'

const TYPE_LABEL: Record<StageObject['type'], string> = {
  human: '人物',
  box: '立方体',
  sphere: '球体',
  plane: '平面',
  gltf: '模型',
  crowd: '群众'
}

function vec(value: StageVec3): string {
  return value.map((item) => item.toFixed(2)).join(', ')
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="stage-inspector__row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

export function StageInspector() {
  const doc = useStageStore((state) => state.doc)
  const selectedObjectId = useStageStore((state) => state.selectedObjectId)
  const selectedCameraId = useStageStore((state) => state.selectedCameraId)
  const selectCamera = useStageStore((state) => state.selectCamera)

  if (!doc) return null

  const object = doc.objects.find((item) => item.id === selectedObjectId)
  if (object) {
    return (
      <section className="stage-inspector">
        <header className="stage-inspector__head">
          <span>对象</span>
          <strong>{object.name}</strong>
        </header>
        <Row label="类型" value={TYPE_LABEL[object.type]} />
        <Row label="位置" value={vec(object.transform.position)} />
        <Row label="旋转" value={vec(object.transform.rotation)} />
        <Row label="缩放" value={vec(object.transform.scale)} />
        {object.pose ? <Row label="姿势" value={object.pose} /> : null}
        {object.count ? <Row label="数量" value={String(object.count)} /> : null}
        <p className="stage-inspector__hint">
          属性编辑与拖拽变换将在下一阶段接入。
        </p>
      </section>
    )
  }

  const camera = doc.cameras.find((item) => item.id === selectedCameraId)
  if (camera) {
    return (
      <section className="stage-inspector">
        <header className="stage-inspector__head">
          <span>机位</span>
          <strong>{camera.name}</strong>
        </header>
        <Row label="位置" value={vec(camera.position)} />
        <Row label="注视点" value={vec(camera.target)} />
        <Row label="FOV" value={`${camera.fov}°`} />
        {camera.aspect ? <Row label="画幅" value={camera.aspect} /> : null}
        <button
          type="button"
          className="stage-inspector__action"
          onClick={() => selectCamera(camera.id)}
        >
          切换到此机位
        </button>
      </section>
    )
  }

  return (
    <section className="stage-inspector">
      <header className="stage-inspector__head">
        <span>场景</span>
        <strong>{doc.name}</strong>
      </header>
      <Row label="对象" value={`${doc.objects.length}`} />
      <Row label="机位" value={`${doc.cameras.length}`} />
      <Row label="镜头" value={`${doc.shots.length}`} />
      <Row label="背景" value={doc.background.kind} />
      <p className="stage-inspector__hint">
        点击视口中的对象或机位查看属性。
      </p>
    </section>
  )
}
