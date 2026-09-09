[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = "Select the personal library folder to scan"
$f.ShowNewFolderButton = $false
if ($f.ShowDialog() -eq 'OK') { Write-Output $f.SelectedPath }
