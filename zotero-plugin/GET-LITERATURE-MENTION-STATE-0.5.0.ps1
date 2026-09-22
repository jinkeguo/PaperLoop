param(
	[string]$OutputPath = ""
)

$uri = 'http://127.0.0.1:23119/connector/paperloop/literature-mention-state'
$headers = @{'Zotero-Allowed-Request' = '1'}
$response = Invoke-RestMethod -Method Get -Uri $uri -Headers $headers
$json = $response | ConvertTo-Json -Depth 100

if ($OutputPath) {
	Set-Content -LiteralPath $OutputPath -Value $json -Encoding utf8
	Write-Output "Saved PaperLoop literature-mention state to $OutputPath"
}
else {
	Write-Output $json
}
