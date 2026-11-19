import { useEffect, useMemo, useState } from 'react'
import { Button, Dialog, Select } from '../../components/ui'
import { useFilmStudyStore } from '../../stores/film-study'
import { useLibraryStore } from '../../stores/library'

const ROW = 'flex items-center gap-3 py-1'
const NAME = 'min-w-0 flex-1 truncate text-xs text-fg'
const ROLE = 'ml-1.5 text-[11px] text-fg-subtle'

export function RemakeMappingDialog() {
  const remake = useFilmStudyStore((state) => state.remake)
  const confirmRemake = useFilmStudyStore((state) => state.confirmRemake)
  const cancelRemake = useFilmStudyStore((state) => state.cancelRemake)
  const characters = useLibraryStore((state) => state.characters)
  const allAssets = useLibraryStore((state) => state.allAssets)
  const [choices, setChoices] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!remake) return
    const next: Record<string, string> = {}
    for (const item of remake.study.cast ?? []) {
      next[`cast:${item.id}`] = 'original'
    }
    for (const scene of remake.study.scenes ?? []) {
      next[`scene:${scene.id}`] = 'original'
    }
    setChoices(next)
  }, [remake])

  const sceneAssets = useMemo(
    () =>
      allAssets.filter(
        (asset) =>
          asset.kind === 'image' && asset.path.startsWith('场景/')
      ),
    [allAssets]
  )

  const castOptions = useMemo(() => {
    const base = [
      { value: 'original', label: '保持原片' },
      { value: 'new', label: '新建空白节点' }
    ]
    const assets = characters.flatMap((card) => {
      const path = card.avatarPath ?? card.referencePaths[0]
      return path
        ? [{ value: `asset:${path}`, label: `资产 · ${card.name}` }]
        : []
    })
    return [...base, ...assets]
  }, [characters])

  const sceneOptions = useMemo(
    () => [
      { value: 'original', label: '保持原片' },
      ...sceneAssets.map((asset) => ({
        value: `asset:${asset.path}`,
        label: `资产 · ${asset.name}`
      }))
    ],
    [sceneAssets]
  )

  if (!remake) return null

  const cast = remake.study.cast ?? []
  const scenes = remake.study.scenes ?? []

  return (
    <Dialog
      open
      onClose={cancelRemake}
      title="复刻 · 选角与选景"
      description="原片角色和场景默认保留；也可以换成资产库里的资产，或新建一个空白节点后续生成。"
      size="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={cancelRemake}>
            取消
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void confirmRemake(choices)}
          >
            开始复刻
          </Button>
        </div>
      }
    >
      <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
        <section>
          <h3 className="mb-1.5 text-[11px] font-semibold text-fg-subtle">
            角色
          </h3>
          {cast.length === 0 ? (
            <p className="text-xs text-fg-subtle">没有识别到角色，直接复刻。</p>
          ) : (
            <div className="divide-y divide-divider">
              {cast.map((item) => (
                <div key={item.id} className={ROW}>
                  <span className={NAME} title={item.appearance}>
                    {item.name}
                    {item.role ? <span className={ROLE}>{item.role}</span> : null}
                  </span>
                  <Select
                    value={choices[`cast:${item.id}`] ?? 'original'}
                    options={castOptions}
                    onChange={(value) =>
                      setChoices((prev) => ({
                        ...prev,
                        [`cast:${item.id}`]: value
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h3 className="mb-1.5 text-[11px] font-semibold text-fg-subtle">
            场景
          </h3>
          {scenes.length === 0 ? (
            <p className="text-xs text-fg-subtle">没有识别到场景，直接复刻。</p>
          ) : (
            <div className="divide-y divide-divider">
              {scenes.map((scene) => (
                <div key={scene.id} className={ROW}>
                  <span className={NAME} title={scene.location}>
                    {scene.id} · {scene.name}
                  </span>
                  <Select
                    value={choices[`scene:${scene.id}`] ?? 'original'}
                    options={sceneOptions}
                    onChange={(value) =>
                      setChoices((prev) => ({
                        ...prev,
                        [`scene:${scene.id}`]: value
                      }))
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Dialog>
  )
}
