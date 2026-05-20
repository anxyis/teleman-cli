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
		if err := survey.AskOne(prompt, &action); err != nil {
			fmt.Println("Exiting wizard.")
			return nil
		}

		if len(action) == 0 {
			continue
		}

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
				Help:    "Teleman requires a dedicated private channel to store virtual filesystem indexes.",
			},
			Validate: survey.Required,
		},
	}

	if cfg.ActiveToken == "" {
		qs[0].Validate = survey.Required
	}

	answers := struct {
		Token   string
		Channel string
	}{}

	err := survey.Ask(qs, &answers)
	if err != nil {
		return err
	}

	if strings.TrimSpace(answers.Token) != "" {
		cfg.ActiveToken = strings.TrimSpace(answers.Token)
	}
	cfg.IndexChannelID = parseChatID(answers.Channel, "channel")

	fmt.Println("\n--- Bot API Server Endpoints ---")
	fmt.Println("Set your custom Bot API endpoints (e.g., http://192.168.x.x:8081). Leave blank to skip.")

	apiQs := []*survey.Question{
		{
			Name: "local",
			Prompt: &survey.Input{
				Message: "Local IP Endpoint:",
				Default: cfg.APIHosts.Local,
			},
		},
		{
			Name: "tailscale",
			Prompt: &survey.Input{
				Message: "Tailscale IP Endpoint:",
				Default: cfg.APIHosts.Tailscale,
			},
		},
		{
			Name: "public",
			Prompt: &survey.Input{
				Message: "Public IP/Domain Endpoint:",
				Default: cfg.APIHosts.Public,
			},
		},
	}

	apiAnswers := struct {
		Local     string
		Tailscale string
		Public    string
	}{}

	if err := survey.Ask(apiQs, &apiAnswers); err != nil {
		return err
	}

	cfg.APIHosts.Local = strings.TrimSpace(apiAnswers.Local)
	cfg.APIHosts.Tailscale = strings.TrimSpace(apiAnswers.Tailscale)
	cfg.APIHosts.Public = strings.TrimSpace(apiAnswers.Public)

	fmt.Println("\n--- File Server Endpoints ---")
	fmt.Println("Set your file server endpoints (e.g., http://192.168.x.x:9000). Leave blank to skip.")

	fsQs := []*survey.Question{
		{
			Name: "local",
			Prompt: &survey.Input{
				Message: "Local IP File Server:",
				Default: cfg.FileServerHosts.Local,
			},
		},
		{
			Name: "tailscale",
			Prompt: &survey.Input{
				Message: "Tailscale IP File Server:",
				Default: cfg.FileServerHosts.Tailscale,
			},
		},
		{
			Name: "public",
			Prompt: &survey.Input{
				Message: "Public IP/Domain File Server:",
				Default: cfg.FileServerHosts.Public,
			},
		},
	}

	fsAnswers := struct {
		Local     string
		Tailscale string
		Public    string
	}{}

	if err := survey.Ask(fsQs, &fsAnswers); err != nil {
		return err
	}

	cfg.FileServerHosts.Local = strings.TrimSpace(fsAnswers.Local)
	cfg.FileServerHosts.Tailscale = strings.TrimSpace(fsAnswers.Tailscale)
	cfg.FileServerHosts.Public = strings.TrimSpace(fsAnswers.Public)

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
				Options: []string{"channel/group", "topic", "user"},
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

	actualType := answers.Type
	if actualType == "channel/group" {
		actualType = "channel"
	}

	target := &models.Target{
		Type:   actualType,
		ChatID: parseChatID(answers.ChatID, actualType),
	}

	if actualType == "topic" {
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

	defaultType := oldTarget.Type
	if defaultType == "channel" {
		defaultType = "channel/group"
	}

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
				Options: []string{"channel/group", "topic", "user"},
				Default: defaultType,
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

	actualType := answers.Type
	if actualType == "channel/group" {
		actualType = "channel"
	}

	newTarget := &models.Target{
		Type:   actualType,
		ChatID: parseChatID(answers.ChatID, actualType),
	}

	if actualType == "topic" {
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
