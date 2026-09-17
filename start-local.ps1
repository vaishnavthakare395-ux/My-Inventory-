$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

Write-Host "Starting Firebase Emulators (Auth: 9099, Firestore: 8080, UI: 4000)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "firebase emulators:start --only auth,firestore --project demo-stockflow"

Start-Sleep -Seconds 5

Write-Host "Seeding local emulator database..." -ForegroundColor Cyan
Push-Location "$PSScriptRoot\backend"
npm run seed:local
Pop-Location

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
