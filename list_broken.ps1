Set-Location "C:\Users\전순용\Desktop\Golfworks\GitHub_push"
$cPath = Resolve-Path ".\golf_rounddatanput(26.2.1).html"
$lines = [System.IO.File]::ReadAllLines($cPath.Path, [System.Text.Encoding]::UTF8)
$out = New-Object System.Collections.Generic.List[string]
for ($i=0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '\?' -and $lines[$i] -match '[\uAC00-\uD7A3]') {
        $out.Add("$($i+1): $($lines[$i])")
    }
}
[System.IO.File]::WriteAllLines("$env:TEMP\broken_lines.txt", $out.ToArray(), [System.Text.Encoding]::UTF8)
Write-Host "Saved $($out.Count) broken lines"
