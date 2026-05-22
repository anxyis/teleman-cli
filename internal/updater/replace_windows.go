//go:build windows

package updater

import (
	"fmt"
	"io"
	"os"
)

// ApplyUpdate attempts to replace the currently running executable with the new binary.
func ApplyUpdate(newExePath, currentExePath string) error {
	oldPath := currentExePath + ".old"
	
	// Remove any existing .old file from a previous update
	os.Remove(oldPath)
	
	// Rename the currently running executable to .old
	// Windows locks running executables, but allows renaming them.
	if err := os.Rename(currentExePath, oldPath); err != nil {
		return fmt.Errorf("failed to rename running executable: %w", err)
	}
	
	// Copy the downloaded binary to the original location
	if err := copyFile(newExePath, currentExePath); err != nil {
		// Rollback on failure
		os.Rename(oldPath, currentExePath)
		return fmt.Errorf("failed to copy new executable: %w", err)
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
