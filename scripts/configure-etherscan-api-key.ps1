[CmdletBinding()]
param(
    [string]$EnvironmentPath = "",
    [string]$MirrorEnvironmentPath = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$apiKey = $null
$clipboardValue = $null
$environmentContent = $null
$storedContent = $null
$updatedContent = $null
$mirrorPath = $null
$completed = $false
$utf8NoBom = [System.Text.UTF8Encoding]::new($false)

function Assert-GitIgnored {
    param([Parameter(Mandatory = $true)][string]$Path)

    $absolutePath = [System.IO.Path]::GetFullPath($Path)
    $directory = Split-Path -Parent $absolutePath
    $repositoryRoot = (& git -C $directory rev-parse --show-toplevel 2>$null)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($repositoryRoot)) {
        throw "Ziel-.env liegt nicht in einem Git-Repository."
    }
    $repositoryRoot = [System.IO.Path]::GetFullPath($repositoryRoot.Trim())
    $rootPrefix = $repositoryRoot.TrimEnd("\", "/") + [System.IO.Path]::DirectorySeparatorChar
    if (-not $absolutePath.StartsWith(
        $rootPrefix,
        [System.StringComparison]::OrdinalIgnoreCase
    )) {
        throw "Ziel-.env liegt ausserhalb des ermittelten Git-Repositorys."
    }
    $relativePath = $absolutePath.Substring($rootPrefix.Length).Replace("\", "/")
    & git -C $repositoryRoot ls-files --error-unmatch -- $relativePath 2>$null | Out-Null
    $trackedStatus = $LASTEXITCODE
    if ($trackedStatus -eq 0) {
        throw "Ziel-.env wird bereits von Git verfolgt und darf kein Secret erhalten."
    }
    if ($trackedStatus -ne 1) {
        throw "Git-Trackingstatus der Ziel-.env konnte nicht sicher bestimmt werden."
    }
    & git -C $repositoryRoot check-ignore --quiet --no-index -- $relativePath
    if ($LASTEXITCODE -ne 0) {
        throw "Ziel-.env ist nicht durch die Repository-.gitignore geschuetzt."
    }
}

function Get-ExclusiveEnvironmentAcl {
    param([Parameter(Mandatory = $true)][string]$Path)

    $absolutePath = [System.IO.Path]::GetFullPath($Path)
    $item = Get-Item -LiteralPath $absolutePath -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw ".env darf kein symbolischer Link oder Junction sein."
    }
    $acl = [System.IO.File]::GetAccessControl($absolutePath)
    if (-not $acl.AreAccessRulesProtected) {
        throw ".env besitzt noch vererbte Zugriffsrechte."
    }

    $identity = $null
    try {
        $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
        $currentSid = $identity.User.Value
        $hasCurrentUserFullControl = $false
        $accessRules = $acl.GetAccessRules(
            $true,
            $true,
            [System.Security.Principal.SecurityIdentifier]
        )
        foreach ($rule in $accessRules) {
            if ($rule.AccessControlType -ne "Allow") { continue }
            if ($rule.IdentityReference.Value -ne $currentSid) {
                throw ".env besitzt eine unerwartete ACL-Freigabe."
            }
            if (
                ($rule.FileSystemRights -band
                    [System.Security.AccessControl.FileSystemRights]::FullControl) -eq
                [System.Security.AccessControl.FileSystemRights]::FullControl
            ) {
                $hasCurrentUserFullControl = $true
            }
        }
        if (-not $hasCurrentUserFullControl) {
            throw "Aktuelles Benutzerkonto besitzt keine vollstaendige .env-Freigabe."
        }
    }
    finally {
        if ($null -ne $identity) { $identity.Dispose() }
    }
    return $acl
}

function Write-SecureEnvironmentFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Content,
        [Parameter(Mandatory = $true)]$AccessControl
    )

    $absolutePath = [System.IO.Path]::GetFullPath($Path)
    $directory = Split-Path -Parent $absolutePath
    if (-not (Test-Path -LiteralPath $directory -PathType Container)) {
        throw "Zielverzeichnis fuer .env fehlt."
    }
    if (Test-Path -LiteralPath $absolutePath -PathType Leaf) {
        [void](Get-ExclusiveEnvironmentAcl -Path $absolutePath)
    }
    $temporaryPath = Join-Path $directory (
        ".env.{0}.tmp" -f [guid]::NewGuid().ToString("N")
    )
    try {
        Assert-GitIgnored -Path $temporaryPath
        $temporaryStream = [System.IO.File]::Open(
            $temporaryPath,
            [System.IO.FileMode]::CreateNew,
            [System.IO.FileAccess]::Write,
            [System.IO.FileShare]::None
        )
        $temporaryStream.Dispose()
        Set-Acl -LiteralPath $temporaryPath -AclObject $AccessControl
        [System.IO.File]::WriteAllText($temporaryPath, $Content, $utf8NoBom)
        Move-Item `
            -LiteralPath $temporaryPath `
            -Destination $absolutePath `
            -Force
    }
    finally {
        if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) {
            Remove-Item -LiteralPath $temporaryPath -Force
        }
    }
}

try {
    if ([string]::IsNullOrWhiteSpace($EnvironmentPath)) {
        $EnvironmentPath = Join-Path (Split-Path -Parent $PSScriptRoot) ".env"
    }
    $primaryPath = [System.IO.Path]::GetFullPath($EnvironmentPath)
    if (-not (Test-Path -LiteralPath $primaryPath -PathType Leaf)) {
        throw "Lokale .env-Konfiguration fehlt."
    }
    Assert-GitIgnored -Path $primaryPath
    $primaryAcl = Get-ExclusiveEnvironmentAcl -Path $primaryPath

    if (-not [string]::IsNullOrWhiteSpace($MirrorEnvironmentPath)) {
        $mirrorPath = [System.IO.Path]::GetFullPath($MirrorEnvironmentPath)
        if ($mirrorPath -eq $primaryPath) {
            throw "Spiegel-.env muss von der primaeren .env verschieden sein."
        }
        $mirrorDirectory = Split-Path -Parent $mirrorPath
        if (-not (Test-Path -LiteralPath $mirrorDirectory -PathType Container)) {
            throw "Zielverzeichnis der Spiegel-.env fehlt."
        }
        Assert-GitIgnored -Path $mirrorPath
        if (Test-Path -LiteralPath $mirrorPath -PathType Leaf) {
            [void](Get-ExclusiveEnvironmentAcl -Path $mirrorPath)
        }
    }

    $clipboardValue = Get-Clipboard -Raw
    if ($null -eq $clipboardValue) {
        throw "Zwischenablage enthaelt keinen Etherscan-API-Schluessel."
    }
    $apiKey = $clipboardValue.Trim()
    if ($apiKey -notmatch "^[A-Za-z0-9_-]{20,128}$") {
        throw "Zwischenablage enthaelt keinen plausiblen Etherscan-API-Schluessel."
    }

    $environmentContent = [System.IO.File]::ReadAllText(
        $primaryPath,
        [System.Text.Encoding]::UTF8
    )
    $forbiddenVariablePattern =
        "(?im)^\s*(?:export\s+)?(?:TESTNET_DEPLOYER_PRIVATE_KEY|REIST_WALLET_PASSWORD|MNEMONIC|SEED_PHRASE)\s*="
    if ($environmentContent -match $forbiddenVariablePattern) {
        throw ".env enthaelt eine Variable, die nicht gespiegelt werden darf."
    }
    $allowedVariables = [System.Collections.Generic.HashSet[string]]::new(
        [System.StringComparer]::Ordinal
    )
    foreach ($name in @(
        "TESTNET_DEPLOYER_ADDRESS",
        "REIST_KEYSTORE_DIRECTORY",
        "BASE_SEPOLIA_RPC_URL",
        "FOUNDER_BENEFICIARY",
        "RESEARCH_REWARDS_TREASURY",
        "ECOSYSTEM_TREASURY",
        "ETHERSCAN_API_KEY",
        "REIST_PAPER_DOI"
    )) {
        [void]$allowedVariables.Add($name)
    }
    foreach ($line in ($environmentContent -split "\r?\n")) {
        if ($line -match "^\s*$" -or $line -match "^\s*#") { continue }
        $assignment = [regex]::Match(
            $line,
            "^\s*(?:export\s+)?([A-Za-z0-9_.-]+)(?:\s*=|:\s+)"
        )
        if (-not $assignment.Success) {
            throw ".env enthaelt eine nicht eindeutig pruefbare Zeile."
        }
        if (-not $allowedVariables.Contains($assignment.Groups[1].Value)) {
            throw ".env enthaelt eine nicht freigegebene Variable und wird nicht gespiegelt."
        }
    }
    $keyPattern = [regex]::new(
        "(?im)^\s*(?:export\s+)?ETHERSCAN_API_KEY\s*=.*$"
    )
    if ($keyPattern.Matches($environmentContent).Count -ne 1) {
        throw ".env muss genau eine ETHERSCAN_API_KEY-Zeile enthalten."
    }
    $updatedContent = $keyPattern.Replace(
        $environmentContent,
        [System.Text.RegularExpressions.MatchEvaluator]{
            param($match)
            return "ETHERSCAN_API_KEY=$apiKey"
        },
        1
    )

    Write-SecureEnvironmentFile `
        -Path $primaryPath `
        -Content $updatedContent `
        -AccessControl $primaryAcl

    if ($null -ne $mirrorPath) {
        Write-SecureEnvironmentFile `
            -Path $mirrorPath `
            -Content $updatedContent `
            -AccessControl $primaryAcl
    }

    foreach ($path in @($primaryPath, $mirrorPath)) {
        if ([string]::IsNullOrWhiteSpace($path)) { continue }
        $storedContent = [System.IO.File]::ReadAllText(
            $path,
            [System.Text.Encoding]::UTF8
        )
        $storedKeyMatches = [regex]::Matches(
            $storedContent,
            "(?m)^ETHERSCAN_API_KEY=([A-Za-z0-9_-]{20,128})$"
        )
        if (
            $storedKeyMatches.Count -ne 1 -or
            $storedKeyMatches[0].Groups[1].Value -cne $apiKey
        ) {
            throw "Gespeicherter Etherscan-API-Schluessel konnte nicht bestaetigt werden."
        }
        [void](Get-ExclusiveEnvironmentAcl -Path $path)
    }

    Set-Clipboard -Value " "
    $completed = $true
    Write-Host "Etherscan-API-Schluessel lokal gespeichert; Zwischenablage geleert."
}
finally {
    $apiKey = $null
    $clipboardValue = $null
    $environmentContent = $null
    $storedContent = $null
    $updatedContent = $null
    if (-not $completed) {
        Write-Warning "Zwischenablage wurde wegen des Fehlers nicht veraendert."
    }
}
