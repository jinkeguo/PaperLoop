param([string]$PackageDirectory = 'paperloop-release/verified')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
foreach($part in @(
    @{Source='browser-extension';File='PaperLoop-Browser-Extension-0.3.27.zip';Version='0.3.27'},
    @{Source='zotero-plugin';File='PaperLoop-for-Zotero-0.5.4.xpi';Version='0.5.4'}
)){
    $source=Join-Path $repo $part.Source
    $package=Join-Path (Join-Path $repo $PackageDirectory) $part.File
    $zip=[IO.Compression.ZipFile]::OpenRead($package)
    try {
        $expected=@{}
        foreach($file in Get-ChildItem -LiteralPath $source -Recurse -File){
            $relative=[IO.Path]::GetRelativePath($source,$file.FullName).Replace('\','/')
            if($relative -match '(^|/)(tests?|\.git|node_modules)/|\.test\.[cm]?js$|\.ps1$|TEST-CHECKLIST\.md$'){continue}
            $expected[$relative]=$file.FullName
        }
        if($zip.Entries.Count -ne $expected.Count){throw 'Unexpected ZIP entry count'}
        foreach($entry in $zip.Entries){
            if(!$expected.ContainsKey($entry.FullName)){throw "Unexpected entry: $($entry.FullName)"}
            $entryStream=$entry.Open();$memory=[IO.MemoryStream]::new()
            try{$entryStream.CopyTo($memory);$hash=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($memory.ToArray()))}finally{$memory.Dispose();$entryStream.Dispose()}
            if($hash -ne (Get-FileHash -LiteralPath $expected[$entry.FullName]).Hash){throw "Package differs from source: $($entry.FullName)"}
        }
        $reader=[IO.StreamReader]::new($zip.GetEntry('manifest.json').Open())
        try{$manifest=$reader.ReadToEnd() | ConvertFrom-Json}finally{$reader.Dispose()}
        if($manifest.version -ne $part.Version){throw 'Unexpected manifest version'}
        [PSCustomObject]@{File=$part.File;Version=$manifest.version;VerifiedFiles=$expected.Count;SHA256=(Get-FileHash -LiteralPath $package).Hash} | ConvertTo-Json -Compress
    }finally{$zip.Dispose()}
}
