package cmd

import (
	"fmt"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/spf13/cobra"
	"github.com/teleman-cli/teleman/internal/tui"
)

var browseCmd = &cobra.Command{
	Use:   "browse",
	Short: "Interactive TUI for browsing remotes and files",
	Long: `Launch the interactive terminal user interface (TUI) to explore your configured remotes, navigate through folders, view metrics, and quickly download files.

Features:
- Select from existing remotes
- Navigate through folders (j/k to move, Enter to enter, Esc to go back)
- Search within a folder (/)
- Download a file or folder quickly (d)`,
	RunE: func(cmd *cobra.Command, args []string) error {
		p := tea.NewProgram(tui.NewMainModel(), tea.WithAltScreen())
		if _, err := p.Run(); err != nil {
			return fmt.Errorf("error running TUI: %v", err)
		}
		return nil
	},
}

func init() {
	rootCmd.AddCommand(browseCmd)
}
