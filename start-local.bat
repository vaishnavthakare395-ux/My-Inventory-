@echo off
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot"
set "PATH=%JAVA_HOME%\bin;%PATH%"

echo Starting Firebase Emulators (Auth on 9099, Firestore on 8080, UI on 4000)...
start "StockFlow Firebase Emulators" cmd /k "firebase emulators:start --only auth,firestore --project demo-stockflow"

echo Waiting 5 seconds for emulators to boot...
timeout /t 5 /nobreak >nul

echo Seeding local emulator database with sample admin, warehouses and products...
cd backend
cmd /c "npm run seed:local"
cd ..

echo Starting StockFlow Frontend (Vite on http://localhost:5173)...
cd frontend
start "StockFlow Frontend (Vite)" cmd /k "npm run dev"
cd ..

echo.
echo =======================================================
echo StockFlow is running locally!
echo Web App:     http://localhost:5173
echo Emulator UI: http://127.0.0.1:4000
echo Login Email: admin@example.com
echo Password:    password123
echo =======================================================
