$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
Write-Host '== PlantCompanion v0.3 Windows verification ==' -ForegroundColor Cyan
foreach ($tool in @('node', 'npm', 'cargo', 'rustc')) {
    if (!(Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "Missing dependency: $tool. Install Rust stable + Node 22 first."
    }
}
node --version
cargo --version
npm install
node scripts/build_preview.mjs
npm run test:static
cargo test -p plant-life-core -p plant-store -- --nocapture
npm run build
npm run tauri build
Write-Host 'Tests and Windows bundle finished successfully.' -ForegroundColor Green
Write-Host 'Installer: target/release/bundle/nsis or src-tauri/target/release/bundle/nsis'
