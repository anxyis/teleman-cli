package core

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"github.com/AlecAivazis/survey/v2"
	"github.com/teleman-cli/teleman/internal/logger"
)

// RunInstall handles the self-installation of the teleman executable
func RunInstall() error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("failed to detect current executable path: %v", err)
	}

	logger.Step("=> Starting Teleman Self-Installer...")

	if runtime.GOOS == "windows" {
		return installWindows(exePath)
	}

	// Termux check
	if prefix := os.Getenv("PREFIX"); strings.Contains(prefix, "com.termux") {
		return installTermux(exePath, prefix)
	}

	// Default Linux
	return installLinux(exePath)
}

func copyExecutable(src, dest string) error {
	// Ensure dest directory exists
	if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
		return err
	}

	// If the file is currently running we might not be able to overwrite it easily on Windows,
	// but since we usually run teleman from a build folder, copying it to ~/.teleman/bin is fine.
	sourceFileStat, err := os.Stat(src)
	if err != nil {
		return err
	}

	if !sourceFileStat.Mode().IsRegular() {
		return fmt.Errorf("%s is not a regular file", src)
	}

	source, err := os.Open(src)
	if err != nil {
		return err
	}
	defer source.Close()

	// Remove target if exists to prevent "text file busy" overwrite issues
	os.Remove(dest)

	destination, err := os.OpenFile(dest, os.O_RDWR|os.O_CREATE|os.O_TRUNC, sourceFileStat.Mode())
	if err != nil {
		return err
	}
	defer destination.Close()

	if _, err := io.Copy(destination, source); err != nil {
		return err
	}
	return nil
}

func askPermission(promptMsg string) (bool, error) {
	fmt.Println()
	logger.Warn(promptMsg)
	confirm := false
	prompt := &survey.Confirm{
		Message: "Proceed with system modification?",
		Default: true,
	}
	err := survey.AskOne(prompt, &confirm)
	return confirm, err
}

func installWindows(exePath string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	binDir := filepath.Join(home, ".teleman", "bin")
	targetExe := filepath.Join(binDir, "teleman.exe")

	logger.Info("Target binary path: %s", targetExe)
	if err := copyExecutable(exePath, targetExe); err != nil {
		return fmt.Errorf("copy failed: %v", err)
	}
	logger.Success("Binary copied successfully.")

	// Check PATH
	pathEnvRaw, err := exec.Command("powershell", "-NoProfile", "-Command", "[Environment]::GetEnvironmentVariable('Path', 'User')").Output()
	if err != nil {
		return fmt.Errorf("failed to read User PATH: %v", err)
	}

	pathEnv := strings.TrimSpace(string(pathEnvRaw))
	if strings.Contains(strings.ToLower(pathEnv), strings.ToLower(binDir)) {
		logger.Success("Directory already in PATH. You are good to go!")
		return nil
	}

	msg := fmt.Sprintf("Teleman needs to add '%s' to your User PATH Registry.\nThis requires editing your Windows User Environment Variables.", binDir)
	proceed, err := askPermission(msg)
	if err != nil || !proceed {
		logger.Info("PATH modification skipped. You will need to add %s to your PATH manually.", binDir)
		return nil
	}

	// Append PATH
	newPath := pathEnv
	if !strings.HasSuffix(newPath, ";") && newPath != "" {
		newPath += ";"
	}
	newPath += binDir

	cmd := exec.Command("powershell", "-NoProfile", "-Command", fmt.Sprintf("[Environment]::SetEnvironmentVariable('Path', '%s', 'User')", newPath))
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to update PATH: %v", err)
	}

	logger.Success("PATH updated! Please restart your terminal for changes to take effect.")
	return nil
}

func installTermux(exePath, prefix string) error {
	targetExe := filepath.Join(prefix, "bin", "teleman")
	logger.Info("Target binary path: %s", targetExe)
	
	if err := copyExecutable(exePath, targetExe); err != nil {
		return fmt.Errorf("copy failed: %v", err)
	}
	
	os.Chmod(targetExe, 0755)
	logger.Success("Binary copied smoothly! Termux PATH is globally configured by default. No modification needed.")
	return nil
}

func installLinux(exePath string) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}

	binDir := filepath.Join(home, ".local", "bin")
	targetExe := filepath.Join(binDir, "teleman")

	logger.Info("Target binary path: %s", targetExe)
	if err := copyExecutable(exePath, targetExe); err != nil {
		return fmt.Errorf("copy failed: %v", err)
	}
	os.Chmod(targetExe, 0755)
	logger.Success("Binary copied successfully.")

	pathEnv := os.Getenv("PATH")
	if strings.Contains(pathEnv, binDir) {
		logger.Success("Directory already in PATH. You are good to go!")
		return nil
	}

	bashrcPath := filepath.Join(home, ".bashrc")
	zshrcPath := filepath.Join(home, ".zshrc")

	msg := fmt.Sprintf("Teleman needs to append 'export PATH=\"$PATH:%s\"' to your ~/.bashrc / ~/.zshrc.", binDir)
	proceed, err := askPermission(msg)
	if err != nil || !proceed {
		logger.Info("PATH modification skipped. Please add %s to your PATH manually.", binDir)
		return nil
	}

	exportLine := fmt.Sprintf("\n# Teleman CLI\nexport PATH=\"$PATH:%s\"\n", binDir)
	modified := false

	if _, err := os.Stat(bashrcPath); err == nil {
		appendToFile(bashrcPath, exportLine)
		logger.Success("Updated %s", bashrcPath)
		modified = true
	}
	if _, err := os.Stat(zshrcPath); err == nil {
		appendToFile(zshrcPath, exportLine)
		logger.Success("Updated %s", zshrcPath)
		modified = true
	}

	if !modified {
		// If neither exists, just create bash_profile or bashrc
		appendToFile(bashrcPath, exportLine)
		logger.Success("Created and updated %s", bashrcPath)
	}

	logger.Success("PATH updated! Run 'source ~/.bashrc' or restart your shell to apply changes.")
	return nil
}

func appendToFile(filePath, content string) error {
	f, err := os.OpenFile(filePath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer f.Close()
	if _, err := f.WriteString(content); err != nil {
		return err
	}
	return nil
}
