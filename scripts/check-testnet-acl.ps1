[CmdletBinding()]
param(
    [switch]$Repair,
    [string]$WalletDirectory = "",
    [string]$EnvironmentFile = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Test-PathWithin {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Candidate,
        [Parameter(Mandatory = $true)]
        [string]$Parent
    )

    $normalizedCandidate = [IO.Path]::GetFullPath($Candidate).TrimEnd('\')
    $normalizedParent = [IO.Path]::GetFullPath($Parent).TrimEnd('\')
    return $normalizedCandidate.Equals(
        $normalizedParent,
        [StringComparison]::OrdinalIgnoreCase
    ) -or $normalizedCandidate.StartsWith(
        "${normalizedParent}\",
        [StringComparison]::OrdinalIgnoreCase
    )
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$environmentPath = if ([string]::IsNullOrWhiteSpace($EnvironmentFile)) {
    Join-Path $projectRoot ".env"
} else {
    [IO.Path]::GetFullPath($EnvironmentFile)
}
$configuredWalletDirectory = [IO.Path]::GetFullPath(
    (Join-Path $env:LOCALAPPDATA "REIST\base-sepolia-wallets")
)
$usesConfiguredWalletDirectory = [string]::IsNullOrWhiteSpace($WalletDirectory)
$checksEnvironmentFile = $usesConfiguredWalletDirectory -or -not [string]::IsNullOrWhiteSpace($EnvironmentFile)
$targetWalletDirectory = if ($usesConfiguredWalletDirectory) {
    $configuredWalletDirectory
} else {
    [IO.Path]::GetFullPath($WalletDirectory)
}
$windowsIdentity = $null

if (-not (Test-Path -LiteralPath $targetWalletDirectory -PathType Container)) {
    throw "Lokales Keystore-Verzeichnis fehlt."
}
$targetDirectoryItem = Get-Item -LiteralPath $targetWalletDirectory -Force
if (
    ($targetDirectoryItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
) {
    throw "Keystore-Verzeichnis darf kein symbolischer Link oder Junction sein."
}
$expectedWalletFiles = @(
    "addresses.json",
    "deployer.keystore.json",
    "ecosystem-treasury.keystore.json",
    "founder-beneficiary.keystore.json",
    "RECOVERY.txt",
    "research-treasury.keystore.json"
)
$optionalWalletFiles = @(
    ".base-sepolia-smoke-transfer.journal.json",
    ".base-sepolia-allowance-roundtrip.journal.json"
)
$walletFiles = @(
    Get-ChildItem -LiteralPath $targetWalletDirectory -File -Force |
        Sort-Object Name
)
$walletDirectories = @(
    Get-ChildItem -LiteralPath $targetWalletDirectory -Directory -Force
)
if (
    $walletDirectories.Count -ne 0 -or
    (Compare-Object -ReferenceObject $expectedWalletFiles -DifferenceObject @($walletFiles.Name | Where-Object { $_ -notin $optionalWalletFiles })) -or
    @($walletFiles | Where-Object { $_.Name -notin ($expectedWalletFiles + $optionalWalletFiles) }).Count -ne 0 -or
    @($walletFiles | Where-Object {
        ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
    }).Count -ne 0
) {
    throw "Keystore-Verzeichnis besitzt nicht den erwarteten sicheren Inhalt."
}
if (-not $usesConfiguredWalletDirectory) {
    $targetRoot = [IO.Path]::GetPathRoot($targetWalletDirectory)
    if (
        $targetWalletDirectory.TrimEnd('\').Equals(
            $targetRoot.TrimEnd('\'),
            [StringComparison]::OrdinalIgnoreCase
        ) -or
        (Test-PathWithin -Candidate $targetWalletDirectory -Parent $projectRoot) -or
        (Test-PathWithin -Candidate $projectRoot -Parent $targetWalletDirectory) -or
        (Test-PathWithin -Candidate $configuredWalletDirectory -Parent $targetWalletDirectory)
    ) {
        throw "Externer Keystore-Pfad ist fuer eine ACL-Aenderung zu weit gefasst."
    }
}
if ($checksEnvironmentFile) {
    if (-not (Test-Path -LiteralPath $environmentPath -PathType Leaf)) {
        throw "Lokale .env-Konfiguration fehlt."
    }
    $environmentItem = Get-Item -LiteralPath $environmentPath -Force
    if (($environmentItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Lokale .env-Konfiguration darf kein symbolischer Link sein."
    }
}
if ($usesConfiguredWalletDirectory) {
    $keystoreEntry = Get-Content -LiteralPath $environmentPath -Encoding UTF8 | Where-Object {
        $_ -match "^\s*(?:export\s+)?REIST_KEYSTORE_DIRECTORY\s*="
    } | Select-Object -First 1
    if (-not $keystoreEntry) {
        throw "REIST_KEYSTORE_DIRECTORY fehlt in .env."
    }
    $configuredDirectory = ($keystoreEntry -replace "^\s*(?:export\s+)?REIST_KEYSTORE_DIRECTORY\s*=\s*", "").Trim().Trim('"').Trim("'")
    if ([IO.Path]::GetFullPath($configuredDirectory) -ne $configuredWalletDirectory) {
        throw "Konfiguriertes Keystore-Verzeichnis weicht vom geschuetzten Standardpfad ab."
    }
}

try {
    $windowsIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
    $currentSid = $windowsIdentity.User.Value

    if ($Repair) {
        $icaclsCommand = Get-Command icacls.exe -ErrorAction Stop
        $sidGrant = "*${currentSid}:F"
        & $icaclsCommand.Source $targetWalletDirectory "/inheritance:r" "/grant:r" $sidGrant "/T" "/Q"
        if ($LASTEXITCODE -ne 0) {
            throw "Windows-Zugriffsrechte des Keystore-Verzeichnisses konnten nicht repariert werden."
        }
        if ($checksEnvironmentFile) {
            & $icaclsCommand.Source $environmentPath "/inheritance:r" "/grant:r" $sidGrant "/Q"
            if ($LASTEXITCODE -ne 0) {
                throw "Windows-Zugriffsrechte der lokalen .env konnten nicht repariert werden."
            }
        }
    }

    $targets = @(
        Get-Item -LiteralPath $targetWalletDirectory
    ) + @(Get-ChildItem -LiteralPath $targetWalletDirectory -Recurse -Force)
    if ($checksEnvironmentFile) {
        $targets = @(Get-Item -LiteralPath $environmentPath) + $targets
    }

    foreach ($target in $targets) {
        if ($target.PSIsContainer) {
            $acl = [System.IO.Directory]::GetAccessControl($target.FullName)
        } else {
            $acl = [System.IO.File]::GetAccessControl($target.FullName)
        }
        if (-not $acl.AreAccessRulesProtected -and $target.Name -notin $optionalWalletFiles) {
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
            throw "Aktuelles Benutzerkonto besitzt keine vollstaendige Freigabe: $($target.Name)."
        }
    }

    Write-Host "Windows-Zugriffsrechte sind exklusiv auf das aktuelle Benutzerkonto beschraenkt."
} finally {
    if ($null -ne $windowsIdentity) {
        $windowsIdentity.Dispose()
    }
}
