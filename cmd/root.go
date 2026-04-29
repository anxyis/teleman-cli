package cmd

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"sort"
	"strings"
	"syscall"

	"github.com/AlecAivazis/survey/v2"
	"github.com/spf13/cobra"

	"github.com/teleman-cli/teleman/internal/config"
	"github.com/teleman-cli/teleman/internal/core"
	"github.com/teleman-cli/teleman/internal/index"
	"github.com/teleman-cli/teleman/internal/logger"
	"github.com/teleman-cli/teleman/internal/models"
	syncpkg "github.com/teleman-cli/teleman/internal/sync"
	"github.com/teleman-cli/teleman/internal/telegram"
)

// Global context with cancellation — wired to SIGINT/SIGTERM for graceful shutdown.
// All long-running operations check this context between iterations.
var (
	globalCtx    context.Context
	globalCancel context.CancelFunc
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
	RunE: func(cmd *cobra.Command, args []string) error {
		fmt.Println("Launching Interactive Wizard...")
		if err := config.RunWizard(); err != nil {
			return fmt.Errorf("wizard error: %v", err)
		}
		return nil
	},
}

var installCmd = &cobra.Command{
	Use:   "install",
	Short: "Globally install teleman into the user system PATH",
	RunE: func(cmd *cobra.Command, args []string) error {
		if err := core.RunInstall(); err != nil {
			return fmt.Errorf("install failed: %v", err)
		}
		return nil
	},
}

var syncCmd = &cobra.Command{
	Use:   "sync [source] [target_alias]:[path]",
	Short: "Sync a source folder to a virtual target path",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		source := args[0]
		target := args[1]
		logger.Step("Starting Sync:\n Source: %s\n Target: %s", source, target)

		opts, err := buildTransferOptions(cmd)
		if err != nil {
			return err
		}

		engine, err := syncpkg.NewSyncEngine(opts)
		if err != nil {
			return fmt.Errorf("sync init error: %v", err)
		}

		if err := engine.Run(globalCtx, source, target); err != nil {
			return fmt.Errorf("sync error: %v", err)
		}
		return nil
	},
}

var copyCmd = &cobra.Command{
	Use:   "copy [source] [target_alias]:[path]",
	Short: "Copy files from source to virtual target, skipping identical files",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		source := args[0]
		target := args[1]
		logger.Step("Starting Copy:\n Source: %s\n Target: %s", source, target)

		opts, err := buildTransferOptions(cmd)
		if err != nil {
			return err
		}

		if err := core.RunCopy(globalCtx, source, target, opts); err != nil {
			return fmt.Errorf("copy error: %v", err)
		}
		return nil
	},
}

var moveCmd = &cobra.Command{
	Use:   "move [source] [target_alias]:[path]",
	Short: "Move files, copying to destination and deleting from source",
	Args:  cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		source := args[0]
		target := args[1]
		logger.Step("Starting Move:\n Source: %s\n Target: %s", source, target)

		opts, err := buildTransferOptions(cmd)
		if err != nil {
			return err
		}

		if err := core.RunMove(globalCtx, source, target, opts); err != nil {
			return fmt.Errorf("move error: %v", err)
		}
		return nil
	},
}

var downloadCmd = &cobra.Command{
	Use:   "download [target_alias]:[virtual_path] [local_dest]",
	Short: "Download files from a virtual Telegram target to local disk",
	Long: `Downloads files from your virtual Telegram filesystem to a local destination.
Supports single file or recursive directory downloads with hash-verified chunk reassembly.

Password Priority (for encrypted files):
  1. TELEMAN_PASSWORD environment variable (recommended — not visible in process list)
  2. Interactive terminal prompt (if stdin is a TTY)
  3. --password flag (last resort — visible in 'ps aux')

Examples:
  teleman download backup:photos/trip.jpg ./recovered/
  teleman download remote:documents/ ./local_docs/
  TELEMAN_PASSWORD=mysecret teleman download encrypted_vault:secrets/ ./decrypted/`,
	Args: cobra.ExactArgs(2),
	RunE: func(cmd *cobra.Command, args []string) error {
		targetRaw := args[0]
		localDest := args[1]
		logger.Step("Starting Download:\n Source: %s\n Dest:   %s", targetRaw, localDest)

		opts, err := buildTransferOptions(cmd)
		if err != nil {
			return err
		}
		opts.PasswordCallback = resolvePassword

		if err := core.RunDownload(globalCtx, targetRaw, localDest, opts); err != nil {
			return fmt.Errorf("download error: %v", err)
		}
		return nil
	},
}

var lsCmd = &cobra.Command{
	Use:   "ls [target_alias]:[path]",
	Short: "List files on the virtual Telegram target",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		targetRaw := args[0]
		parts := strings.SplitN(targetRaw, ":", 2)
		if len(parts) != 2 {
			return fmt.Errorf("invalid target format. Use alias:virtual/path")
		}
		alias, virtualRoot := parts[0], parts[1]

		cfg, err := config.Load()
		if err != nil || cfg.ActiveToken == "" {
			return fmt.Errorf("config error (run teleman config)")
		}
		target, ok := cfg.Targets[alias]
		if !ok {
			return fmt.Errorf("target alias '%s' not found", alias)
		}

		client := telegram.NewSmartClient(cfg.ActiveToken, cfg.APIHosts, cfg.FileServerHosts)
		mgr, err := index.NewManager(client, cfg.IndexChannelID)
		if err != nil {
			return fmt.Errorf("index init error: %v", err)
		}

		idx, err := mgr.Load()
		if err != nil {
			return fmt.Errorf("failed to load index: %v", err)
		}

		targetKey := target.ChatID
		if target.ThreadID != "" {
			targetKey += ":" + target.ThreadID
		}

		logger.Info("Listing contents of: %s", targetRaw)
		found := 0
		virtualPrefix := strings.TrimLeft(virtualRoot, "/")

		targetFiles, ok := idx.Targets[targetKey]
		if ok {
			for vPath, entry := range targetFiles {
				if virtualPrefix == "" || strings.HasPrefix(vPath, virtualPrefix) {
					logger.Info("%10d %s", entry.Size, vPath)
					found++
				}
			}
		}

		if found == 0 {
			logger.Info("(No files found)")
		}
		return nil
	},
}

var sizeCmd = &cobra.Command{
	Use:   "size [target_alias]:[path]",
	Short: "Display total number of files and total size for a given virtual path",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		targetRaw := args[0]
		parts := strings.SplitN(targetRaw, ":", 2)
		if len(parts) != 2 {
			return fmt.Errorf("invalid target format. Use alias:virtual/path")
		}
		alias, virtualRoot := parts[0], parts[1]

		cfg, err := config.Load()
		if err != nil || cfg.ActiveToken == "" {
			return fmt.Errorf("config error (run teleman config)")
		}
		target, ok := cfg.Targets[alias]
		if !ok {
			return fmt.Errorf("target alias '%s' not found", alias)
		}

		// Initialize manager with nil client to avoid API calls completely
		mgr, err := index.NewManager(nil, "")
		if err != nil {
			return fmt.Errorf("index init error: %v", err)
		}

		idx, err := mgr.Load()
		if err != nil {
			return fmt.Errorf("failed to load index: %v", err)
		}

		targetKey := target.ChatID
		if target.ThreadID != "" {
			targetKey += ":" + target.ThreadID
		}

		virtualPrefix := strings.TrimLeft(virtualRoot, "/")

		var totalFiles int
		var totalSize int64

		targetFiles, ok := idx.Targets[targetKey]
		if ok {
			for vPath, entry := range targetFiles {
				if virtualPrefix == "" || strings.HasPrefix(vPath, virtualPrefix) {
					totalFiles++
					totalSize += entry.Size
				}
			}
		}

		if totalFiles == 0 {
			fmt.Println("No files found")
			return nil
		}

		fmt.Printf("Total Files: %d\n", totalFiles)
		fmt.Printf("Total Size: %s (%d bytes)\n", formatBytes(totalSize), totalSize)
		return nil
	},
}

var treeDepth int

type treeNode struct {
	name     string
	isDir    bool
	children map[string]*treeNode
}

func newTreeNode(name string, isDir bool) *treeNode {
	return &treeNode{
		name:     name,
		isDir:    isDir,
		children: make(map[string]*treeNode),
	}
}

func insertPath(root *treeNode, path string) {
	parts := strings.Split(path, "/")
	current := root
	for i, part := range parts {
		if part == "" {
			continue
		}
		isDir := i < len(parts)-1
		if _, exists := current.children[part]; !exists {
			current.children[part] = newTreeNode(part, isDir)
		}
		current = current.children[part]
	}
}

func printTree(node *treeNode, indent string, currentDepth, maxDepth int) {
	if maxDepth > 0 && currentDepth >= maxDepth {
		return
	}

	var dirs []*treeNode
	var files []*treeNode

	for _, child := range node.children {
		if child.isDir {
			dirs = append(dirs, child)
		} else {
			files = append(files, child)
		}
	}

	sort.Slice(dirs, func(i, j int) bool { return dirs[i].name < dirs[j].name })
	sort.Slice(files, func(i, j int) bool { return files[i].name < files[j].name })

	for _, d := range dirs {
		fmt.Printf("%s%s/\n", indent, d.name)
		printTree(d, indent+"  ", currentDepth+1, maxDepth)
	}
	for _, f := range files {
		fmt.Printf("%s%s\n", indent, f.name)
	}
}

var treeCmd = &cobra.Command{
	Use:   "tree [target_alias]:[path]",
	Short: "Display the virtual filesystem structure in a tree-like format",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		targetRaw := args[0]
		parts := strings.SplitN(targetRaw, ":", 2)
		if len(parts) != 2 {
			return fmt.Errorf("invalid target format. Use alias:virtual/path")
		}
		alias, virtualRoot := parts[0], parts[1]

		cfg, err := config.Load()
		if err != nil || cfg.ActiveToken == "" {
			return fmt.Errorf("config error (run teleman config)")
		}
		target, ok := cfg.Targets[alias]
		if !ok {
			return fmt.Errorf("target alias '%s' not found", alias)
		}

		mgr, err := index.NewManager(nil, "")
		if err != nil {
			return fmt.Errorf("index init error: %v", err)
		}

		idx, err := mgr.Load()
		if err != nil {
			return fmt.Errorf("failed to load index: %v", err)
		}

		targetKey := target.ChatID
		if target.ThreadID != "" {
			targetKey += ":" + target.ThreadID
		}

		virtualPrefix := strings.TrimLeft(virtualRoot, "/")

		root := newTreeNode("", true)
		found := 0

		targetFiles, ok := idx.Targets[targetKey]
		if ok {
			for vPath := range targetFiles {
				if virtualPrefix == "" || strings.HasPrefix(vPath, virtualPrefix) {
					insertPath(root, vPath)
					found++
				}
			}
		}

		if found == 0 {
			fmt.Println("No files found")
			return nil
		}

		printTree(root, "", 0, treeDepth)
		return nil
	},
}

func formatBytes(b int64) string {
	const unit = 1024
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(b)/float64(div), "KMGTPE"[exp])
}

var deleteCmd = &cobra.Command{
	Use:   "delete [target_alias]:[path]",
	Short: "Delete files under a target path without removing subdirectories",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		opts := &core.DeleteOptions{
			Recursive: false,
			DryRun:    dryRun,
			Confirm:   true, // non-recursive delete doesn't strictly need a prompt
			Transfers: transfers,
		}
		return core.RunDelete(globalCtx, args[0], opts)
	},
}

var purgeCmd = &cobra.Command{
	Use:   "purge [target_alias]:[path]",
	Short: "Recursively delete files and directories under a target path",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		opts := &core.DeleteOptions{
			Recursive: true,
			DryRun:    dryRun,
			Confirm:   confirm,
			Transfers: transfers,
		}
		return core.RunDelete(globalCtx, args[0], opts)
	},
}

// Flag variables — still declared at package level for cobra binding,
// but converted to TransferOptions before passing to any internal function.
var (
	transfers        int
	checkers         int
	chunkSize        string
	encrypt          bool
	zipMode          bool
	tgzMode          bool
	mediaMode        bool
	force            bool
	dryRun           bool
	confirm          bool
	verbose          bool
	quiet            bool
	downloadPassword string
	caption          string
)

// buildTransferOptions converts CLI flags into a TransferOptions struct.
// Validates chunk size early so the user gets immediate feedback on bad input.
// Resolves encryption password from env var, interactive prompt, or --password flag.
func buildTransferOptions(cmd *cobra.Command) (*models.TransferOptions, error) {
	parsedChunkSize, err := models.ParseChunkSize(chunkSize)
	if err != nil {
		return nil, fmt.Errorf("invalid --cz value: %v", err)
	}

	var password []byte
	if encrypt {
		password, err = resolvePassword()
		if err != nil {
			return nil, err
		}
		if len(password) == 0 {
			return nil, fmt.Errorf("--encrypt requires a password. Set TELEMAN_PASSWORD env var or use --password flag")
		}
	}

	// Config validation warning
	if encrypt && !quiet {
		logger.Info("   [Encryption] AES-256-GCM enabled (key derived via scrypt)")
	}

	return &models.TransferOptions{
		Transfers: transfers,
		Checkers:  checkers,
		ChunkSize: parsedChunkSize,
		Encrypt:   encrypt,
		ZipMode:   zipMode,
		TgzMode:   tgzMode,
		MediaMode: mediaMode,
		Force:            force,
		DryRun:           dryRun,
		Password:         password,
		AutoUpgradeChunk: cmd != nil && !cmd.Flags().Changed("cz"),
		Caption:          caption,
	}, nil
}

// resolvePassword determines the encryption/decryption password using this priority:
//  1. TELEMAN_PASSWORD environment variable (recommended — not visible in process list)
//  2. Interactive terminal prompt (if stdin is a TTY)
//  3. --password CLI flag (last resort — visible in 'ps aux')
func resolvePassword() ([]byte, error) {
	// Priority 1: Environment variable
	if envPass := os.Getenv("TELEMAN_PASSWORD"); envPass != "" {
		logger.Debug("   [Password] Using TELEMAN_PASSWORD environment variable")
		return []byte(envPass), nil
	}

	// Priority 2: CLI flag (if provided)
	if downloadPassword != "" {
		logger.Warn("   [Warning] Password passed via --password flag is visible in process list. Use TELEMAN_PASSWORD env var instead.")
		return []byte(downloadPassword), nil
	}

	// Priority 3: Interactive prompt (only if TTY is available)
	if isTerminal() {
		var pass string
		prompt := &survey.Password{
			Message: "Enter encryption/decryption password:",
		}
		if err := survey.AskOne(prompt, &pass); err != nil {
			return nil, nil // User cancelled, return empty
		}
		if pass != "" {
			return []byte(pass), nil
		}
	}

	return nil, nil
}

// isTerminal returns true if stdin appears to be an interactive terminal.
func isTerminal() bool {
	fi, err := os.Stdin.Stat()
	if err != nil {
		return false
	}
	return (fi.Mode() & os.ModeCharDevice) != 0
}

func addCommonFlags(cmd *cobra.Command) {
	cmd.Flags().IntVarP(&transfers, "transfers", "t", 4, "Number of concurrent upload/download workers (network bound).\nRecommended: 2 (small), 4 (balanced), 8 (high perf)")
	cmd.Flags().IntVarP(&checkers, "checkers", "c", 8, "Number of concurrent file scanning workers (CPU/disk bound).\nRecommended: 4 (small), 8 (balanced), 16 (high perf)")
}

func addTransferFlags(cmd *cobra.Command) {
	addCommonFlags(cmd)
	cmd.Flags().StringVar(&chunkSize, "cz", "49M", "Chunk size (e.g. 49M, 1G, 512K)")
	cmd.Flags().BoolVarP(&encrypt, "encrypt", "e", false, "Encrypt chunks with AES-256-GCM (requires password)")
	cmd.Flags().BoolVar(&zipMode, "zip", false, "Compress source folder into streaming zip archive before chunking")
	cmd.Flags().BoolVar(&tgzMode, "tgz", false, "Compress source folder into streaming tar.gz archive before chunking")
	cmd.Flags().BoolVar(&mediaMode, "media", false, "Route eligible small files to media endpoints")
	cmd.Flags().BoolVarP(&force, "force", "f", false, "Force re-upload of existing files")
	cmd.Flags().BoolVar(&dryRun, "dry-run", false, "Show what would be transferred without making changes")
	cmd.Flags().StringVar(&downloadPassword, "password", "", "Encryption password (prefer TELEMAN_PASSWORD env var)")
	cmd.Flags().StringVar(&caption, "caption", "", "Custom caption string or 'auto' for auto-generated caption")
}

func init() {
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "Enable verbose debug logging")
	rootCmd.PersistentFlags().BoolVarP(&quiet, "quiet", "q", false, "Suppress all output except errors")

	addTransferFlags(syncCmd)
	addTransferFlags(copyCmd)
	addTransferFlags(moveCmd)

	// --zip and --tgz are mutually exclusive on all transfer commands
	for _, cmd := range []*cobra.Command{copyCmd, syncCmd, moveCmd} {
		cmd.MarkFlagsMutuallyExclusive("zip", "tgz")
	}

	addCommonFlags(downloadCmd)
	downloadCmd.Flags().StringVar(&downloadPassword, "password", "", "Decryption password (prefer TELEMAN_PASSWORD env var)")
	downloadCmd.Flags().BoolVar(&dryRun, "dry-run", false, "Show what would be downloaded without making changes")

	rootCmd.AddCommand(configCmd)
	rootCmd.AddCommand(installCmd)
	rootCmd.AddCommand(syncCmd)
	rootCmd.AddCommand(copyCmd)
	rootCmd.AddCommand(moveCmd)
	rootCmd.AddCommand(downloadCmd)
	rootCmd.AddCommand(lsCmd)
	rootCmd.AddCommand(sizeCmd)
	rootCmd.AddCommand(treeCmd)
	rootCmd.AddCommand(deleteCmd)
	rootCmd.AddCommand(purgeCmd)

	treeCmd.Flags().IntVar(&treeDepth, "depth", 0, "Maximum depth to display (0 for unlimited)")

	deleteCmd.Flags().BoolVar(&dryRun, "dry-run", false, "Show what would be deleted without making changes")
	deleteCmd.Flags().IntVarP(&transfers, "transfers", "t", 4, "Number of parallel physical deletion workers")

	purgeCmd.Flags().BoolVar(&dryRun, "dry-run", false, "Show what would be deleted without making changes")
	purgeCmd.Flags().BoolVar(&confirm, "confirm", false, "Bypass interactive confirmation prompt")
	purgeCmd.Flags().IntVarP(&transfers, "transfers", "t", 4, "Number of parallel physical deletion workers")
}

func Execute() {
	// Wire SIGINT/SIGTERM to context cancellation for graceful shutdown.
	// All long-running operations (chunk uploads/downloads) check this context
	// between iterations, allowing clean lock release and partial index commits.
	globalCtx, globalCancel = context.WithCancel(context.Background())
	defer globalCancel()

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		sig := <-sigChan
		logger.Warn("\n=> Received %s — shutting down gracefully (completing current chunk)...", sig)
		globalCancel()
	}()

	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
