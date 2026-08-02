[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$walletDirectory = Join-Path $env:LOCALAPPDATA "REIST\base-sepolia-wallets"
$firstPointer = [IntPtr]::Zero
$secondPointer = [IntPtr]::Zero
$firstSecure = $null
$secondSecure = $null
$password = $null
$passwordConfirmation = $null
$passwordBytes = $null
$passwordTransport = $null
$nodeProcess = $null

Push-Location -LiteralPath $projectRoot
try {
    Write-Host "REIST Base-Sepolia-Testnet-Wallet-Setup"
    Write-Host "Es werden vier unabhängige Keypairs erzeugt; vorhandene .env/Keystores werden nie überschrieben."
    $firstSecure = Read-Host "Neues Keystore-Passwort (mindestens 16 Zeichen)" -AsSecureString
    $secondSecure = Read-Host "Passwort wiederholen" -AsSecureString

    $firstPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($firstSecure)
    $secondPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secondSecure)
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($firstPointer)
    $passwordConfirmation = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secondPointer)

    if ($password.Length -lt 16) {
        throw "Das Passwort muss mindestens 16 Zeichen lang sein."
    }
    if ($password -cne $passwordConfirmation) {
        throw "Die Passwörter stimmen nicht überein."
    }
    $passwordBytes = [System.Text.Encoding]::Unicode.GetBytes($password)
    $passwordTransport = [Convert]::ToBase64String($passwordBytes)
    [Array]::Clear($passwordBytes, 0, $passwordBytes.Length)
    $passwordBytes = $null

    $nodeCommand = Get-Command node -ErrorAction Stop
    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $nodeCommand.Source
    $startInfo.Arguments = "scripts/setup-testnet-wallets.js"
    $startInfo.WorkingDirectory = $projectRoot
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $false
    $startInfo.RedirectStandardError = $false
    $startInfo.CreateNoWindow = $false
    if ($null -ne $startInfo.PSObject.Properties["StandardInputEncoding"]) {
        $startInfo.StandardInputEncoding = [System.Text.Encoding]::ASCII
    }
    $startInfo.EnvironmentVariables.Remove("REIST_WALLET_PASSWORD")
    $startInfo.EnvironmentVariables["REIST_CONFIRM_TESTNET_WALLET_SETUP"] = "CREATE"
    $startInfo.EnvironmentVariables["REIST_KEYSTORE_DIRECTORY"] = $walletDirectory

    $nodeProcess = [System.Diagnostics.Process]::new()
    $nodeProcess.StartInfo = $startInfo
    if (-not $nodeProcess.Start()) {
        throw "Node-Prozess für das Wallet-Setup konnte nicht gestartet werden."
    }
    $nodeProcess.StandardInput.Write($passwordTransport)
    $nodeProcess.StandardInput.Close()
    $nodeProcess.WaitForExit()
    if ($nodeProcess.ExitCode -ne 0) {
        throw "Wallet-Setup ist mit Exit-Code $($nodeProcess.ExitCode) fehlgeschlagen."
    }

    & (Join-Path $PSScriptRoot "check-testnet-acl.ps1") -Repair
} finally {
    if ($null -ne $nodeProcess) {
        $nodeProcess.Dispose()
    }
    $password = $null
    $passwordConfirmation = $null
    if ($null -ne $passwordBytes) {
        [Array]::Clear($passwordBytes, 0, $passwordBytes.Length)
    }
    $passwordTransport = $null
    if ($firstPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($firstPointer)
    }
    if ($secondPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secondPointer)
    }
    if ($null -ne $firstSecure) {
        $firstSecure.Dispose()
    }
    if ($null -ne $secondSecure) {
        $secondSecure.Dispose()
    }
    Pop-Location
}
