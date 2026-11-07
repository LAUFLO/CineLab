param(
  [string]$OutputDir = "",
  [string]$PythonExe = "",
  [string]$PythonVersion = "3.11.9",
  [string]$TorchVersion = "2.8.0",
  [string]$NumpyVersion = "2.1.3",
  [string]$OpenCvVersion = "4.10.0.84",
  [string]$VdaRef = "4f5ae23172ba60fd7bc11ef671cca678842c7072",
  [string]$DownloadBase = "",
  [int]$RuntimeVersion = 1,
  [switch]$SkipSmokeTest
)

$ErrorActionPreference = 'Stop'
# Keep native commands (git/curl/pip) from throwing so $LASTEXITCODE checks work
# the same locally and on GitHub Actions runners that enable this switch.
$PSNativeCommandUseErrorActionPreference = $false

$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
if (-not $OutputDir) {
  $OutputDir = Join-Path $repo "build\components"
}

$build = Join-Path $env:TEMP "cinelab-depth-runtime-build"
$runtime = Join-Path $build "runtime"
$pythonDir = Join-Path $runtime "python"

New-Item -ItemType Directory -Force -Path $build | Out-Null
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
if (Test-Path $runtime) { Remove-Item $runtime -Recurse -Force }
New-Item -ItemType Directory -Force -Path $runtime | Out-Null

# 1. host python (used only to install wheels into the embeddable layout)
if (-not $PythonExe) {
  $command = Get-Command python -ErrorAction SilentlyContinue
  if (-not $command) {
    throw "python not found on PATH; pass -PythonExe"
  }
  $PythonExe = $command.Source
}

$hostVersion = [string](& $PythonExe -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
$hostVersion = $hostVersion.Trim()
$expectedVersion = [string]::Join('.', $PythonVersion.Split('.')[0..1])
if ($hostVersion -ne $expectedVersion) {
  throw "host python $hostVersion does not match embeddable python $PythonVersion"
}

# 2. embeddable python
$pyZip = Join-Path $build "python-$PythonVersion-embed-amd64.zip"
if (-not (Test-Path $pyZip)) {
  Write-Output "downloading python $PythonVersion"
  curl.exe -L --fail --retry 3 -o $pyZip "https://www.python.org/ftp/python/$PythonVersion/python-$PythonVersion-embed-amd64.zip"
  if ($LASTEXITCODE -ne 0) { throw "python download failed" }
}

if (Test-Path $pythonDir) { Remove-Item $pythonDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $pythonDir | Out-Null
Write-Output "extracting python"
Expand-Archive -Path $pyZip -DestinationPath $pythonDir -Force

# enable site-packages inside the embeddable distribution
$pthName = "python" + [string]::Join('', $PythonVersion.Split('.')[0..1]) + "._pth"
$pth = Join-Path $pythonDir $pthName
if (-not (Test-Path $pth)) {
  throw "$pthName not found"
}
$lines = @(Get-Content -Path $pth | Where-Object {
  $trimmed = $_.Trim()
  $trimmed -ne "Lib\site-packages" -and $trimmed -ne "import site" -and $trimmed -ne "#import site"
})
$lines += "Lib\site-packages"
$lines += "import site"
[IO.File]::WriteAllLines($pth, [string[]]$lines, (New-Object Text.UTF8Encoding($false)))

# 3. dependencies
$site = Join-Path $pythonDir "Lib\site-packages"
New-Item -ItemType Directory -Force -Path $site | Out-Null

Write-Output "installing torch $TorchVersion (cpu) and runtime deps"
$installArgs = @(
  "-m", "pip", "install",
  "--target", $site,
  "--no-warn-script-location",
  "--upgrade",
  "torch==$TorchVersion",
  "numpy==$NumpyVersion",
  "opencv-python-headless==$OpenCvVersion",
  "tqdm",
  "easydict",
  "einops",
  "--index-url", "https://download.pytorch.org/whl/cpu",
  "--extra-index-url", "https://pypi.org/simple"
)
& $PythonExe @installArgs
if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

# 4. VDA source at a fixed commit
$vda = Join-Path $build "vda"
if (-not (Test-Path (Join-Path $vda ".git"))) {
  if (Test-Path $vda) { Remove-Item $vda -Recurse -Force }
  Write-Output "cloning VDA"
  git clone https://github.com/DepthAnything/Video-Depth-Anything.git $vda
  if ($LASTEXITCODE -ne 0) { throw "git clone failed" }
}

Write-Output "checking out VDA $VdaRef"
git -C $vda checkout --force $VdaRef
if ($LASTEXITCODE -ne 0) {
  git -C $vda fetch origin $VdaRef --depth 1
  if ($LASTEXITCODE -ne 0) { throw "git fetch failed for $VdaRef" }
  git -C $vda checkout --force FETCH_HEAD
  if ($LASTEXITCODE -ne 0) { throw "git checkout failed for $VdaRef" }
}

# 5. assemble runtime
Write-Output "copying VDA code and worker"
Copy-Item (Join-Path $vda "video_depth_anything") (Join-Path $runtime "video_depth_anything") -Recurse -Force
Copy-Item (Join-Path $vda "utils") (Join-Path $runtime "utils") -Recurse -Force
Copy-Item (Join-Path $repo "resources\depth-worker\worker.py") (Join-Path $runtime "worker.py") -Force

Write-Output "removing caches"
Get-ChildItem $runtime -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
  Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem $runtime -Recurse -File -Filter "*.pyc" -ErrorAction SilentlyContinue |
  Remove-Item -Force -ErrorAction SilentlyContinue

# 6. smoke test with the packaged interpreter
if (-not $SkipSmokeTest) {
  $runtimePython = Join-Path $pythonDir "python.exe"
  $smoke = @"
import sys
sys.path.insert(0, r'$runtime')
import torch, cv2, numpy, einops, easydict, tqdm
from worker import ensure_torchvision_compose
ensure_torchvision_compose()
from video_depth_anything.video_depth import VideoDepthAnything
assert torch.version.cuda is None, 'runtime must use CPU torch'
print('SMOKE_OK', torch.__version__, numpy.__version__, cv2.__version__)
"@
  $smokePath = Join-Path $build "smoke.py"
  [IO.File]::WriteAllText($smokePath, $smoke, (New-Object Text.UTF8Encoding($false)))
  Write-Output "running runtime smoke test"
  & $runtimePython $smokePath
  if ($LASTEXITCODE -ne 0) { throw "runtime smoke test failed" }
}

# 7. zip + manifest
$zipName = "depth-runtime-win32-x64-v$RuntimeVersion.zip"
$runtimeZip = Join-Path $OutputDir $zipName
if (Test-Path $runtimeZip) { Remove-Item $runtimeZip -Force }

Write-Output "compressing runtime"
Compress-Archive -Path (Join-Path $runtime "*") -DestinationPath $runtimeZip -CompressionLevel Optimal

Write-Output "hashing runtime"
$hash = (Get-FileHash $runtimeZip -Algorithm SHA256).Hash.ToLower()
$size = (Get-Item $runtimeZip).Length
$files = @(Get-ChildItem $runtime -Recurse -File).Count
$expanded = (Get-ChildItem $runtime -Recurse -File | Measure-Object -Property Length -Sum).Sum
if (-not $expanded) { $expanded = 0 }

if (-not $DownloadBase) {
  $DownloadBase = "http://127.0.0.1:8899"
}
$DownloadBase = $DownloadBase.TrimEnd('/')

$manifest = [ordered]@{
  version = $RuntimeVersion
  kind = "depth-runtime"
  platform = "win32-x64"
  size = [int64]$size
  expandedSize = [int64]$expanded
  sha256 = $hash
  urls = @("$DownloadBase/$zipName")
  files = $files
}
$manifestPath = Join-Path $OutputDir "depth-runtime-manifest.json"
[IO.File]::WriteAllText(
  $manifestPath,
  ($manifest | ConvertTo-Json -Depth 4),
  (New-Object Text.UTF8Encoding($false))
)

Write-Output "DEPTH_RUNTIME_READY"
Write-Output "zip=$runtimeZip"
Write-Output "manifest=$manifestPath"
Write-Output "sha256=$hash"
Write-Output "size=$size"
Write-Output "expandedSize=$expanded"
Write-Output "files=$files"
