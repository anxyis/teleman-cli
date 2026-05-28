package tui

import (
	"fmt"

	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/teleman-cli/teleman/internal/config"
	"github.com/teleman-cli/teleman/internal/index"
	"github.com/teleman-cli/teleman/internal/models"
)

var (
	docStyle = lipgloss.NewStyle().Margin(1, 2)
	titleStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("205")).Bold(true)
	metricsStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("240"))
	errorStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("196")).Bold(true)
)

type state int

const (
	stateRemotes state = iota
	stateTree
)

// remoteItem represents a target alias in the first view.
type remoteItem struct {
	alias  string
	target *models.Target
}

func (i remoteItem) Title() string       { return i.alias }
func (i remoteItem) Description() string { return fmt.Sprintf("ChatID: %s | ThreadID: %s", i.target.ChatID, i.target.ThreadID) }
func (i remoteItem) FilterValue() string { return i.alias }

// MainModel is the top-level Bubble Tea model.
type MainModel struct {
	state       state
	cfg         *models.Config
	idx         *models.Index
	
	remotesList list.Model
	treeModel   *TreeModel // We will define TreeModel in tree.go
	
	width  int
	height int
	err    error
}

func NewMainModel() *MainModel {
	cfg, err := config.Load()
	var errState error
	if err != nil {
		errState = err
	}

	var items []list.Item
	if cfg != nil {
		for alias, target := range cfg.Targets {
			items = append(items, remoteItem{alias: alias, target: target})
		}
	}

	l := list.New(items, list.NewDefaultDelegate(), 0, 0)
	l.Title = "Select Remote"
	l.Styles.Title = titleStyle

	return &MainModel{
		state:       stateRemotes,
		cfg:         cfg,
		remotesList: l,
		err:         errState,
	}
}

func (m *MainModel) Init() tea.Cmd {
	return nil
}

func (m *MainModel) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	if m.err != nil {
		switch msg := msg.(type) {
		case tea.KeyMsg:
			if msg.String() == "q" || msg.String() == "esc" || msg.String() == "ctrl+c" {
				return m, tea.Quit
			}
		}
		return m, nil
	}

	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		h, v := docStyle.GetFrameSize()
		m.width = msg.Width - h
		m.height = msg.Height - v
		
		m.remotesList.SetSize(m.width, m.height)
		if m.treeModel != nil {
			m.treeModel.SetSize(m.width, m.height)
		}

	case tea.KeyMsg:
		if m.remotesList.FilterState() == list.Filtering {
			break
		}

		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit
		case "esc":
			if m.state == stateTree {
				m.state = stateRemotes
				m.treeModel = nil // Reset tree
				m.remotesList.Title = "Select Remote"
				return m, nil
			}
		}
	}

	var cmd tea.Cmd
	switch m.state {
	case stateRemotes:
		m.remotesList, cmd = m.remotesList.Update(msg)
		
		if msg, ok := msg.(tea.KeyMsg); ok && msg.String() == "enter" {
			selected := m.remotesList.SelectedItem()
			if selected != nil {
				rem := selected.(remoteItem)
				m.loadTree(rem)
			}
		}
	case stateTree:
		var treeCmd tea.Cmd
		if m.treeModel != nil {
			*m.treeModel, treeCmd = m.treeModel.Update(msg)
		}
		return m, treeCmd
	}
	return m, cmd
}

func (m *MainModel) loadTree(rem remoteItem) {
	// Initialize Index Manager (offline)
	mgr, err := index.NewManager(nil, "")
	if err != nil {
		m.err = err
		return
	}
	idx, err := mgr.Load()
	if err != nil {
		m.err = err
		return
	}
	m.idx = idx

	targetKey := rem.target.ChatID
	if rem.target.ThreadID != "" {
		targetKey += ":" + rem.target.ThreadID
	}

	m.treeModel = NewTreeModel(rem.alias, targetKey, m.idx.Targets[targetKey])
	m.treeModel.SetSize(m.width, m.height)
	m.state = stateTree
}

func (m *MainModel) View() string {
	if m.err != nil {
		return docStyle.Render(errorStyle.Render("Error: " + m.err.Error() + "\n\nPress 'q' to quit."))
	}

	switch m.state {
	case stateRemotes:
		return docStyle.Render(m.remotesList.View())
	case stateTree:
		if m.treeModel != nil {
			return docStyle.Render(m.treeModel.View())
		}
	}
	return "Loading..."
}
