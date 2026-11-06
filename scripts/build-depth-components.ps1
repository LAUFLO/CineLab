param(
  [string]$OutputDir = "",
  [string]$PythonVersion = "3.11.9",
  [string]$ModelPath = "C:\Users\Administrator\AppData\Local\Temp\opencode\depth-test\video_depth_anything_vits.pth",
  [int]$Port = 8899
)

$ErrorActionPreference = 'Stop'

$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if (-not $OutputDir) {
  $OutputDir = Join-Path $repo "build\components"
}

$build = Join-Path $env:TEMP "cinelab-depth-build"
$runtime = Join-Path $build "runtime"
$pythonDir = Join-Path $runtime "python"

New-Item -ItemType Directory -Force -Path $build | Out-Null
New-Item -ItemType Directory -Force -Path $runtime | Out-Null
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

# 1. Python embeddable
$pyZip = Join-Path $build "python-$PythonVersion-embed-amd64.zip"
if (-not (Test-Path $pyZip)) {
  Write-Output "downloading python $PythonVersion"
  curl.exe -L --fail --retry 3 -o $pyZip "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
}
if (-not (Test-Path (Join-Path $pythonDir "python.exe"))) {
  Write-Output "extracting python"
  Expand-Archive -Path $pyZip -DestinationPath $pythonDir -Force
}

# 2. enable site-packages
$pth = Join-Path $pythonDir "python311._pth"
$lines = Get-Content -Path $pth
if ($lines -notcontains "Lib\site-packages") {
  $lines = @($lines) + @("Lib\site-packages", "import site")
  Set-Content -Path $pth -Value $lines -Encoding ascii
}

# 3. dependencies
$site = Join-Path $pythonDir "Lib\site-packages"
New-Item -ItemType Directory -Force -Path $site | Out-Null
$py = "C:\Users\Administrator\AppData\Roaming\uv\python\cpython-3.11.15-windows-x86_64-none\python.exe"
if (-not (Test-Path $py)) {
  throw "python not found: $py"
}

Write-Output "installing torch cpu"
& $py -m pip install --target $site --no-warn-script-location --upgrade torch --index-url https://download.pytorch.org/whl/cpu
if ($LASTEXITCODE -ne 0) { throw "torch install failed" }

Write-Output "installing runtime deps"
& $py -m pip install --target $site --no-warn-script-location --upgrade numpy opencv-python-headless tqdm easydict einops
if ($LASTEXITCODE -ne 0) { throw "dependency install failed" }

# 4. VDA code
$vda = Join-Path $build "vda"
if (-not (Test-Path (Join-Path $vda "video_depth_anything\video_depth.py"))) {
  Write-Output "cloning VDA"
  git clone --depth 1 https://github.com/DepthAnything/Video-Depth-Anything.git $vda
}
Write-Output "copying VDA code"
$vdaTarget = Join-Path $runtime "video_depth_anything"
$utilsTarget = Join-Path $runtime "utils"
Remove-Item $vdaTarget -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $utilsTarget -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item (Join-Path $vda "video_depth_anything") $vdaTarget -Recurse -Force
Copy-Item (Join-Path $vda "utils") $utilsTarget -Recurse -Force

# 5. worker
Copy-Item (Join-Path $repo "resources\depth-worker\worker.py") (Join-Path $runtime "worker.py") -Force

# 5.5 strip wheel metadata
# Enterprise encryption turns .dist-info/*.txt into non-UTF-8 blobs, and torch's
# importlib.metadata scan then fails at import time. The runtime never needs pip.
$sitePackages = Join-Path $pythonDir "Lib\site-packages"
$distInfos = @(
  Get-ChildItem $sitePackages -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -like "*.dist-info" }
)
Write-Output "removing $($distInfos.Count) dist-info dirs"
foreach ($item in $distInfos) {
  Remove-Item $item.FullName -Recurse -Force -ErrorAction Stop
}

# 6. zip runtime
Write-Output "compressing runtime"
$runtimeZip = Join-Path $OutputDir "depth-runtime-win32-x64-v1.zip"
if (Test-Path $runtimeZip) { Remove-Item $runtimeZip -Force }
Compress-Archive -Path (Join-Path $runtime "*") -DestinationPath $runtimeZip -CompressionLevel Optimal

# 7. runtime manifest
Write-Output "hashing runtime"
$hash = (Get-FileHash $runtimeZip -Algorithm SHA256).Hash.ToLower()
$size = (Get-Item $runtimeZip).Length
$expanded = (Get-ChildItem $runtime -Recurse -File | Measure-Object -Property Length -Sum).Sum
$files = (Get-ChildItem $runtime -Recurse -File).Count
$manifest = [ordered]@{
  version = 1
  kind = "depth-runtime"
  platform = "win32-x64"
  size = [int64]$size
  expandedSize = [int64]$expanded
  sha256 = $hash
  urls = @("http://127.0.0.1:$Port/depth-runtime-win32-x64-v1.zip")
  files = $files
}
$manifest | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $OutputDir "depth-runtime-manifest.json") -Encoding utf8

# 8. model package
if (-not (Test-Path $ModelPath)) {
  throw "model not found: $ModelPath"
}
Write-Output "copying model"
$modelName = "video_depth_anything_vits.pth"
$modelOut = Join-Path $OutputDir $modelName
Copy-Item $ModelPath $modelOut -Force
$modelHash = (Get-FileHash $modelOut -Algorithm SHA256).Hash.ToLower()
$modelSize = (Get-Item $modelOut).Length
$modelManifest = [ordered]@{
  version = 1
  kind = "depth-model"
  platform = "win32-x64"
  size = [int64]$modelSize
  expandedSize = [int64]$modelSize
  sha256 = $modelHash
  urls = @("http://127.0.0.1:$Port/$modelName")
  files = 1
}
$modelManifest | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $OutputDir "depth-model-vda-small-manifest.json") -Encoding utf8

Write-Output "DEPTH_COMPONENTS_READY"
