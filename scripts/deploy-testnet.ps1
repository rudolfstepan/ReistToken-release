[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$passwordPointer = [IntPtr]::Zero
$passwordSecure = $null
$password = $null
$passwordBytes = $null
$passwordTransport = $null
$nodeProcess = $null

Push-Location -LiteralPath $projectRoot
try {
    Write-Host "REIST Research Token - Base-Sepolia-Deployment"
    Write-Host "Dieser Vorgang sendet nach den Vorprüfungen eine echte Testnet-Transaktion."
    & (Join-Path $PSScriptRoot "check-testnet-acl.ps1")
    & node "scripts/check-testnet-config.js" "--wallets" "--rpc"
    if ($LASTEXITCODE -ne 0) {
        throw "Öffentliche Testnet-Vorprüfung ist fehlgeschlagen."
    }
    & node "scripts/estimate-testnet-deployment.js"
    if ($LASTEXITCODE -ne 0) {
        throw "Deployment-Kostenschätzung ist fehlgeschlagen oder die Reserve reicht nicht."
    }
    $confirmation = Read-Host "Zur Freigabe exakt DEPLOY BASE SEPOLIA eingeben"
    if ($confirmation -cne "DEPLOY BASE SEPOLIA") {
        throw "Deployment wurde nicht freigegeben."
    }
    $passwordSecure = Read-Host "Bestehendes Keystore-Passwort" -AsSecureString
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
    $startInfo.Arguments = "scripts/deploy-testnet.js"
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
    $startInfo.EnvironmentVariables["REIST_CONFIRM_BASE_SEPOLIA_DEPLOY"] = "DEPLOY"

    $nodeProcess = [System.Diagnostics.Process]::new()
    $nodeProcess.StartInfo = $startInfo
    if (-not $nodeProcess.Start()) {
        throw "Node-Prozess für das Deployment konnte nicht gestartet werden."
    }
    $nodeProcess.StandardInput.Write($passwordTransport)
    $nodeProcess.StandardInput.Close()
    $nodeProcess.WaitForExit()
    if ($nodeProcess.ExitCode -ne 0) {
        throw "Deployment ist mit Exit-Code $($nodeProcess.ExitCode) fehlgeschlagen."
    }
} finally {
    if ($null -ne $nodeProcess) {
        $nodeProcess.Dispose()
    }
    $password = $null
    if ($null -ne $passwordBytes) {
        [Array]::Clear($passwordBytes, 0, $passwordBytes.Length)
    }
    $passwordTransport = $null
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    if ($null -ne $passwordSecure) {
        $passwordSecure.Dispose()
    }
    Pop-Location
}
