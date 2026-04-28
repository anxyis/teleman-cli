package config

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/AlecAivazis/survey/v2"
	"github.com/teleman-cli/teleman/internal/models"
)

// parseChatID smartly resolves raw inputs or Telegram Web URLs to the correct ID
func parseChatID(input, targetType string) string {
	input = strings.TrimSpace(input)
	
	re := regexp.MustCompile(`-?\d+`)
	matches := re.FindStringSubmatch(input)
	if len(matches) > 0 {
		input = matches[0]
	}

	if targetType == "channel" || targetType == "topic" {
		input = strings.TrimPrefix(input, "-")
		if !strings.HasPrefix(input, "100") {
			input = "-100" + input
		} else {
			input = "-" + input
		}
	} else if targetType == "user" {
		input = strings.TrimPrefix(input, "-")
	}

	return input
}

// RunWizard launches the interactive setup tool.
func RunWizard() error {
	cfg, err := Load()
	if err != nil {
		return fmt.Errorf("failed to load config: %v", err)
	}

	fmt.Println("=== Teleman Configuration Wizard ===")

	// 1. Check Global Settings (Token & Index Channel)
	if cfg.ActiveToken == "" {
		fmt.Println("\nSetup Global Settings")
		if err := setupGlobal(cfg); err != nil {
			return err
		}
	}

	// 2. Manage Targets Loop
	for {
		action := ""
		prompt := &survey.Select{
			Message: "Manage Config & Targets:",
			Options: []string{"n)ew target", "e)dit targets", "d)elete target", "g)lobal settings", "q)uit"},
		}
		survey.AskOne(prompt, &action)

		switch action[0] {
		case 'n':
			if err := newTarget(cfg); err != nil {
				fmt.Println("Error:", err)
			}
			Save(cfg)
		case 'e':
			if len(cfg.Targets) == 0 {
				fmt.Println("No targets to edit.")
				continue
			}
			if err := editTarget(cfg); err != nil {
				fmt.Println("Error:", err)
			}
			Save(cfg)
		case 'd':
			if len(cfg.Targets) == 0 {
				fmt.Println("No targets to delete.")
				continue
			}
			var aliases []string
			for a := range cfg.Targets {
				aliases = append(aliases, a)
			}
			var toDelete string
			prompt := &survey.Select{
				Message: "Select target to delete:",
				Options: aliases,
			}
			survey.AskOne(prompt, &toDelete)
			delete(cfg.Targets, toDelete)
			Save(cfg)
			fmt.Printf("Deleted target '%s'.\n", toDelete)
		case 'g':
			if err := setupGlobal(cfg); err != nil {
				fmt.Println("Error:", err)
			} else {
				fmt.Println("Global settings updated.")
			}
		case 'q':
			fmt.Println("Exiting wizard.")
			return nil
		}
	}
}

func setupGlobal(cfg *models.Config) error {
	apiDefault := "https://api.telegram.org"
	if cfg.CustomAPIHost != "" {
		apiDefault = cfg.CustomAPIHost
	}

	tokenMsg := "Telegram Bot Token:"
	if cfg.ActiveToken != "" {
		tokenMsg = "Telegram Bot Token (Leave blank to keep unchanged):"
	}

	qs := []*survey.Question{
		{
			Name: "token",
			Prompt: &survey.Password{
				Message: tokenMsg,
			},
		},
		{
			Name: "channel",
			Prompt: &survey.Input{
				Message: "Dedicated Index Channel ID (e.g. -100123456789):",
				Default: cfg.IndexChannelID,
				Help:    "Teleman requires a dedicated private channel to store virtual filesystem indexes (single source of truth).",
			},
			Validate: survey.Required,
		},
		{
			Name: "api",
			Prompt: &survey.Input{
				Message: "Custom API Host (Leave blank for default api.telegram.org):",
				Default: apiDefault,
			},
		},
	}

	if cfg.ActiveToken == "" {
		qs[0].Validate = survey.Required
	}

	answers := struct {
		Token   string
		Channel string
		API     string
	}{}

	err := survey.Ask(qs, &answers)
	if err != nil {
		return err
	}

	if strings.TrimSpace(answers.Token) != "" {
		cfg.ActiveToken = strings.TrimSpace(answers.Token)
	}
	cfg.IndexChannelID = parseChatID(answers.Channel, "channel")
	cfg.CustomAPIHost = strings.TrimSpace(answers.API)

	// If using a custom API host (local Bot API), ask for optional file server
	if cfg.CustomAPIHost != "" && cfg.CustomAPIHost != "https://api.telegram.org" {
		var fileServer string
		prompt := &survey.Input{
			Message: "File Server Host for downloads (e.g. http://192.168.0.7:9000, blank to skip):",
			Default: cfg.FileServerHost,
			Help:    "If your local Bot API stores files on disk and you serve them via nginx/caddy, enter that URL here. Downloads will fetch files from this server instead of the Bot API's /file/ endpoint.",
		}
		survey.AskOne(prompt, &fileServer)
		cfg.FileServerHost = strings.TrimSpace(fileServer)
	}

	return Save(cfg)
}

func newTarget(cfg *models.Config) error {
	qs := []*survey.Question{
		{
			Name: "alias",
			Prompt: &survey.Input{
				Message: "Target Alias (e.g. 'my_channel', no spaces):",
			},
			Validate: survey.Required,
		},
		{
			Name: "type",
			Prompt: &survey.Select{
				Message: "Target Type:",
				Options: []string{"channel", "topic", "user"},
			},
		},
		{
			Name: "chatid",
			Prompt: &survey.Input{
				Message: "Chat ID (e.g. -100... or user ID):",
			},
			Validate: survey.Required,
		},
	}

	answers := struct {
		Alias  string
		Type   string
		ChatID string
	}{}

	if err := survey.Ask(qs, &answers); err != nil {
		return err
	}

	alias := strings.TrimSpace(answers.Alias)
	if _, exists := cfg.Targets[alias]; exists {
		return fmt.Errorf("alias '%s' already exists", alias)
	}

	target := &models.Target{
		Type:   answers.Type,
		ChatID: parseChatID(answers.ChatID, answers.Type),
	}

	if answers.Type == "topic" {
		var threadID string
		prompt := &survey.Input{
			Message: "Message Thread ID (Topic ID):",
		}
		survey.AskOne(prompt, &threadID)
		target.ThreadID = strings.TrimSpace(threadID)
	}

	cfg.Targets[alias] = target
	fmt.Printf("Created target '%s' successfully.\n", alias)
	return nil
}

func editTarget(cfg *models.Config) error {
	var aliases []string
	for a := range cfg.Targets {
		aliases = append(aliases, a)
	}

	var selected string
	prompt := &survey.Select{
		Message: "Select target to edit:",
		Options: aliases,
	}
	if err := survey.AskOne(prompt, &selected); err != nil {
		return err
	}

	oldTarget := cfg.Targets[selected]

	qs := []*survey.Question{
		{
			Name: "alias",
			Prompt: &survey.Input{
				Message: "Target Alias (no spaces):",
				Default: selected,
			},
			Validate: survey.Required,
		},
		{
			Name: "type",
			Prompt: &survey.Select{
				Message: "Target Type:",
				Options: []string{"channel", "topic", "user"},
				Default: oldTarget.Type,
			},
		},
		{
			Name: "chatid",
			Prompt: &survey.Input{
				Message: "Chat ID (e.g. -100... or user ID):",
				Default: oldTarget.ChatID,
			},
			Validate: survey.Required,
		},
	}

	answers := struct {
		Alias  string
		Type   string
		ChatID string
	}{}

	if err := survey.Ask(qs, &answers); err != nil {
		return err
	}

	newAlias := strings.TrimSpace(answers.Alias)
	if newAlias != selected {
		if _, exists := cfg.Targets[newAlias]; exists {
			return fmt.Errorf("alias '%s' already exists", newAlias)
		}
	}

	newTarget := &models.Target{
		Type:   answers.Type,
		ChatID: parseChatID(answers.ChatID, answers.Type),
	}

	if answers.Type == "topic" {
		var threadID string
		prompt := &survey.Input{
			Message: "Message Thread ID (Topic ID):",
			Default: oldTarget.ThreadID,
		}
		survey.AskOne(prompt, &threadID)
		newTarget.ThreadID = strings.TrimSpace(threadID)
	}

	if newAlias != selected {
		delete(cfg.Targets, selected)
	}
	cfg.Targets[newAlias] = newTarget

	fmt.Printf("Edited target '%s' successfully.\n", newAlias)
	return nil
}
