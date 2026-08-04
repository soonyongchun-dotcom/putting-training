param()
Set-Location "C:\Users\전순용\Desktop\Golfworks\GitHub_push"
$bPath = Resolve-Path "..\putting-training\golf_rounddatanput(26.2.1).html"
$cPath = Resolve-Path ".\golf_rounddatanput(26.2.1).html"

$b = [System.IO.File]::ReadAllLines($bPath.Path, [System.Text.Encoding]::UTF8)
$c = [System.IO.File]::ReadAllLines($cPath.Path, [System.Text.Encoding]::UTF8)

# 교체 맵: 현재 파일 줄 (정규식 패턴) -> 백업 파일에서 찾을 키워드
$patterns = @(
    # CSS comment
    @{ pattern = '@media \(min-width:1025px\)'; backupKey = 'min-width:1025px' },
    # nav button
    @{ pattern = "nav-back-btn.*onclick="; backupKey = 'nav-back-btn' },
    # server auth banner comment
    @{ pattern = '<!--.*\?.*\?.*배너'; backupKey = '서버 인증 상태 배너' },
    # distance unit label
    @{ pattern = 'Distance Unit.*거리.*\?'; backupKey = '거리 단위' },
    # server round select label
    @{ pattern = '^\s+\?.*\?.*\?.*\?.*<br>$'; backupKey = '서버 라운드 선택' },
    # delete button
    @{ pattern = 'btnDeleteSyncedRound'; backupKey = '선택 삭제' },
    # puttStatsPanel comment
    @{ pattern = '거리.*경사.*\?.*통계.*여기'; backupKey = '거리별/경사별 퍼팅 통계' }
)

$replacedCount = 0
$newLines = New-Object System.Collections.Generic.List[string]

for ($i = 0; $i -lt $c.Count; $i++) {
    $line = $c[$i]
    $replaced = $false
    
    if ($line -match '\?') {
        foreach ($pat in $patterns) {
            if ($line -match $pat.pattern) {
                # 백업에서 해당 키워드를 포함하는 줄 찾기
                $bMatch = $b | Where-Object { $_ -match ([regex]::Escape($pat.backupKey)) }
                if ($bMatch -and ($bMatch | Measure-Object).Count -ge 1) {
                    $bLine = if ($bMatch -is [array]) { $bMatch[0] } else { $bMatch }
                    $bQ = ([regex]::Matches($bLine, '\?')).Count
                    $cQ = ([regex]::Matches($line, '\?')).Count
                    if ($bQ -le $cQ) {
                        $newLines.Add($bLine)
                        $replacedCount++
                        $replaced = $true
                        break
                    }
                }
            }
        }
    }
    
    if (-not $replaced) {
        $newLines.Add($line)
    }
}

[System.IO.File]::WriteAllLines($cPath.Path, $newLines.ToArray(), (New-Object System.Text.UTF8Encoding $true))
Write-Host "Done: $replacedCount lines replaced"
$result = [System.IO.File]::ReadAllBytes($cPath.Path)
$korCount = ($result | Where-Object { $_ -ge 0xEA -and $_ -le 0xED }).Count
$qCount = ($result | Where-Object { $_ -eq 0x3F }).Count
Write-Host "Korean bytes: $korCount, Q bytes: $qCount"
