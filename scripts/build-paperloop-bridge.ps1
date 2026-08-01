param(
    [string]$OutputDirectory = "paperloop-release"
)

$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sourceDirectory = Join-Path $repositoryRoot "paperloop-zotero-bridge"
$resolvedOutputDirectory = Join-Path $repositoryRoot $OutputDirectory
$outputPath = Join-Path $resolvedOutputDirectory "PaperLoop-DOI-Bridge-0.1.19.xpi"

if (-not (Test-Path -LiteralPath $sourceDirectory)) {
    throw "Bridge source directory not found: $sourceDirectory"
}

if (Test-Path -LiteralPath $outputPath) {
    throw "Output already exists; move or remove it explicitly: $outputPath"
}

New-Item -ItemType Directory -Force -Path $resolvedOutputDirectory | Out-Null

$temporaryZip = Join-Path $resolvedOutputDirectory ("paperloop-bridge-" + [guid]::NewGuid().ToString("N") + ".zip")
$runtimeFiles = @(
    "bootstrap.js",
    "manifest.json",
    "paperloop.js",
    "README.md"
) | ForEach-Object { Join-Path $sourceDirectory $_ }

foreach ($file in $runtimeFiles) {
    if (-not (Test-Path -LiteralPath $file)) {
        throw "Required Bridge file not found: $file"
    }
}

try {
    Compress-Archive -LiteralPath $runtimeFiles -DestinationPath $temporaryZip
    Move-Item -LiteralPath $temporaryZip -Destination $outputPath
}
finally {
    if (Test-Path -LiteralPath $temporaryZip) {
        Remove-Item -LiteralPath $temporaryZip
    }
}

$hash = Get-FileHash -LiteralPath $outputPath -Algorithm SHA256
Write-Output "Built: $outputPath"
Write-Output "SHA-256: $($hash.Hash)"
