package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"github.com/teleman-cli/teleman/internal/config"
	"github.com/teleman-cli/teleman/internal/core"
	"github.com/teleman-cli/teleman/internal/index"
	"github.com/teleman-cli/teleman/internal/logger"
	syncpkg "github.com/teleman-cli/teleman/internal/sync"
	"github.com/teleman-cli/teleman/internal/telegram"
)

var rootCmd = &cobra.Command{
	Use:   "teleman",
	Short: "Teleman is a high-performance Telegram-based file syncer.",
	Long:  `A fast and flexible file transfer utility utilizing a self-hosted Telegram Bot API as an Object Store.`,
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		logger.Init(verbose, quiet)
	},
	Run: func(cmd *cobra.Command, args []string) {
		cmd.Help()
	},
}

var configCmd = &cobra.Command{
	Use:   "config",
	Short: "Enter interactive configuration mode",
	Run: func(cmd *cobra.Command, args []string) {
		fmt.Println("Launching Interactive Wizard...")
		if err := config.RunWizard(); err != nil {
			fmt.Printf("Wizard Error: %v\n", err)
			os.Exit(1)
		}
	},
}

var syncCmd = &cobra.Command{
	Use:   "sync [source] [target_alias]:[path]",
	Short: "Sync a source folder to a virtual target path",
	Args:  cobra.ExactArgs(2),
	Run: func(cmd *cobra.Command, args []string) {
		source := args[0]
		target := args[1]
		logger.Step("Starting Sync:\n Source: %s\n Target: %s", source, target)
		
		engine, err := syncpkg.NewSyncEngine(transfers, checkers, zipMode, mediaMode, force)
		if err != nil {
			logger.Error("Sync Init Error: %v", err)
			os.Exit(1)
		}

		if err := engine.Run(source, target); err != nil {
			logger.Error("Sync Error: %v", err)
			os.Exit(1)
		}
	},
}

var copyCmd = &cobra.Command{
	Use:   "copy [source] [target_alias]:[path]",
	Short: "Copy files from source to virtual target, skipping identical files",
	Args:  cobra.ExactArgs(2),
	Run: func(cmd *cobra.Command, args []string) {
		source := args[0]
		target := args[1]
		logger.Step("Starting Copy:\n Source: %s\n Target: %s", source, target)
		
		if err := core.RunCopy(source, target, zipMode, mediaMode, force); err != nil {
			logger.Error("Copy Error: %v", err)
			os.Exit(1)
		}
	},
}

var moveCmd = &cobra.Command{
	Use:   "move [source] [target_alias]:[path]",
	Short: "Move files, copying to destination and deleting from source",
	Args:  cobra.ExactArgs(2),
	Run: func(cmd *cobra.Command, args []string) {
		source := args[0]
		target := args[1]
		logger.Step("Starting Move:\n Source: %s\n Target: %s", source, target)
	},
}

var lsCmd = &cobra.Command{
	Use:   "ls [target_alias]:[path]",
	Short: "List files on the virtual Telegram target",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		targetRaw := args[0]
		parts := strings.SplitN(targetRaw, ":", 2)
		if len(parts) != 2 {
			logger.Error("invalid target format. Use alias:virtual/path")
			os.Exit(1)
		}
		alias, virtualRoot := parts[0], parts[1]

		cfg, err := config.Load()
		if err != nil || cfg.ActiveToken == "" {
			logger.Error("Config error (run teleman config)")
			os.Exit(1)
		}
		_, ok := cfg.Targets[alias]
		if !ok {
			logger.Error("target alias '%s' not found", alias)
			os.Exit(1)
		}

		client := telegram.NewClient(cfg.ActiveToken, cfg.CustomAPIHost)
		mgr, err := index.NewManager(client, cfg.IndexChannelID)
		if err != nil {
			logger.Error("Index init error: %v", err)
			os.Exit(1)
		}

		idx, err := mgr.Load()
		if err != nil {
			logger.Error("Failed to load index: %v", err)
			os.Exit(1)
		}

		logger.Info("Listing contents of: %s", targetRaw)
		found := 0
		virtualPrefix := strings.TrimLeft(virtualRoot, "/")
		for vPath, entry := range idx.Files {
			if virtualPrefix == "" || strings.HasPrefix(vPath, virtualPrefix) {
				logger.Info("%10d %s", entry.Size, vPath)
				found++
			}
		}
		if found == 0 {
			logger.Info("(No files found)")
		}
	},
}

var (
	transfers int
	checkers  int
	chunkSize string
	encrypt   bool
	zipMode   bool
	mediaMode bool
	force     bool
	verbose   bool
	quiet     bool
)

func addTransferFlags(cmd *cobra.Command) {
	cmd.Flags().IntVarP(&transfers, "transfers", "t", 4, "Number of file transfers to run in parallel")
	cmd.Flags().IntVarP(&checkers, "checkers", "c", 8, "Number of checkers to run in parallel")
	cmd.Flags().StringVar(&chunkSize, "cz", "49M", "Chunk size")
	cmd.Flags().BoolVarP(&encrypt, "encrypt", "e", false, "Encrypt chunks with AES")
	cmd.Flags().BoolVar(&zipMode, "zip", false, "Compress source folder into streaming archive before chunking")
	cmd.Flags().BoolVar(&mediaMode, "media", false, "Route eligible small files to media endpoints")
	cmd.Flags().BoolVarP(&force, "force", "f", false, "Force re-upload of existing files")
}

func init() {
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "Enable verbose debug logging")
	rootCmd.PersistentFlags().BoolVarP(&quiet, "quiet", "q", false, "Suppress all output except errors")

	addTransferFlags(syncCmd)
	addTransferFlags(copyCmd)
	addTransferFlags(moveCmd)

	rootCmd.AddCommand(configCmd)
	rootCmd.AddCommand(syncCmd)
	rootCmd.AddCommand(copyCmd)
	rootCmd.AddCommand(moveCmd)
	rootCmd.AddCommand(lsCmd)
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
