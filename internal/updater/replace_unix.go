//go:build !windows

package updater

import (
	"fmt"
	"io"
	"os"
	"os/exec"
)

// ApplyUpdate attempts to replace the currently running executable with the new binary.
func ApplyUpdate(newExePath, currentExePath string) error {
	tmpExePath := currentExePath + ".tmp"
	
	// Copy to the same filesystem first to avoid "text file busy" and EXDEV cross-device links
	if err := copyFile(newExePath, tmpExePath); err != nil {
		if os.IsPermission(err) {
			// Permission denied. Attempting to use sudo to install...
			installScript := fmt.Sprintf("cp %s %s && chmod 755 %s && mv %s %s", newExePath, tmpExePath, tmpExePath, tmpExePath, currentExePath)
			sudoCmd := exec.Command("sudo", "sh", "-c", installScript)
			sudoCmd.Stdin = os.Stdin
			sudoCmd.Stdout = os.Stdout
			sudoCmd.Stderr = os.Stderr
			if err := sudoCmd.Run(); err != nil {
				return fmt.Errorf("sudo installation failed: %w", err)
			}
			return nil
		}
		return fmt.Errorf("failed to copy update to destination filesystem: %w", err)
	}
	
	// Set executable permissions on the tmp file
	if err := os.Chmod(tmpExePath, 0755); err != nil {
		os.Remove(tmpExePath)
		return fmt.Errorf("failed to set executable permissions: %w", err)
	}
	
	// Atomically replace the running executable
	if err := os.Rename(tmpExePath, currentExePath); err != nil {
		os.Remove(tmpExePath)
		return fmt.Errorf("failed to atomically replace executable: %w", err)
	}
	
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, in)
	return err
}
