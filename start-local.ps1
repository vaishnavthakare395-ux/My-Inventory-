$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

$emulatorDataDir = "$PSScriptRoot\emulator-data"
$importExportFlag = ""
if (Test-Path $emulatorDataDir) {
    $importExportFlag = "--import=./emulator-data --export-on-exit=./emulator-data"
    Write-Host "Found existing emulator database in ./emulator-data. Loading all saved accounts and data..." -ForegroundColor Green
} else {
    $importExportFlag = "--export-on-exit=./emulator-data"
    Write-Host "Starting fresh emulator. Will save to ./emulator-data on exit." -ForegroundColor Cyan
}

Write-Host "Starting Firebase Emulators (Auth: 9099, Firestore: 8080, UI: 4000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "firebase emulators:start --only auth,firestore --project demo-stockflow $importExportFlag"

Start-Sleep -Seconds 5

if (-not (Test-Path $emulatorDataDir)) {
    Write-Host "Seeding initial local emulator database..." -ForegroundColor Cyan
    Push-Location "$PSScriptRoot\backend"
    npm run seed:local
    Pop-Location
} else {
    Write-Host "Skipping seed: Preserving your custom accounts, shops, products, and bills." -ForegroundColor Green
}

Write-Host "Starting Vite frontend server (http://localhost:5173)..." -ForegroundColor Cyan
Push-Location "$PSScriptRoot\frontend"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "npm run dev"
Pop-Location

Write-Host "`n=======================================================" -ForegroundColor Green
Write-Host "StockFlow is running locally!" -ForegroundColor Green
Write-Host "Web App:     http://localhost:5173" -ForegroundColor Yellow
Write-Host "Emulator UI: http://127.0.0.1:4000" -ForegroundColor Yellow
Write-Host "Login Email: admin@example.com" -ForegroundColor Yellow
Write-Host "Password:    password123" -ForegroundColor Yellow
Write-Host "=======================================================`n" -ForegroundColor Green
