[CmdletBinding()]
param(
    [switch]$PauseAtEnd,
    [string]$EnvironmentFile = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$passwordPointer = [IntPtr]::Zero
$passwordSecure = $null
$password = $null
$passwordBytes = $null
$passwordTransport = $null
$nodeProcess = $null
$failure = $null

Push-Location -LiteralPath $projectRoot
try {
    Write-Host "REIST - exakt autorisierter Base-Sepolia-Treasury-Smoke"
    Write-Host "1) 0,000005 Test-ETH: Deployer -> Research Treasury"
    Write-Host "2) 1 Testnet-REIST: Research Treasury -> Ecosystem Treasury"
    Write-Host "Kein Bounty, keine Contribution, kein Mainnet."
    $resolvedEnvironmentFile = if ([string]::IsNullOrWhiteSpace($EnvironmentFile)) {
        Join-Path $projectRoot ".env"
    } else {
        [IO.Path]::GetFullPath($EnvironmentFile)
    }
    if (-not (Test-Path -LiteralPath $resolvedEnvironmentFile -PathType Leaf)) {
        throw "Angegebene lokale .env-Datei fehlt."
    }
    $keystoreEntries = @(Get-Content -LiteralPath $resolvedEnvironmentFile -Encoding UTF8 | Where-Object {
        $_ -match "^\s*(?:export\s+)?REIST_KEYSTORE_DIRECTORY\s*="
    })
    if ($keystoreEntries.Count -ne 1) {
        throw "REIST_KEYSTORE_DIRECTORY muss in der .env-Datei exakt einmal vorkommen."
    }
    & (Join-Path $PSScriptRoot "check-testnet-acl.ps1") `
        -EnvironmentFile $resolvedEnvironmentFile
    $confirmation = Read-Host "Zur lokalen Freigabe exakt EXECUTE BASE SEPOLIA SMOKE eingeben"
    if ($confirmation -cne "EXECUTE BASE SEPOLIA SMOKE") {
        throw "Smoke-Test wurde nicht lokal freigegeben."
    }
    $passwordSecure = Read-Host "Gemeinsames Passwort der vier Keystores" -AsSecureString
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordSecure)
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    if ($password.Length -lt 16) {
        throw "Das Passwort muss mindestens 16 Zeichen lang sein."
    }
    $passwordBytes = [System.Text.Encoding]::Unicode.GetBytes($password)
    $passwordTransport = [Convert]::ToBase64String($passwordBytes)
    [Array]::Clear($passwordBytes, 0, $passwordBytes.Length)
    $passwordBytes = $null

    $nodeCommand = Get-Command node -ErrorAction Stop
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $nodeCommand.Source
    $startInfo.Arguments = "scripts/execute-base-sepolia-smoke.js"
    $startInfo.WorkingDirectory = $projectRoot
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $false
    $startInfo.RedirectStandardError = $false
    $startInfo.CreateNoWindow = $false
    if ($null -ne $startInfo.PSObject.Properties["StandardInputEncoding"]) {
        $startInfo.StandardInputEncoding = [System.Text.Encoding]::ASCII
    }
    $startInfo.EnvironmentVariables.Remove("TESTNET_DEPLOYER_PRIVATE_KEY")
    $startInfo.EnvironmentVariables.Remove("RESEARCH_TREASURY_PRIVATE_KEY")
    $startInfo.EnvironmentVariables.Remove("NODE_OPTIONS")
    $startInfo.EnvironmentVariables.Remove("NODE_PATH")
    $startInfo.EnvironmentVariables.Remove("REIST_SMOKE_ENV_FILE")
    if (-not [string]::IsNullOrWhiteSpace($EnvironmentFile)) {
        $startInfo.EnvironmentVariables["REIST_SMOKE_ENV_FILE"] = $resolvedEnvironmentFile
    }
    $startInfo.EnvironmentVariables["REIST_CONFIRM_BASE_SEPOLIA_SMOKE"] = "EXECUTE_EXACT_TWO_TRANSACTIONS"

    $nodeProcess = [System.Diagnostics.Process]::new()
    $nodeProcess.StartInfo = $startInfo
    if (-not $nodeProcess.Start()) {
        throw "Node-Prozess für den Smoke-Test konnte nicht gestartet werden."
    }
    $nodeProcess.StandardInput.Write($passwordTransport)
    $nodeProcess.StandardInput.Close()
    $nodeProcess.WaitForExit()
    if ($nodeProcess.ExitCode -ne 0) {
        throw "Smoke-Test ist mit Exit-Code $($nodeProcess.ExitCode) fehlgeschlagen."
    }
    Write-Host "Smoke-Test erfolgreich abgeschlossen."
} catch {
    $failure = $_
    Write-Host $_ -ForegroundColor Red
} finally {
    if ($null -ne $nodeProcess) { $nodeProcess.Dispose() }
    $password = $null
    if ($null -ne $passwordBytes) { [Array]::Clear($passwordBytes, 0, $passwordBytes.Length) }
    $passwordTransport = $null
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    if ($null -ne $passwordSecure) { $passwordSecure.Dispose() }
    if ($PauseAtEnd) { [void](Read-Host "Enter zum Schließen") }
    Pop-Location
}

if ($null -ne $failure) { throw $failure }
