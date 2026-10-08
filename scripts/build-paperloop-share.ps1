param([string]$PackageDirectory='paperloop-release')
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$packages=[IO.Path]::GetFullPath((Join-Path $repo $PackageDirectory))
if(!$packages.StartsWith($repo+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Packages must stay inside the repository'}
& (Join-Path $PSScriptRoot 'audit-paperloop-release.ps1') -PackageDirectory $PackageDirectory
$version=(Get-Content -LiteralPath (Join-Path $repo 'browser-extension/manifest.json') -Raw | ConvertFrom-Json).version
$nativeVersion=(Get-Content -LiteralPath (Join-Path $repo 'zotero-plugin/manifest.json') -Raw | ConvertFrom-Json).version
$folder=Join-Path $packages "PaperLoop-$version-Share"
$zipPath=$folder+'.zip'
if((Test-Path -LiteralPath $folder)-or(Test-Path -LiteralPath $zipPath)){throw 'Share output already exists'}
New-Item -ItemType Directory -Path (Join-Path $folder 'docs') | Out-Null
[IO.Compression.ZipFile]::ExtractToDirectory((Join-Path $packages "PaperLoop-Browser-Extension-$version.zip"),(Join-Path $folder 'browser-extension'))
Copy-Item -LiteralPath (Join-Path $packages "PaperLoop-for-Zotero-$nativeVersion.xpi") -Destination $folder
Copy-Item -LiteralPath (Join-Path $repo 'docs/INSTALLATION.md') -Destination (Join-Path $folder 'START-HERE.txt')
Copy-Item -LiteralPath (Join-Path $repo 'COPYING'),(Join-Path $repo 'NOTICE.md') -Destination $folder
foreach($name in @('INSTALLATION.md','CREDITS.md','PRIVACY.md','COMPATIBILITY.md')){Copy-Item -LiteralPath (Join-Path $repo "docs/$name") -Destination (Join-Path $folder 'docs')}
New-Item -ItemType Directory -Path (Join-Path $folder 'docs/validation') | Out-Null
Copy-Item -LiteralPath (Join-Path $repo "docs/validation/v$version.md") -Destination (Join-Path $folder 'docs/validation')
Copy-Item -LiteralPath (Join-Path $repo "docs/releases/v$version.md") -Destination (Join-Path $folder 'RELEASE-NOTES.md')
$stream=[IO.File]::Open($zipPath,[IO.FileMode]::CreateNew)
$archive=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
try{
 foreach($file in Get-ChildItem -LiteralPath $folder -Recurse -File | Sort-Object FullName){
  $relative=[IO.Path]::GetRelativePath($folder,$file.FullName).Replace('\','/')
  $entry=$archive.CreateEntry($relative,[IO.Compression.CompressionLevel]::Optimal)
  $entry.LastWriteTime=[DateTimeOffset]::Parse('2026-09-29T00:00:00+00:00')
  $inputStream=[IO.File]::OpenRead($file.FullName);$outputStream=$entry.Open()
  try{$inputStream.CopyTo($outputStream)}finally{$inputStream.Dispose();$outputStream.Dispose()}
 }
}finally{$archive.Dispose();$stream.Dispose()}
$verify=[IO.Compression.ZipFile]::OpenRead($zipPath)
try{
 foreach($entry in $verify.Entries){
  $entryStream=$entry.Open();$memory=[IO.MemoryStream]::new()
  try{$entryStream.CopyTo($memory);$hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($memory.ToArray()))}finally{$entryStream.Dispose();$memory.Dispose()}
  if($hash -ne (Get-FileHash -LiteralPath (Join-Path $folder $entry.FullName)).Hash){throw "Share archive mismatch: $($entry.FullName)"}
 }
 [PSCustomObject]@{File=$zipPath;VerifiedFiles=$verify.Entries.Count;SHA256=(Get-FileHash -LiteralPath $zipPath).Hash} | ConvertTo-Json
}finally{$verify.Dispose()}
