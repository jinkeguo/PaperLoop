param(
    [Parameter(Mandatory=$true)][string]$ReportPath,
    [Parameter(Mandatory=$true)][string]$ExpectedPackageSHA256,
    [ValidateRange(0,600)][int]$TimeoutSeconds=180
)
$ErrorActionPreference='Stop'
if($ExpectedPackageSHA256 -notmatch '^[a-f0-9]{64}$'){throw 'Expected XPI SHA256 is required'}
$timer=[Diagnostics.Stopwatch]::StartNew()
do {
    if(Test-Path -LiteralPath $ReportPath){
        $result=Get-Content -LiteralPath $ReportPath -Raw | ConvertFrom-Json
        if($result.ok -isnot [bool] -or !$result.ok){throw 'Native regression did not report ok=true'}
        if($result.packageSHA256 -ne $ExpectedPackageSHA256){throw 'Native regression package SHA256 mismatch'}
        return $result
    }
    if($timer.Elapsed.TotalSeconds -ge $TimeoutSeconds){break}
    Start-Sleep -Milliseconds 200
}while($true)
throw "Native regression timed out without a completed report: $ReportPath"
