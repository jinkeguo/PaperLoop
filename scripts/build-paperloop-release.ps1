param([string]$OutputDirectory = 'paperloop-release')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$repositoryRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputRoot = [IO.Path]::GetFullPath((Join-Path $repositoryRoot $OutputDirectory))
if (!$outputRoot.StartsWith($repositoryRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Output must stay within this repository' }
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
foreach ($component in @(
    @{Source='browser-extension';Name='PaperLoop-Browser-Extension';Version='0.3.28';Extension='zip'},
    @{Source='zotero-plugin';Name='PaperLoop-for-Zotero';Version='0.5.4';Extension='xpi'}
)) {
    $source = Join-Path $repositoryRoot $component.Source
    $manifest = Get-Content -LiteralPath (Join-Path $source 'manifest.json') -Raw | ConvertFrom-Json
    if ($manifest.version -ne $component.Version) { throw 'Manifest/package version mismatch' }
    $destination = Join-Path $outputRoot ($component.Name + '-' + $component.Version + '.' + $component.Extension)
    if (Test-Path -LiteralPath $destination) { throw "Output already exists: $destination" }
    $stream = [IO.File]::Open($destination, [IO.FileMode]::CreateNew)
    $zip = [IO.Compression.ZipArchive]::new($stream, [IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($file in Get-ChildItem -LiteralPath $source -Recurse -File | Sort-Object FullName) {
            $relative = [IO.Path]::GetRelativePath($source,$file.FullName).Replace('\','/')
            if ($relative -match '(^|/)(tests?|\.git|node_modules)/|\.test\.[cm]?js$|\.ps1$|TEST-CHECKLIST\.md$') { continue }
            $entry = $zip.CreateEntry($relative,[IO.Compression.CompressionLevel]::Optimal)
            $entry.LastWriteTime = [DateTimeOffset]::Parse('2026-09-22T00:00:00+00:00')
            $inputStream = [IO.File]::OpenRead($file.FullName)
            $entryStream = $entry.Open()
            try { $inputStream.CopyTo($entryStream) } finally { $entryStream.Dispose(); $inputStream.Dispose() }
        }
    } finally { $zip.Dispose(); $stream.Dispose() }
    Get-FileHash -LiteralPath $destination -Algorithm SHA256 | Select-Object Path,Hash
}
