[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$DestinationDirectory
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

function Get-Sha256Hex {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path
    )

    $stream = $null
    $sha256 = $null
    try {
        $stream = [IO.File]::OpenRead($Path)
        $sha256 = [Security.Cryptography.SHA256]::Create()
        return [BitConverter]::ToString(
            $sha256.ComputeHash($stream)
        ).Replace("-", "")
    } finally {
        if ($null -ne $sha256) {
            $sha256.Dispose()
        }
        if ($null -ne $stream) {
            $stream.Dispose()
        }
    }
}

$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$sourceDirectory = [IO.Path]::GetFullPath(
    (Join-Path $env:LOCALAPPDATA "REIST\base-sepolia-wallets")
)
$destination = [IO.Path]::GetFullPath($DestinationDirectory)
$destinationCreated = $false
$expectedFiles = @(
    "addresses.json",
    "deployer.keystore.json",
    "ecosystem-treasury.keystore.json",
    "founder-beneficiary.keystore.json",
    "RECOVERY.txt",
    "research-treasury.keystore.json"
)

if (-not [IO.Path]::IsPathRooted($DestinationDirectory)) {
    throw "Der Sicherungspfad muss absolut sein."
}
if (-not (Test-Path -LiteralPath $sourceDirectory -PathType Container)) {
    throw "Das geschuetzte lokale Keystore-Verzeichnis fehlt."
}
if (Test-Path -LiteralPath $destination) {
    throw "Der Sicherungspfad existiert bereits; vorhandene Sicherungen werden niemals ueberschrieben."
}
if (
    (Test-PathWithin -Candidate $destination -Parent $sourceDirectory) -or
    (Test-PathWithin -Candidate $sourceDirectory -Parent $destination) -or
    (Test-PathWithin -Candidate $destination -Parent $projectRoot)
) {
    throw "Der Sicherungspfad muss ausserhalb von Quelle und Repository liegen."
}
if (
    [IO.Path]::GetPathRoot($sourceDirectory).Equals(
        [IO.Path]::GetPathRoot($destination),
        [StringComparison]::OrdinalIgnoreCase
    )
) {
    throw "Quelle und Sicherung muessen auf unterschiedlichen Laufwerken liegen."
}
$destinationRoot = [IO.Path]::GetPathRoot($destination)
if ($destinationRoot -match "^[A-Za-z]:\\$") {
    $destinationDrive = [IO.DriveInfo]::new($destinationRoot)
    if (-not $destinationDrive.IsReady) {
        throw "Das Sicherungslaufwerk ist nicht bereit."
    }
    if ($destinationDrive.DriveFormat -notin @("NTFS", "ReFS")) {
        throw "Das Sicherungslaufwerk muss NTFS oder ReFS mit Windows-ACLs verwenden."
    }
}

$sourceFiles = @(
    Get-ChildItem -LiteralPath $sourceDirectory -File -Force |
        Sort-Object Name
)
$sourceDirectories = @(
    Get-ChildItem -LiteralPath $sourceDirectory -Directory -Force
)
if (
    $sourceDirectories.Count -ne 0 -or
    $sourceFiles.Count -ne $expectedFiles.Count -or
    (Compare-Object -ReferenceObject $expectedFiles -DifferenceObject @($sourceFiles.Name))
) {
    throw "Das Keystore-Verzeichnis besitzt nicht den erwarteten Inhalt."
}

& (Join-Path $PSScriptRoot "check-testnet-acl.ps1")

try {
    $null = New-Item -ItemType Directory -Path $destination -Force:$false
    $destinationCreated = $true
    foreach ($sourceFile in $sourceFiles) {
        Copy-Item -LiteralPath $sourceFile.FullName -Destination (
            Join-Path $destination $sourceFile.Name
        )
    }

    & (Join-Path $PSScriptRoot "check-testnet-acl.ps1") `
        -WalletDirectory $destination `
        -Repair

    foreach ($sourceFile in $sourceFiles) {
        $backupPath = Join-Path $destination $sourceFile.Name
        $sourceHash = Get-Sha256Hex -Path $sourceFile.FullName
        $backupHash = Get-Sha256Hex -Path $backupPath
        if ($sourceHash -ne $backupHash) {
            throw "Hashpruefung der Keystore-Sicherung ist fehlgeschlagen."
        }
    }

    Write-Host "Verschluesselte Wallet-Sicherung wurde bytegenau geprueft."
    Write-Host "Sicherung: $destination"
    Write-Host "Als Naechstes Recovery direkt aus dieser Sicherung pruefen."
} catch {
    if ($destinationCreated -and (Test-Path -LiteralPath $destination)) {
        Remove-Item -LiteralPath $destination -Recurse -Force
    }
    throw
}
