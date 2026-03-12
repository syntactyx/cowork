function Get-GitOverview {
    if (-not (Test-Path .git) -and (git rev-parse --git-dir 2>$null) -eq $null) {
        Write-Host "Not a git repository." -ForegroundColor Red
        return
    }

    Write-Host "`n=== REMOTES ===" -ForegroundColor Cyan
    git remote -v

    Write-Host "`n=== BRANCH ===" -ForegroundColor Cyan
    git branch -vv

    Write-Host "`n=== STATUS ===" -ForegroundColor Cyan
    git status -s

    Write-Host "`n=== RECENT COMMITS ===" -ForegroundColor Cyan
    git log --oneline --graph --all --decorate -15

    Write-Host "`n=== LAST COMMIT ===" -ForegroundColor Cyan
    git show --stat

    Write-Host "`n=== CHANGES SINCE PREVIOUS COMMIT ===" -ForegroundColor Cyan
    git diff --stat HEAD~1

    $stashes = git stash list
    if ($stashes) {
        Write-Host "`n=== STASHES ===" -ForegroundColor Cyan
        $stashes
    }
}

if ($MyInvocation.InvocationName -ne '.') {
    Get-GitOverview
}