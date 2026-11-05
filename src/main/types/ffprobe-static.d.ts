declare module 'ffprobe-static' {
  interface FfprobeStatic {
    path: string
    version: string
    url: string
  }

  const ffprobe: FfprobeStatic
  export default ffprobe
}
