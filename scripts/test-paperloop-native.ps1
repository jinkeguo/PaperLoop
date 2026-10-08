param([string]$ZoteroPath = 'C:/Program Files/Zotero/zotero.exe', [string]$Package = '', [ValidateRange(1,600)][int]$ReportTimeoutSeconds=180)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nativeVersion=(Get-Content -LiteralPath (Join-Path $repo 'zotero-plugin/manifest.json') -Raw | ConvertFrom-Json).version
if(!$Package){$Package="paperloop-release/PaperLoop-for-Zotero-$nativeVersion.xpi"}
$packagePath=[IO.Path]::GetFullPath((Join-Path $repo $Package))
$packageSHA256=(Get-FileHash -LiteralPath $packagePath -Algorithm SHA256).Hash
$root = Join-Path $repo ('paperloop-release/paperloop-native-test-'+[guid]::NewGuid().ToString())
$profile = Join-Path $root 'profile'
$data = Join-Path $root 'data'
$extensions = Join-Path $profile 'extensions'
$taskTempPath = Join-Path $root 'tmp'
New-Item -ItemType Directory -Path $extensions,$data,$taskTempPath -Force | Out-Null
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$listener.Start();$testPort=$listener.LocalEndpoint.Port;$listener.Stop()
$prefs = @(
    ('user_pref("extensions.zotero.httpServer.port", '+$testPort+');'),
    'user_pref("extensions.zotero.httpServer.enabled", true);',
    'user_pref("extensions.zotero.automaticScraperUpdates", false);',
    'user_pref("app.update.auto", false);',
    'user_pref("extensions.zotero.dataDir", '+(ConvertTo-Json $data -Compress)+');',
    'user_pref("extensions.zotero.useDataDir", true);',
    'user_pref("extensions.zotero.firstRun", false);',
    'user_pref("extensions.zotero.firstRun2", false);',
    'user_pref("extensions.zotero.firstRun.skipFirefoxProfileAccessCheck", true);',
    'user_pref("extensions.zotero.sync.autoSync", false);',
    'user_pref("extensions.zoteroWinWordIntegration.skipInstallation", true);',
    'user_pref("extensions.zoteroOpenOfficeIntegration.skipInstallation", true);',
    'user_pref("extensions.autoDisableScopes", 0);',
    'user_pref("extensions.enabledScopes", 15);'
)
$prefs | Set-Content -LiteralPath (Join-Path $profile 'user.js') -Encoding utf8
Copy-Item -LiteralPath $packagePath -Destination (Join-Path $extensions 'paperloop-doi-bridge@paperloop.app.xpi')
@{package=$packagePath;packageSHA256=$packageSHA256;zotero=$ZoteroPath;profile=$profile;port=$testPort} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $root 'launch.json') -Encoding utf8
$stream=[IO.File]::Open((Join-Path $extensions 'paperloop-release-test@local.invalid.xpi'),[IO.FileMode]::CreateNew)
$zip=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
try {
    foreach($file in Get-ChildItem -LiteralPath (Join-Path $repo 'test/paperloop-native') -File){[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,$file.FullName,$file.Name) | Out-Null}
    foreach($name in @('paperLoopFlow_inject.js','paperLoopSync_inject.js')){[IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip,(Join-Path $repo "browser-extension/inject/$name"),$name) | Out-Null}
} finally {$zip.Dispose();$stream.Dispose()}
# Each host extracts bundled styles/translators into TEMP/Zotero at first run.
# Sharing it between isolated hosts can delete another host's in-flight files.
$process=Start-Process -FilePath $ZoteroPath -ArgumentList @('-no-remote','-profile',('"'+$profile+'"'),'-ZoteroDebugText') -Environment @{TEMP=$taskTempPath;TMP=$taskTempPath} -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $root 'stdout.log') -RedirectStandardError (Join-Path $root 'stderr.log')
Write-Output "Isolated test root: $root; PID: $($process.Id); HTTP port: $testPort; XPI SHA256: $packageSHA256"
try {
    $result=& (Join-Path $PSScriptRoot 'wait-paperloop-native-report.ps1') -ReportPath (Join-Path $root 'report.json') -ExpectedPackageSHA256 $packageSHA256 -TimeoutSeconds $ReportTimeoutSeconds
    $result | ConvertTo-Json -Depth 8
}catch {
    # Firefox may restart with another PID. Only stop the process explicitly
    # launched with this disposable profile, never a personal Zotero instance.
    try{Get-CimInstance Win32_Process -Filter "Name='zotero.exe'" | Where-Object {$_.CommandLine -and $_.CommandLine.Contains($profile)} | ForEach-Object {Stop-Process -Id $_.ProcessId -ErrorAction Stop}}catch{Write-Warning 'Could not stop timed-out isolated test instance'}
    throw
}
