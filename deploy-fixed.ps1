# PowerShell Deploy Script for Azure App Service
# This script builds the project and creates deployment.zip for Azure App Service

param(
    [switch]$SkipBuild,
    [switch]$Verbose
)

# Enable verbose output if requested
if ($Verbose) {
    $VerbosePreference = "Continue"
}

Write-Host "Starting Care Data Manager deployment process..." -ForegroundColor Green

# Tool validation
Write-Host "Validating required tools..."
$tools = @("node", "npm")
foreach ($tool in $tools) {
    if (!(Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Error "Required tool '$tool' not found. Please install it and try again."
        exit 1
    }
    Write-Host "✓ $tool found" -ForegroundColor Green
}

# Check for 7z or Compress-Archive
$useCompress = $false
if (!(Get-Command "7z" -ErrorAction SilentlyContinue)) {
    Write-Host "7z not found, will use Compress-Archive" -ForegroundColor Yellow
    $useCompress = $true
} else {
    Write-Host "✓ 7z found" -ForegroundColor Green
}

# Build client if not skipping
if (!$SkipBuild) {
    Write-Host "Building client..."
    Set-Location "client"
    
    if (!(Test-Path "node_modules")) {
        Write-Host "Installing client dependencies..."
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to install client dependencies"
            exit 1
        }
    }
    
    Write-Host "Building client application..."
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Client build failed"
        exit 1
    }
    
    # Verify client build output
    $clientBuildPath = "..\server\dist\client"
    if (!(Test-Path $clientBuildPath)) {
        Write-Error "Client build output not found at $clientBuildPath"
        exit 1
    }
    Write-Host "✓ Client built successfully at $clientBuildPath" -ForegroundColor Green
    
    Set-Location ".."
}

# Build server if not skipping
if (!$SkipBuild) {
    Write-Host "Building server..."
    Set-Location "server"
    
    if (!(Test-Path "node_modules")) {
        Write-Host "Installing server dependencies..."
        npm install
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to install server dependencies"
            exit 1
        }
    }
    
    Write-Host "Building server application..."
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Server build failed"
        exit 1
    }
    
    # Verify server build output
    if (!(Test-Path "dist\index.js")) {
        Write-Error "Server build output not found at dist\index.js"
        exit 1
    }
    Write-Host "✓ Server built successfully" -ForegroundColor Green
    
    Set-Location ".."
}

# Create deployment structure
Write-Host "Creating deployment structure..."

# Remove any existing deployment directory
if (Test-Path "deployment-temp") {
    Remove-Item "deployment-temp" -Recurse -Force
}
New-Item -ItemType Directory -Path "deployment-temp" -Force | Out-Null
New-Item -ItemType Directory -Path "deployment-temp\client" -Force | Out-Null
New-Item -ItemType Directory -Path "deployment-temp\migrations" -Force | Out-Null

Write-Host "Copying files to deployment structure..."

# Copy server's built index.js as server.js (for web.config compatibility)
if (Test-Path "server\dist\index.js") {
    Copy-Item "server\dist\index.js" "deployment-temp\server.js"
    Write-Host "✓ Copied server build to deployment-temp\server.js" -ForegroundColor Green
} else {
    Write-Error "Server build not found at server\dist\index.js"
    exit 1
}

# Copy client build output
$clientSource = "server\dist\client"
if (Test-Path $clientSource) {
    Copy-Item "$clientSource\*" "deployment-temp\client\" -Recurse -Force
    Write-Host "✓ Copied client build to deployment-temp\client\" -ForegroundColor Green
} else {
    Write-Warning "Client build not found at $clientSource"
}

# Copy migrations
if (Test-Path "server\dist\migrations") {
    Copy-Item "server\dist\migrations\*" "deployment-temp\migrations\" -Recurse -Force
    Write-Host "✓ Copied migrations to deployment-temp\migrations\" -ForegroundColor Green
} elseif (Test-Path "migrations") {
    Copy-Item "migrations\*" "deployment-temp\migrations\" -Recurse -Force
    Write-Host "✓ Copied root migrations to deployment-temp\migrations\" -ForegroundColor Green
} else {
    Write-Warning "No migrations found"
}

# Copy configuration files
Write-Host "Copying configuration files..."

# Copy server package.json for production dependencies
Copy-Item "server\package.json" "deployment-temp\package.json"

# Fix package.json for Azure deployment
Write-Host "Fixing package.json for Azure deployment..."
Set-Location "deployment-temp"

# Copy the fix script and run it
Copy-Item "..\fix-package-azure.cjs" "fix-package-azure.cjs"
node "fix-package-azure.cjs"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to fix package.json"
    exit 1
}
Remove-Item "fix-package-azure.cjs" -Force

Set-Location ".."

# Copy environment file
if (Test-Path "server\production.env") {
    Copy-Item "server\production.env" "deployment-temp\production.env"
    Write-Host "✓ Copied server\production.env" -ForegroundColor Green
} elseif (Test-Path "production.env") {
    Copy-Item "production.env" "deployment-temp\production.env"
    Write-Host "✓ Copied root production.env" -ForegroundColor Green
} else {
    Write-Warning "No production.env found"
}

# Copy web.config if it exists
if (Test-Path "web.config") {
    Copy-Item "web.config" "deployment-temp\web.config"
    Write-Host "✓ Copied web.config" -ForegroundColor Green
}

# Verify deployment structure
Write-Host "Verifying deployment structure..."
$requiredFiles = @("server.js", "package.json")
foreach ($file in $requiredFiles) {
    if (!(Test-Path "deployment-temp\$file")) {
        Write-Error "Required file $file not found in deployment structure"
        exit 1
    }
}
Write-Host "✓ Deployment structure verified" -ForegroundColor Green

# Create deployment zip
Write-Host "Creating deployment.zip..."
if (Test-Path "deployment.zip") {
    Remove-Item "deployment.zip" -Force
}

if ($useCompress) {
    Compress-Archive -Path "deployment-temp\*" -DestinationPath "deployment.zip" -Force
} else {
    Set-Location "deployment-temp"
    7z a "..\deployment.zip" "*" -r
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to create deployment.zip"
        exit 1
    }
    Set-Location ".."
}

# Cleanup
Write-Host "Cleaning up temporary files..."
Remove-Item "deployment-temp" -Recurse -Force

# Final verification
if (Test-Path "deployment.zip") {
    $zipSize = (Get-Item "deployment.zip").Length / 1MB
    Write-Host "✓ deployment.zip created successfully ($([math]::Round($zipSize, 2)) MB)" -ForegroundColor Green
} else {
    Write-Error "deployment.zip was not created"
    exit 1
}

Write-Host ""
Write-Host "Deployment package ready!" -ForegroundColor Green
Write-Host "Upload deployment.zip to Azure App Service or use GitHub Actions for automatic deployment." -ForegroundColor Yellow
Write-Host ""
Write-Host "Key fixes applied:" -ForegroundColor Cyan
Write-Host "- Server built as server.js (web.config compatible)" -ForegroundColor White
Write-Host "- cross-env moved to production dependencies" -ForegroundColor White
Write-Host "- Azure-compatible start scripts added" -ForegroundColor White
