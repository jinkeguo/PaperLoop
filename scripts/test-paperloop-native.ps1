param([string]$ZoteroPath = 'C:/Program Files/Zotero/zotero.exe', [string]$Package = 'paperloop-release/verified-0328/PaperLoop-for-Zotero-0.5.4.xpi')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$root = Join-Path $repo ('paperloop-release/paperloop-native-test-'+[guid]::NewGuid().ToString())
$profile = Join-Path $root 'profile'
$data = Join-Path $root 'data'
$extensions = Join-Path $profile 'extensions'
New-Item -ItemType Directory -Path $extensions,$data -Force | Out-Null
$prefs = @(
    'user_pref("extensions.zotero.dataDir", '+(ConvertTo-Json $data -Compress)+');',
    'user_pref("extensions.zotero.useDataDir", true);',
    'user_pref("extensions.zotero.firstRun", false);',
    'user_pref("extensions.zotero.firstRun2", false);',
    'user_pref("extensions.zotero.firstRun.skipFirefoxProfileAccessCheck", true);',
    'user_pref("extensions.zotero.sync.autoSync", false);',
    'user_pref("extensions.autoDisableScopes", 0);',
    'user_pref("extensions.enabledScopes", 15);'
)
$prefs | Set-Content -LiteralPath (Join-Path $profile 'user.js') -Encoding utf8
Copy-Item -LiteralPath (Join-Path $repo $Package) -Destination (Join-Path $extensions 'paperloop-doi-bridge@paperloop.app.xpi')
$stream=[IO.File]::Open((Join-Path $extensions 'paperloop-release-test@local.invalid.xpi'),[IO.FileMode]::CreateNew)
$zip=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
try {
    foreach($file in Get-ChildItem -LiteralPath (Join-Path $repo 'test/paperloop-native') -File){[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$file.FullName,$file.Name) | Out-Null}
    foreach($name in @('paperLoopFlow_inject.js','paperLoopSync_inject.js')){[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $repo "browser-extension/inject/$name"),$name) | Out-Null}
} finally {$zip.Dispose();$stream.Dispose()}
$process=Start-Process -FilePath $ZoteroPath -ArgumentList @('-no-remote','-profile',('"'+$profile+'"'),'-ZoteroDebugText') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root 'stdout.log') -RedirectStandardError (Join-Path $root 'stderr.log')
Write-Output "Isolated test root: $root; PID: $($process.Id)"
$start=Get-Date
while(((Get-Date)-$start).TotalSeconds -lt 55){
    $report=Join-Path $root 'report.json'
    if(Test-Path -LiteralPath $report){$result=Get-Content -LiteralPath $report -Raw | ConvertFrom-Json;$result | ConvertTo-Json -Depth 8;if(!$result.ok){throw 'Native regression failed'};exit 0}
    Start-Sleep -Milliseconds 300
}
Write-Output "Test still running; inspect $root/report.json"
