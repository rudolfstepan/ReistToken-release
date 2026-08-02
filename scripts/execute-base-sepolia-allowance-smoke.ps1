[CmdletBinding()]
param(
    [switch]$PauseAtEnd,
    [string]$EnvironmentFile = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function New-AllowanceNodeStartInfo {
    param(
        [Parameter(Mandatory = $true)]
        [string]$NodePath,
        [Parameter(Mandatory = $true)]
        [string]$ScriptPath,
        [Parameter(Mandatory = $true)]
        [string]$WorkingDirectory,
        [Parameter(Mandatory = $true)]
        [string]$ResolvedEnvironmentFile,
        [Parameter(Mandatory = $true)]
        [bool]$RedirectInput,
        [Parameter(Mandatory = $true)]
        [bool]$AuthorizeExecution
    )

    $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $NodePath
    $startInfo.Arguments = $ScriptPath
    $startInfo.WorkingDirectory = $WorkingDirectory
    $startInfo.UseShellExecute = $false
    $startInfo.RedirectStandardInput = $RedirectInput
    $startInfo.RedirectStandardOutput = $false
    $startInfo.RedirectStandardError = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.EnvironmentVariables.Remove("TESTNET_DEPLOYER_PRIVATE_KEY")
    $startInfo.EnvironmentVariables.Remove("RESEARCH_TREASURY_PRIVATE_KEY")
    $startInfo.EnvironmentVariables.Remove("REIST_WALLET_PASSWORD")
    $startInfo.EnvironmentVariables.Remove("MNEMONIC")
    $startInfo.EnvironmentVariables.Remove("SEED_PHRASE")
    $startInfo.EnvironmentVariables.Remove("NODE_OPTIONS")
    $startInfo.EnvironmentVariables.Remove("NODE_PATH")
    $startInfo.EnvironmentVariables.Remove("REIST_ALLOWANCE_ENV_FILE")
    if (-not [string]::IsNullOrWhiteSpace($EnvironmentFile)) {
        $startInfo.EnvironmentVariables["REIST_ALLOWANCE_ENV_FILE"] = $ResolvedEnvironmentFile
    }
    if ($AuthorizeExecution) {
        $startInfo.EnvironmentVariables["REIST_CONFIRM_BASE_SEPOLIA_ALLOWANCE"] =
            "EXECUTE_EXACT_ALLOWANCE_ROUNDTRIP"
    } else {
        $startInfo.EnvironmentVariables.Remove("REIST_CONFIRM_BASE_SEPOLIA_ALLOWANCE")
    }
    return $startInfo
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$passwordPointer = [IntPtr]::Zero
$passwordSecure = $null
$password = $null
$passwordBytes = $null
$passwordTransport = $null
$passwordTransportBytes = $null
$precheckProcess = $null
$nodeProcess = $null
$failure = $null

Push-Location -LiteralPath $projectRoot
try {
    Write-Host "REIST - vorbereiteter Base-Sepolia-Allowance-Roundtrip"
    Write-Host "1) Research Treasury erlaubt der Ecosystem Treasury exakt 1 Testnet-REIST."
    Write-Host "2) Research Treasury widerruft diese Allowance unmittelbar auf 0."
    Write-Host "Keine Tokenbewegung, kein Bounty, kein Mainnet."
    Write-Host "Konservative Pre-Broadcast-Freigabegrenze: 0,000002 Test-ETH."

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

    $nodeCommand = Get-Command node -CommandType Application -ErrorAction Stop
    $precheckStartInfo = New-AllowanceNodeStartInfo `
        -NodePath $nodeCommand.Source `
        -ScriptPath "scripts/check-base-sepolia-allowance-smoke.js" `
        -WorkingDirectory $projectRoot `
        -ResolvedEnvironmentFile $resolvedEnvironmentFile `
        -RedirectInput $false `
        -AuthorizeExecution $false
    $precheckProcess = [System.Diagnostics.Process]::new()
    $precheckProcess.StartInfo = $precheckStartInfo
    if (-not $precheckProcess.Start()) {
        throw "Read-only-Allowance-Precheck konnte nicht gestartet werden."
    }
    $precheckProcess.WaitForExit()
    if ($precheckProcess.ExitCode -ne 0) {
        throw "Read-only-Allowance-Precheck ist mit Exit-Code $($precheckProcess.ExitCode) fehlgeschlagen."
    }
    $precheckProcess.Dispose()
    $precheckProcess = $null

    $confirmation = Read-Host "Zur lokalen Freigabe exakt EXECUTE REIST ALLOWANCE SMOKE eingeben"
    if ($confirmation -cne "EXECUTE REIST ALLOWANCE SMOKE") {
        throw "Allowance-Test wurde nicht lokal freigegeben."
    }
    $passwordSecure = Read-Host "Passwort des Research-Treasury-Keystores" -AsSecureString
    $passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($passwordSecure)
    $password = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    if ($password.Length -lt 16) {
        throw "Das Passwort muss mindestens 16 Zeichen lang sein."
    }
    $passwordBytes = [System.Text.Encoding]::Unicode.GetBytes($password)
    $passwordTransport = [Convert]::ToBase64String($passwordBytes)
    [Array]::Clear($passwordBytes, 0, $passwordBytes.Length)
    $passwordBytes = $null
    $passwordTransportBytes = [System.Text.Encoding]::ASCII.GetBytes($passwordTransport)

    $startInfo = New-AllowanceNodeStartInfo `
        -NodePath $nodeCommand.Source `
        -ScriptPath "scripts/execute-base-sepolia-allowance-smoke.js" `
        -WorkingDirectory $projectRoot `
        -ResolvedEnvironmentFile $resolvedEnvironmentFile `
        -RedirectInput $true `
        -AuthorizeExecution $true
    $nodeProcess = [System.Diagnostics.Process]::new()
    $nodeProcess.StartInfo = $startInfo
    if (-not $nodeProcess.Start()) {
        throw "Node-Prozess fuer den Allowance-Test konnte nicht gestartet werden."
    }
    $inputStream = $nodeProcess.StandardInput.BaseStream
    $inputStream.Write($passwordTransportBytes, 0, $passwordTransportBytes.Length)
    $inputStream.Flush()
    $inputStream.Close()
    [Array]::Clear($passwordTransportBytes, 0, $passwordTransportBytes.Length)
    $passwordTransportBytes = $null
    $nodeProcess.WaitForExit()
    if ($nodeProcess.ExitCode -ne 0) {
        throw "Allowance-Test ist mit Exit-Code $($nodeProcess.ExitCode) fehlgeschlagen."
    }
    Write-Host "Allowance-Test erfolgreich abgeschlossen: finale Allowance 0, keine Tokenbewegung."
} catch {
    $failure = $_
    Write-Host $_ -ForegroundColor Red
} finally {
    if ($null -ne $precheckProcess) { $precheckProcess.Dispose() }
    if ($null -ne $nodeProcess) { $nodeProcess.Dispose() }
    $password = $null
    if ($null -ne $passwordBytes) { [Array]::Clear($passwordBytes, 0, $passwordBytes.Length) }
    if ($null -ne $passwordTransportBytes) {
        [Array]::Clear($passwordTransportBytes, 0, $passwordTransportBytes.Length)
    }
    $passwordTransport = $null
    if ($passwordPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
    }
    if ($null -ne $passwordSecure) { $passwordSecure.Dispose() }
    if ($PauseAtEnd) { [void](Read-Host "Enter zum Schliessen") }
    Pop-Location
}

if ($null -ne $failure) { throw $failure }
