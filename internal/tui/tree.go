package tui

import (
	"fmt"
	"os/exec"
	"sort"
	"strings"

	"github.com/charmbracelet/bubbles/key"
	"github.com/charmbracelet/bubbles/list"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/teleman-cli/teleman/internal/models"
)

type node struct {
	name        string
	isDir       bool
	size        int64
	virtualPath string
	children    map[string]*node
	
	// Precomputed for fast list loading
	totalFiles int
	totalSize  int64
}

type treeItem struct {
	n *node
}

func (i treeItem) Title() string {
	if i.n.isDir {
		return "📁 " + i.n.name
	}
	return "📄 " + i.n.name
}

func (i treeItem) Description() string {
	if i.n.isDir {
		return fmt.Sprintf("%d files | %s", i.n.totalFiles, formatBytes(i.n.totalSize))
	}
	return formatBytes(i.n.size)
}

func (i treeItem) FilterValue() string {
	return i.n.name
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

type TreeModel struct {
	alias     string
	targetKey string
	
	root    *node
	current *node
	
	listModel list.Model
	width     int
	height    int
	
	history []*node // Track directory navigation history for 'back'
}

func NewTreeModel(alias, targetKey string, files map[string]*models.FileEntry) *TreeModel {
	root := &node{
		name:     "/",
		isDir:    true,
		children: make(map[string]*node),
	}

	// Build tree
	for vPath, entry := range files {
		insertPath(root, vPath, entry.Size)
	}
	
	// Compute directory sizes
	computeStats(root)

	l := list.New(nil, list.NewDefaultDelegate(), 0, 0)
	l.Title = fmt.Sprintf("Remote: %s (Root)", alias)
	l.Styles.Title = titleStyle
	l.SetShowStatusBar(true)
	
	// Add custom keybindings hint
	l.AdditionalFullHelpKeys = func() []key.Binding {
		return []key.Binding{
			key.NewBinding(key.WithKeys("d"), key.WithHelp("d", "download")),
			key.NewBinding(key.WithKeys("esc"), key.WithHelp("esc", "back")),
		}
	}
	l.AdditionalShortHelpKeys = l.AdditionalFullHelpKeys

	m := &TreeModel{
		alias:     alias,
		targetKey: targetKey,
		root:      root,
		current:   root,
		listModel: l,
	}
	
	m.updateList()
	return m
}

func insertPath(root *node, path string, size int64) {
	parts := strings.Split(path, "/")
	current := root
	for i, part := range parts {
		if part == "" {
			continue
		}
		isDir := i < len(parts)-1
		if _, exists := current.children[part]; !exists {
			vPath := strings.Join(parts[:i+1], "/")
			current.children[part] = &node{
				name:        part,
				isDir:       isDir,
				virtualPath: vPath,
				children:    make(map[string]*node),
			}
		}
		if !isDir {
			current.children[part].size = size
		}
		current = current.children[part]
	}
}

func computeStats(n *node) (int, int64) {
	if !n.isDir {
		return 1, n.size
	}
	var tFiles int
	var tSize int64
	for _, child := range n.children {
		f, s := computeStats(child)
		tFiles += f
		tSize += s
	}
	n.totalFiles = tFiles
	n.totalSize = tSize
	return tFiles, tSize
}

func (m *TreeModel) updateList() {
	var items []list.Item
	
	var dirs []*node
	var files []*node
	
	for _, child := range m.current.children {
		if child.isDir {
			dirs = append(dirs, child)
		} else {
			files = append(files, child)
		}
	}
	
	// Sort alphabetical
	sort.Slice(dirs, func(i, j int) bool { return strings.ToLower(dirs[i].name) < strings.ToLower(dirs[j].name) })
	sort.Slice(files, func(i, j int) bool { return strings.ToLower(files[i].name) < strings.ToLower(files[j].name) })
	
	// Add ".." if not root
	if len(m.history) > 0 {
		items = append(items, treeItem{
			n: &node{name: "..", isDir: true, virtualPath: "", totalFiles: 0, totalSize: 0},
		})
	}
	
	for _, d := range dirs {
		items = append(items, treeItem{n: d})
	}
	for _, f := range files {
		items = append(items, treeItem{n: f})
	}
	
	m.listModel.SetItems(items)
	
	pathDisplay := m.current.virtualPath
	if pathDisplay == "" {
		pathDisplay = "/"
	}
	m.listModel.Title = fmt.Sprintf("Remote: %s (%s)", m.alias, pathDisplay)
}

func (m *TreeModel) SetSize(width, height int) {
	m.width = width
	m.height = height
	m.listModel.SetSize(width, height)
}

func (m *TreeModel) Update(msg tea.Msg) (TreeModel, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		if m.listModel.FilterState() == list.Filtering {
			break
		}

		switch msg.String() {
		case "esc", "left", "h", "backspace":
			if len(m.history) > 0 {
				m.current = m.history[len(m.history)-1]
				m.history = m.history[:len(m.history)-1]
				m.updateList()
				return *m, nil
			}
			// If history empty, allow event to propagate (MainModel will intercept to go back to remotes)
			
		case "enter", "right", "l":
			selected := m.listModel.SelectedItem()
			if selected != nil {
				i := selected.(treeItem)
				if i.n.name == ".." {
					// Go back
					if len(m.history) > 0 {
						m.current = m.history[len(m.history)-1]
						m.history = m.history[:len(m.history)-1]
						m.updateList()
					}
				} else if i.n.isDir {
					// Go into directory
					m.history = append(m.history, m.current)
					m.current = i.n
					m.updateList()
					m.listModel.ResetSelected()
				}
			}
			
		case "d":
			selected := m.listModel.SelectedItem()
			if selected != nil {
				i := selected.(treeItem)
				if i.n.name != ".." {
					// Trigger download
					return *m, m.download(i.n)
				}
			}
		}
	}

	var cmd tea.Cmd
	m.listModel, cmd = m.listModel.Update(msg)
	return *m, cmd
}

func (m *TreeModel) download(n *node) tea.Cmd {
	// Execute 'teleman download alias:virtualPath .'
	// This suspends the TUI, runs the command, and resumes when done.
	target := fmt.Sprintf("%s:%s", m.alias, n.virtualPath)
	
	cmd := exec.Command("teleman", "download", target, ".")
	return tea.ExecProcess(cmd, func(err error) tea.Msg {
		return nil
	})
}

func (m *TreeModel) View() string {
	return m.listModel.View()
}
