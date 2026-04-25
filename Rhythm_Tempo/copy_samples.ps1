$files = @(
    'C:\Users\전순용\Downloads\파도소리2.wav',
    'C:\Users\전순용\Downloads\파도,갈매기1.wav',
    'C:\Users\전순용\Downloads\빗소리1.wav',
    'C:\Users\전순용\Downloads\봄비소리.wav',
    'C:\Users\전순용\Downloads\바람1.wav',
    'C:\Users\전순용\Downloads\바람3.wav',
    'C:\Users\전순용\Downloads\물받는소리.wav',
    'C:\Users\전순용\Downloads\물끓는소리.wav',
    'C:\Users\전순용\Downloads\모닥불.wav',
    'C:\Users\전순용\Downloads\도랑물2.wav',
    'C:\Users\전순용\Downloads\도랑물.wav',
    'C:\Users\전순용\Downloads\새소리.wav',
    'C:\Users\전순용\Downloads\파도소리1.wav'
)
$dest = Join-Path -Path (Get-Location) -ChildPath 'samples'
if (-not (Test-Path $dest)) { New-Item -ItemType Directory -Path $dest | Out-Null }
foreach ($f in $files) {
    if (Test-Path $f) {
        Copy-Item -Path $f -Destination $dest -Force
        Write-Output "copied $f"
    } else {
        Write-Output "missing $f"
    }
}
