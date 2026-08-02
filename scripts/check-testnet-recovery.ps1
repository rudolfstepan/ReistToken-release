[CmdletBinding()]
param(
    [string]$WalletDirectory = ""
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

Push-Location -LiteralPath $projectRoot
try {
    Write-Host "REIST Base-Sepolia-Keystore-Recovery-Test"
    Write-Host "Alle vier Keystores werden lokal entschlüsselt; private Schlüssel werden nicht ausgegeben."
    & (Join-Path $PSScriptRoot "check-testnet-acl.ps1")
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
    $startInfo.Arguments = "scripts/check-testnet-config.js --wallets --recovery"
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
    $startInfo.EnvironmentVariables["REIST_CONFIRM_TESTNET_RECOVERY"] = "CHECK"
    if ($WalletDirectory) {
        $startInfo.EnvironmentVariables["REIST_RECOVERY_WALLET_DIRECTORY"] = [IO.Path]::GetFullPath($WalletDirectory)
    } else {
        $startInfo.EnvironmentVariables.Remove("REIST_RECOVERY_WALLET_DIRECTORY")
    }

    $nodeProcess = [System.Diagnostics.Process]::new()
    $nodeProcess.StartInfo = $startInfo
    if (-not $nodeProcess.Start()) {
        throw "Node-Prozess für den Recovery-Test konnte nicht gestartet werden."
    }
    $nodeProcess.StandardInput.Write($passwordTransport)
    $nodeProcess.StandardInput.Close()
    $nodeProcess.WaitForExit()
    if ($nodeProcess.ExitCode -ne 0) {
        throw "Recovery-Test ist mit Exit-Code $($nodeProcess.ExitCode) fehlgeschlagen."
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
