[CmdletBinding()]
param(
    [switch]$Repair
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = Join-Path $projectRoot ".env"
$walletDirectory = [IO.Path]::GetFullPath(
    (Join-Path $env:LOCALAPPDATA "REIST\base-sepolia-wallets")
)
$windowsIdentity = $null

if (-not (Test-Path -LiteralPath $walletDirectory -PathType Container)) {
    throw "Lokales Keystore-Verzeichnis fehlt."
}
if (-not (Test-Path -LiteralPath $environmentPath -PathType Leaf)) {
    throw "Lokale .env-Konfiguration fehlt."
}
$keystoreEntry = Get-Content -LiteralPath $environmentPath | Where-Object {
    $_ -match "^\s*REIST_KEYSTORE_DIRECTORY\s*="
} | Select-Object -First 1
if (-not $keystoreEntry) {
    throw "REIST_KEYSTORE_DIRECTORY fehlt in .env."
}
$configuredDirectory = ($keystoreEntry -replace "^\s*REIST_KEYSTORE_DIRECTORY\s*=\s*", "").Trim().Trim('"').Trim("'")
if (
    [IO.Path]::GetFullPath($configuredDirectory) -ne $walletDirectory
) {
    throw "Konfiguriertes Keystore-Verzeichnis weicht vom geschützten Standardpfad ab."
}

try {
    $windowsIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $currentSid = $windowsIdentity.User.Value

    if ($Repair) {
        $icaclsCommand = Get-Command icacls.exe -ErrorAction Stop
        $sidGrant = "*${currentSid}:F"
        & $icaclsCommand.Source $walletDirectory "/inheritance:r" "/grant:r" $sidGrant "/T" "/Q"
        if ($LASTEXITCODE -ne 0) {
            throw "Windows-Zugriffsrechte des Keystore-Verzeichnisses konnten nicht repariert werden."
        }
        & $icaclsCommand.Source $environmentPath "/inheritance:r" "/grant:r" $sidGrant "/Q"
        if ($LASTEXITCODE -ne 0) {
            throw "Windows-Zugriffsrechte der lokalen .env konnten nicht repariert werden."
        }
    }

    $targets = @(
        Get-Item -LiteralPath $environmentPath
        Get-Item -LiteralPath $walletDirectory
    ) + @(Get-ChildItem -LiteralPath $walletDirectory -Recurse -Force)

    foreach ($target in $targets) {
        if ($target.PSIsContainer) {
            $acl = [System.IO.Directory]::GetAccessControl($target.FullName)
        } else {
            $acl = [System.IO.File]::GetAccessControl($target.FullName)
        }
        if (-not $acl.AreAccessRulesProtected) {
            throw "ACL-Vererbung ist aktiv: $($target.Name)."
        }
        $hasCurrentUserFullControl = $false
        $accessRules = $acl.GetAccessRules(
            $true,
            $true,
            [System.Security.Principal.SecurityIdentifier]
        )
        foreach ($rule in $accessRules) {
            if ($rule.AccessControlType -ne "Allow") {
                continue
            }
            $ruleSid = $rule.IdentityReference.Value
            if ($ruleSid -ne $currentSid) {
                throw "Unerwartete ACL-Freigabe: $($target.Name)."
            }
            if (
                ($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -eq
                [System.Security.AccessControl.FileSystemRights]::FullControl
            ) {
                $hasCurrentUserFullControl = $true
            }
        }
        if (-not $hasCurrentUserFullControl) {
            throw "Aktuelles Benutzerkonto besitzt keine vollständige Freigabe: $($target.Name)."
        }
    }

    Write-Host "Windows-Zugriffsrechte sind exklusiv auf das aktuelle Benutzerkonto beschränkt."
} finally {
    if ($null -ne $windowsIdentity) {
        $windowsIdentity.Dispose()
    }
}
